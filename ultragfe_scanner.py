#!/usr/bin/env python3
"""
Ultra GFE Scanner — weekly crawl of ultragfe.com to find new providers
and import them into laboutiquevip.net's Provider table.

Architecture
────────────
Level 1: Browse States    → /browse/{state}.html        (lists cities)
Level 2: City Listings    → /location/{city}-{state}.html (lists providers, may have ?page=N)
Level 3: Provider Profile → /provider/{id}-{name}.html   (phone, email, photos, reviews, tags)

Strategy
────────
- Parse static HTML pages with simple regex/BeautifulSoup.
- Skip providers already in our DB (match by phone or email).
- Save photos to CF Images.
- Update existing Provider records or create new ones.
- Run weekly via cron.
"""

import os
import re
import sys
import json
import time
import uuid
import hashlib
import logging
import subprocess
import tempfile
import boto3
from botocore.config import Config
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone

# ── Config ──────────────────────────────────────────────────────────────────
BASE_URL = "https://ultragfe.com"
DB_NAME = "trystlike"

# S3/R2 Config
S3_BUCKET = os.environ.get("S3_BUCKET", "openclaw")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_PUBLIC_BASE_URL = os.environ.get("S3_PUBLIC_BASE_URL", "https://www.laboutiquevip.net/api/r2-photo")

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger(__name__)

# ── State tracking ──────────────────────────────────────────────────────────
stats = {
    "states_scanned": 0,
    "cities_scanned": 0,
    "providers_found": 0,
    "providers_new": 0,
    "providers_existing": 0,
    "providers_imported": 0,
    "photos_downloaded": 0,
    "photos_uploaded": 0,
    "errors": 0,
    "start_time": None,
}

# ── Helpers ─────────────────────────────────────────────────────────────────

def curl(url, timeout=30):
    """Fetch a URL via curl and return body as text."""
    try:
        result = subprocess.run(
            ["curl", "-sL", "--connect-timeout", "10", "--max-time", str(timeout), url],
            capture_output=True, text=True, timeout=timeout + 5,
        )
        return result.stdout if result.returncode == 0 else None
    except Exception:
        return None


def extract_between(text, start, end):
    """Simple regex extraction between two markers."""
    pattern = re.escape(start) + r"(.*?)" + re.escape(end)
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1).strip() if m else None


def run_psql(query):
    """Run a PostgreSQL query and return tab-separated results."""
    cmd = ['sudo', '-u', 'postgres', 'psql', '-d', DB_NAME, '-At']
    result = subprocess.run(cmd, input=query, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        log.error(f"psql failed: {result.stderr}")
        return None
    return result.stdout.strip()


# ── Level 1: Browse States ──────────────────────────────────────────────────

def get_state_list():
    """Fetch /browse/ and extract all state slugs + names."""
    html = curl(f"{BASE_URL}/browse/")
    if not html:
        log.error("Failed to fetch /browse/")
        return []

    states = []
    # Match: <a href="/browse/{slug}.html" class="state-*">...<div class="name">State Name</div>
    pattern = r'href="(/browse/([a-z-]+)\.html)"[^>]*class="state-[^"]*"[^>]*.*?<div class="name">([^<]+)</div>'
    for m in re.finditer(pattern, html, re.DOTALL):
        state_path = m.group(1).strip()
        slug = m.group(2).strip()
        state_name = m.group(3).strip()
        states.append({"name": state_name, "slug": slug, "url": f"{BASE_URL}{state_path}"})

    log.info(f"Found {len(states)} states")
    return states


# ── Level 2: City Listings ──────────────────────────────────────────────────

def get_city_list(state_url):
    """Fetch a state page and extract all city links."""
    html = curl(state_url)
    if not html:
        log.error(f"Failed to fetch {state_url}")
        return []

    cities = []
    # Match: <a href="/location/{city-state}.html" class="city-card">
    #          <span class="city-name">City, STATE</span>
    pattern = r'href="(/location/[^"]+\.html)"[^>]*class="city-card"[^>]*>.*?<span class="city-name">([^<]+)</span>'
    for m in re.finditer(pattern, html, re.DOTALL):
        city_path = m.group(1).strip()
        city_text = m.group(2).strip()
        city_name = city_text.split(",")[0].strip()
        cities.append({
            "name": city_name,
            "url": f"{BASE_URL}{city_path}",
            "path": city_path,
        })

    log.info(f"  Found {len(cities)} cities")
    return cities


def get_provider_listings(city_url):
    """Fetch a city listing page and extract all provider URLs + metadata.
    Handles pagination (?page=N).
    """
    providers = []
    page = 1

    while True:
        url = city_url if page == 1 else city_url.replace(".html", f"-page{page}.html")
        html = curl(url)
        if not html:
            if page > 1:
                break
            log.error(f"Failed to fetch {url}")
            break

        # Extract provider links
        # Match: <a href="/provider/{id}-{name}.html" class="provider-card" data-name="...">
        pattern = r'href="(/provider/(\d+)-[^"]+\.html)"[^>]*class="provider-card"[^>]*>'
        for m in re.finditer(pattern, html):
            profile_path = m.group(1).strip()
            provider_id = m.group(2)
            providers.append({
                "id": provider_id,
                "url": f"{BASE_URL}{profile_path}",
                "path": profile_path,
            })

        # Check for next page
        if f"-page{page + 1}.html" not in html and f"page={page + 1}" not in html:
            break

        page += 1
        time.sleep(0.5)

    return providers


# ── Level 3: Provider Profile ───────────────────────────────────────────────

def parse_provider_profile(provider_url):
    """Fetch and parse a single provider profile page.
    
    Returns a dict with extracted fields or None on failure.
    """
    html = curl(provider_url)
    if not html:
        return None

    profile = {}

    # Name — from <h1>
    m = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    if m:
        profile["display_name"] = m.group(1).strip()

    # Phone — from tel: links
    m = re.search(r'href="tel:([^"]+)"', html)
    if m:
        profile["phone"] = m.group(1).strip()
    
    # If no tel link, try text pattern like 📞 (323) 744-5368
    if not profile.get("phone"):
        m = re.search(r'\(?(\d{3})\)?[. ]?(\d{3})[. ]?(\d{4})', html)
        if m:
            profile["phone"] = f"({m.group(1)}) {m.group(2)}-{m.group(3)}"

    # Email — from mailto: links
    m = re.search(r'href="mailto:([^"]+)"', html)
    if m:
        profile["email"] = m.group(1).strip()

    # City & State from breadcrumbs
    parts = re.findall(r'<a[^>]*>([^<]+)</a>', html)
    # Breadcrumbs are typically: All States > California > Los Angeles
    state_city = []
    for p in parts:
        p = p.strip()
        if p not in ("🗺️ All States", "All States", "Home", "Ultra GFE", "Browse States"):
            state_city.append(p)
    if len(state_city) >= 2:
        profile["state"] = state_city[-2] if len(state_city) >= 2 else ""
        profile["city"] = state_city[-1] if len(state_city) >= 1 else ""

    # Photos — extract all img tags with ultragfe.com/images/ or photos.skipsweb.com URLs
    photos = []
    for m in re.finditer(r'<img[^>]+src="([^"]+)"', html):
        src = m.group(1)
        if "/images/" in src or "photos.skipsweb.com" in src or "imagedelivery.net" in src:
            photos.append(src)
    profile["photos"] = list(set(photos))  # deduplicate

    # Tags/categories — from the page title or heading
    title_m = re.search(r'<title>([^<]+)</title>', html)
    if title_m:
        title = title_m.group(1)
        # Extract tags like "companion/Massage/S&M" from title
        tag_m = re.search(r'^([^-]+)', title)
        if tag_m:
            tags_raw = tag_m.group(1).strip()
            profile["tags"] = [t.strip() for t in tags_raw.split("/")]
        else:
            profile["tags"] = []
    else:
        profile["tags"] = []

    # Review count and rating from text like "⭐ 122 reviews"
    m = re.search(r'⭐\s*(\d+)\s*reviews?', html)
    if m:
        profile["review_count"] = int(m.group(1))

    # Age from text pattern "X years" 
    m = re.search(r'(\d+)\s*years?\b', html)
    if m:
        profile["age"] = int(m.group(1))

    # Headline/ad text
    m = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]+)"', html)
    if m:
        profile["bio"] = m.group(1).strip()

    # TER profile link
    m = re.search(r'href="(https://[^"]*theeroticreview[^"]*|[^"]*ter[^"]*)"', html, re.I)
    if m:
        profile["ter_url"] = m.group(1)

    return profile


# ── Database operations ─────────────────────────────────────────────────────

def provider_exists_by_phone(phone):
    """Check if a provider with the given phone already exists."""
    if not phone:
        return False
    # Strip formatting
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 10:
        return False
    result = run_psql(f"""
        SELECT COUNT(*) FROM "Provider" 
        WHERE phone IS NOT NULL 
        AND regexp_replace(phone, '\\D', '', 'g') LIKE '%{digits}'
    """)
    return result and int(result) > 0


def provider_exists_by_email(email):
    """Check if a provider with the given email already exists."""
    if not email:
        return False
    result = run_psql(f"""
        SELECT COUNT(*) FROM "Provider"
        WHERE email = '{email.replace("'", "''")}'
    """)
    return result and int(result) > 0


def insert_provider(profile):
    """Insert a new provider into the Provider table."""
    provider_id = profile["id"]
    display_name = (profile.get("display_name") or "Unknown").replace("'", "''")
    city = (profile.get("city") or "").replace("'", "''")
    state = (profile.get("state") or "").replace("'", "''")
    phone = (profile.get("phone") or "").replace("'", "''")
    email = (profile.get("email") or "").replace("'", "''")
    bio = (profile.get("bio") or "").replace("'", "''")
    age = profile.get("age") or "NULL"
    review_count = profile.get("review_count") or 0
    photos_json = json.dumps(profile.get("photos", []))
    tags_json = json.dumps(profile.get("tags", []))

    query = f"""
    INSERT INTO "Provider" (
        id, display_name, location_city, location_state, phone, email,
        bio, age, reviews_count, photos, services_offered, 
        status, is_verified, is_profile_approved, created_date, updated_date
    ) VALUES (
        '{provider_id}', '{display_name}', '{city}', '{state}', '{phone}', '{email}',
        '{bio}', {age}, {review_count}, '{photos_json}'::jsonb, '{tags_json}'::jsonb,
        'active', true, true, NOW(), NOW()
    );
    """
    result = run_psql(query)
    return result is not None


def import_photo_to_s3(image_url, provider_id, idx):
    """Download an image from ultragfe, convert if needed, and upload to S3/R2.
    Returns the public proxy URL or None.
    """
    try:
        # Download
        fd, tmp_img = tempfile.mkstemp(suffix=".img")
        os.close(fd)
        result = subprocess.run(
            ["curl", "-sL", "-o", tmp_img, "--connect-timeout", "10", "--max-time", "30", image_url],
            capture_output=True, text=True, timeout=35,
        )
        if result.returncode != 0 or not os.path.getsize(tmp_img):
            os.unlink(tmp_img)
            return None

        # Check if AVIF — convert to JPEG
        img_file = tmp_img
        if image_url.endswith(".avif"):
            fd2, jpg_path = tempfile.mkstemp(suffix=".jpg")
            os.close(fd2)
            conv = subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_img, "-frames:v", "1", "-update", "1", "-q:v", "5", jpg_path],
                capture_output=True, text=True, timeout=30,
            )
            if conv.returncode == 0 and os.path.getsize(jpg_path):
                os.unlink(tmp_img)
                img_file = jpg_path
            else:
                os.unlink(jpg_path)

        # Generate deterministic/safe filename
        filename = f"{idx:02d}-{hashlib.sha256(image_url.encode()).hexdigest()[:8]}.jpeg"
        key = f"laboutiquevip/providers/{provider_id}/{filename}"

        # Initialize boto3 S3 Client
        s3 = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4")
        )

        s3.upload_file(
            img_file,
            S3_BUCKET,
            key,
            ExtraArgs={"ContentType": "image/jpeg"}
        )
        os.unlink(img_file)

        stats["photos_uploaded"] += 1
        return f"{S3_PUBLIC_BASE_URL}/{provider_id}/{filename}"

    except Exception as e:
        log.warning(f"  Photo S3 import error for {image_url}: {e}")
        return None


# ── Main Scanner ────────────────────────────────────────────────────────────

def scan_once(dry_run=False):
    """Run one complete scan cycle."""
    stats["start_time"] = time.time()
    log.info(f"{'[DRY RUN]' if dry_run else '[LIVE]'} Starting Ultragfe scan")

    # Level 1: Get all states
    states = get_state_list()
    if not states:
        log.error("No states found, aborting")
        return

    stats["states_scanned"] = len(states)

    for state in states:
        log.info(f"State: {state['name']} ({state['slug']})")

        # Level 2: Get cities for this state
        cities = get_city_list(state["url"])
        stats["cities_scanned"] += len(cities)

        for city in cities:
            log.info(f"  City: {city['name']}")

            # Level 3: Get provider listings for this city
            providers = get_provider_listings(city["url"])
            stats["providers_found"] += len(providers)

            for prov in providers:
                # Quick check: does this provider look new?
                # We check by ID first (from URL), then by phone later
                stats["providers_new"] += 1

                if dry_run:
                    log.info(f"    [DRY RUN] Would scan: {prov['url']}")
                    continue

                # Fetch full profile
                profile = parse_provider_profile(prov["url"])
                if not profile:
                    stats["errors"] += 1
                    continue

                # Check if exists by phone or email
                phone = profile.get("phone", "")
                email = profile.get("email", "")
                if provider_exists_by_phone(phone) or provider_exists_by_email(email):
                    stats["providers_existing"] += 1
                    continue

                # Generate explicit UUID for provider
                provider_id = str(uuid.uuid4())
                profile["id"] = provider_id

                # Import photos to S3/R2
                if profile.get("photos"):
                    new_photos = []
                    for i, photo_url in enumerate(profile["photos"]):
                        s3_url = import_photo_to_s3(photo_url, provider_id, i)
                        if s3_url:
                            new_photos.append(s3_url)
                        stats["photos_downloaded"] += 1
                        time.sleep(0.3)  # rate limit
                    profile["photos"] = new_photos

                # Insert into DB
                success = insert_provider(profile)
                if success:
                    stats["providers_imported"] += 1
                    log.info(f"    IMPORTED: {profile.get('display_name', '?')} in {profile.get('city', '?')}, {profile.get('state', '?')}")
                else:
                    stats["errors"] += 1
                    log.error(f"    FAILED to import: {prov['url']}")

                time.sleep(1)  # be polite between providers

    # Summary
    elapsed = time.time() - stats["start_time"]
    log.info(f"{'='*60}")
    log.info(f"SCAN COMPLETE — {elapsed:.0f}s ({elapsed/60:.1f}min)")
    log.info(f"  States scanned:     {stats['states_scanned']}")
    log.info(f"  Cities found:       {stats['cities_scanned']}")
    log.info(f"  Providers found:    {stats['providers_found']}")
    log.info(f"  Providers new:      {stats['providers_new']}")
    log.info(f"  Already existing:   {stats['providers_existing']}")
    log.info(f"  Imported:           {stats['providers_imported']}")
    log.info(f"  Photos downloaded:  {stats['photos_downloaded']}")
    log.info(f"  Photos on CF:       {stats['photos_uploaded']}")
    log.info(f"  Errors:             {stats['errors']}")
    log.info(f"{'='*60}")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    scan_once(dry_run=dry_run)
