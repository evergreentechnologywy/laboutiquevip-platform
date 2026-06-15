#!/usr/bin/env python3
"""
Photo Migration Script: Migrate provider photos to S3/R2 storage.

Converts AVIF/other images to JPEG via ffmpeg, uploads to S3/R2,
converts existing pre-signed R2 URLs to clean proxy URLs,
and updates the Provider.photos JSONB array in the database.

Usage:
    python3 migrate_photos_to_s3.py [--dry-run] [--batch-size N] [--start-offset N]
"""

import os
import sys
import json
import time
import hashlib
import subprocess
import tempfile
import argparse
import boto3
from botocore.config import Config

# === CONFIGURATION ===
DB_NAME = "trystlike"

# S3/R2 Storage Config (reads from environment variables)
S3_BUCKET = os.environ.get("S3_BUCKET", "openclaw")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_PUBLIC_BASE_URL = os.environ.get("S3_PUBLIC_BASE_URL", "https://www.laboutiquevip.net/api/r2-photo")

# === COUNTERS ===
stats = {
    'total_photos': 0,
    'skipped_s3_proxy': 0,
    'converted_presigned': 0,
    'skipped_discovery_logo': 0,
    'uploaded_to_s3': 0,
    'broken_skipped': 0,
    'upload_failed': 0,
    'providers_updated': 0,
    'providers_skipped_nochange': 0,
    'download_errors': 0,
    'conversion_errors': 0,
}


def run_psql(query):
    """Run a PostgreSQL query and return results."""
    cmd = ['sudo', '-u', 'postgres', 'psql', '-d', DB_NAME, '-At']
    result = subprocess.run(cmd, input=query, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f"  [ERROR] psql failed: {result.stderr}", file=sys.stderr)
        return None
    return result.stdout.strip()


def fetch_all_providers(limit=None, offset=0):
    """Fetch all providers with photos as JSON."""
    query = """SELECT id, photos::text FROM "Provider" 
               WHERE photos IS NOT NULL AND jsonb_typeof(photos) = 'array'
               ORDER BY id"""
    if limit:
        query += f" LIMIT {limit} OFFSET {offset}"
    query += ";"
    
    result = run_psql(query)
    if not result:
        return []
    
    providers = []
    for line in result.split('\n'):
        if not line.strip():
            continue
        parts = line.split('|', 1)
        if len(parts) < 2:
            continue
        try:
            provider_id = parts[0].strip()
            photos = json.loads(parts[1].strip())
            if isinstance(photos, list):
                providers.append((provider_id, photos))
        except (json.JSONDecodeError, IndexError) as e:
            continue
    return providers


def classify_url(url):
    """Classify a photo URL into a category."""
    if not isinstance(url, str):
        return 'invalid', None
    
    if 'r2.cloudflarestorage.com' in url:
        return 'r2_presigned', url
    elif url.startswith('https://www.laboutiquevip.net/api/r2-photo/') or url.startswith('/api/r2-photo/'):
        return 'already_s3_proxy', url
    elif url.startswith('https://imagedelivery.net/'):
        return 'cf_images', url
    elif 'photos.skipsweb.com' in url:
        return 'skipsweb', url
    elif 'media-v2.tryst.a4cdn.org' in url or 'media-v2.tryst.a4cdn.io' in url:
        return 'media_v2', url
    elif 'discovery.tryst.a4cdn.org' in url:
        return 'discovery_logo', url
    elif 'ultragfe.com' in url:
        return 'ultragfe', url
    elif url.startswith('/images/'):
        return 'ultragfe', f"https://ultragfe.com{url}"
    else:
        return 'other', url


def download_image(url, timeout=30):
    """Download an image to a temporary file. Returns temp_path or None."""
    try:
        fd, tmp_path = tempfile.mkstemp(suffix='.img')
        os.close(fd)
        
        result = subprocess.run(
            ['curl', '-s', '-o', tmp_path, '--connect-timeout', '10', 
             '--max-time', str(timeout), url],
            capture_output=True, text=True, timeout=timeout + 5
        )
        
        if result.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
            os.unlink(tmp_path)
            return None
            
        return tmp_path
    except Exception as e:
        return None


def convert_to_jpeg(image_path):
    """Convert image to JPEG using ffmpeg. Returns path to JPEG or None."""
    try:
        fd, jpg_path = tempfile.mkstemp(suffix='.jpg')
        os.close(fd)
        
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', image_path, '-frames:v', '1', 
             '-update', '1', '-q:v', '5', jpg_path],
            capture_output=True, text=True, timeout=30
        )
        
        if result.returncode != 0 or not os.path.exists(jpg_path) or os.path.getsize(jpg_path) == 0:
            os.unlink(jpg_path)
            return None
            
        return jpg_path
    except Exception as e:
        return None


def process_image(provider_id, idx, url, dry_run=False):
    """Process a single photo URL."""
    cat, source_url = classify_url(url)
    
    if cat == 'already_s3_proxy':
        stats['skipped_s3_proxy'] += 1
        return url, 'already_s3_proxy'
        
    if cat == 'r2_presigned':
        try:
            path_part = url.split('?')[0]
            filename = path_part.split('/')[-1]
            proxy_url = f"{S3_PUBLIC_BASE_URL}/{provider_id}/{filename}"
            stats['converted_presigned'] += 1
            return proxy_url, 'converted_presigned'
        except Exception as e:
            stats['broken_skipped'] += 1
            return None, f'presigned_parse_error: {e}'
            
    if cat == 'discovery_logo':
        stats['skipped_discovery_logo'] += 1
        return url, 'skipped_discovery_logo'
        
    if cat in ('cf_images', 'skipsweb', 'media_v2', 'ultragfe', 'other'):
        if not source_url:
            stats['broken_skipped'] += 1
            return None, 'broken_no_source'
            
        if dry_run:
            stats[f'would_fix_{cat}'] = stats.get(f'would_fix_{cat}', 0) + 1
            return f"{S3_PUBLIC_BASE_URL}/{provider_id}/dryrun-{idx}.jpeg", f'dry_run_{cat}'
            
        # Download, convert, and upload
        tmp_img = download_image(source_url)
        if not tmp_img:
            stats['broken_skipped'] += 1
            stats['download_errors'] += 1
            return None, 'download_failed'
            
        tmp_jpg = convert_to_jpeg(tmp_img)
        os.unlink(tmp_img)
        if not tmp_jpg:
            stats['broken_skipped'] += 1
            stats['conversion_errors'] += 1
            return None, 'conversion_failed'
            
        # Upload to R2
        filename = f"{idx:02d}-{hashlib.sha256(source_url.encode()).hexdigest()[:8]}.jpeg"
        key = f"laboutiquevip/providers/{provider_id}/{filename}"
        
        try:
            s3 = boto3.client(
                "s3",
                endpoint_url=S3_ENDPOINT,
                aws_access_key_id=S3_ACCESS_KEY_ID,
                aws_secret_access_key=S3_SECRET_ACCESS_KEY,
                config=Config(signature_version="s3v4")
            )
            s3.upload_file(
                tmp_jpg,
                S3_BUCKET,
                key,
                ExtraArgs={"ContentType": "image/jpeg"}
            )
            os.unlink(tmp_jpg)
            stats['uploaded_to_s3'] += 1
            return f"{S3_PUBLIC_BASE_URL}/{provider_id}/{filename}", f'uploaded_{cat}_to_s3'
        except Exception as e:
            if os.path.exists(tmp_jpg):
                os.unlink(tmp_jpg)
            stats['upload_failed'] += 1
            return None, f's3_upload_error: {e}'
            
    # Unknown/invalid
    stats['broken_skipped'] += 1
    return None, 'invalid_url'


def update_provider_in_db(provider_id, new_photos):
    """Update the Provider.photos JSONB column in the database."""
    photos_json = json.dumps(new_photos)
    query = f"""UPDATE "Provider" 
                SET photos = '{photos_json}'::jsonb,
                    updated_date = NOW()
                WHERE id = '{provider_id}';"""
    result = run_psql(query)
    return result is not None


def process_provider(provider_id, photos, dry_run=False):
    """Process all photos for a single provider."""
    new_photos = []
    changed = False
    
    for idx, url in enumerate(photos):
        stats['total_photos'] += 1
        
        new_url, action = process_image(provider_id, idx, url, dry_run)
        
        if new_url is not None:
            new_photos.append(new_url)
            if new_url != url:
                changed = True
        else:
            changed = True
            
    if changed:
        if not dry_run:
            success = update_provider_in_db(provider_id, new_photos)
            if success:
                stats['providers_updated'] += 1
            else:
                print(f"  [ERROR] Failed to update provider {provider_id}", file=sys.stderr)
        else:
            stats['providers_updated'] += 1
    else:
        stats['providers_skipped_nochange'] += 1


def main():
    parser = argparse.ArgumentParser(description='Migrate provider photos to S3/R2')
    parser.add_argument('--dry-run', action='store_true', 
                        help='Preview changes without modifying the database')
    parser.add_argument('--batch-size', type=int, default=None,
                        help='Number of providers to process (default: all)')
    parser.add_argument('--start-offset', type=int, default=0,
                        help='Start from this provider row number (0-indexed)')
    args = parser.parse_args()
    
    # Load credentials if not in environment
    global S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_PUBLIC_BASE_URL
    if not S3_ACCESS_KEY_ID:
        print("[INFO] Loading credentials from .env file...")
        env_path = "/srv/apps/trystlike/repo/.env"
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    if "=" in line and not line.strip().startswith("#"):
                        key, val = line.strip().split("=", 1)
                        if key.strip() == "S3_BUCKET":
                            S3_BUCKET = val.strip()
                        elif key.strip() == "S3_ACCESS_KEY_ID":
                            S3_ACCESS_KEY_ID = val.strip()
                        elif key.strip() == "S3_SECRET_ACCESS_KEY":
                            S3_SECRET_ACCESS_KEY = val.strip()
                        elif key.strip() == "S3_ENDPOINT":
                            S3_ENDPOINT = val.strip()
                        elif key.strip() == "S3_PUBLIC_BASE_URL":
                            S3_PUBLIC_BASE_URL = val.strip()

    dry_run = args.dry_run
    print(f"{'[DRY RUN]' if dry_run else '[LIVE]'} S3 Photo Migration Script")
    print(f"S3 Endpoint: {S3_ENDPOINT}")
    print(f"S3 Bucket:   {S3_BUCKET}")
    print(f"{'='*60}")
    
    if not S3_ACCESS_KEY_ID or not S3_SECRET_ACCESS_KEY or not S3_ENDPOINT:
        print("[ERROR] S3 credentials or endpoint not found. Exiting.", file=sys.stderr)
        return
        
    # Fetch providers
    print("\nFetching providers with photos from database...")
    providers = fetch_all_providers(limit=args.batch_size, offset=args.start_offset)
    print(f"Found {len(providers)} providers to process")
    
    if not providers:
        print("No providers found. Exiting.")
        return
        
    start_time = time.time()
    for i, (provider_id, photos) in enumerate(providers):
        if (i + 1) % 25 == 0 or i == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            mins_rem = (len(providers) - i - 1) / rate / 60 if rate > 0 else 0
            print(f"  Progress: {i+1}/{len(providers)} providers "
                  f"({rate:.1f}/s, {elapsed:.0f}s elapsed, ~{mins_rem:.0f}min remaining)")
                  
        process_provider(provider_id, photos, dry_run)
        
    elapsed = time.time() - start_time
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"{'[DRY RUN] ' if dry_run else '[LIVE] '}MIGRATION SUMMARY")
    print(f"{'='*60}")
    print(f"  Total photos processed:       {stats['total_photos']}")
    print(f"  Providers updated:            {stats['providers_updated']}")
    print(f"  Providers unchanged:          {stats['providers_skipped_nochange']}")
    print(f"")
    print(f"  Converted pre-signed R2 links: {stats['converted_presigned']}")
    print(f"  Uploaded new photos to S3:    {stats['uploaded_to_s3']}")
    print(f"  Skipped (already proxy):      {stats['skipped_s3_proxy']}")
    print(f"  Skipped (discovery logos):    {stats['skipped_discovery_logo']}")
    print(f"  Broken - download failed:     {stats['download_errors']}")
    print(f"  Broken - conversion failed:   {stats['conversion_errors']}")
    print(f"  Upload failed:                {stats['upload_failed']}")
    print(f"")
    print(f"  Elapsed time:                 {elapsed:.1f}s ({elapsed/60:.1f}min)")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
