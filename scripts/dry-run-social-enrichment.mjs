#!/usr/bin/env node
/**
 * Dry-run script for social media enrichment on 50 providers.
 * Tests the extract-contact-and-social-from-markdown function with sample profile content.
 * 
 * Usage: node scripts/dry-run-social-enrichment.mjs
 * 
 * This script simulates the social media extraction process and reports counts
 * of links found per source type without making any database writes.
 */

import { extractContactAndSocialFromMarkdown, mergeImportedSocial } from "./lib/extract-social-links.mjs";

// Sample Eros profile content (simulated)
const SAMPLE_EROS_PROFILES = [
  `
# VIP Model in Miami FL - Eros.com
Phone: (305) 555-1234
Email: model@example.com

Follow me:
[Instagram](https://instagram.com/vipmodel)
[OnlyFans](https://onlyfans.com/vipmodel)
[Linktree](https://linktr.ee/vipmodel)
[X](https://x.com/vipmodel)

Review me:
[The Erotic Review](https://theeroticreview.com/model/miami)
[Private Delights](https://privatedelights.ch/model/miami)

Website: https://vipmodel.com
  `,
  `
# VIP Model in New York NY - Eros.com
Phone: (212) 555-5678
Email: nycmodel@example.com

Social:
[Instagram](https://instagram.com/nycmodel)
[TikTok](https://tiktok.com/@nycmodel)
[Telegram](https://t.me/nycmodel)
[WhatsApp](https://wa.me/12125555678)

Reviews:
[The Erotic Review](https://theeroticreview.com/model/nyc)
[The Other Board](https://theotherboard.com/model/nyc)

Website: https://nycmodel.com
  `,
  `
# VIP Model in Los Angeles CA - Eros.com
Phone: (310) 555-9012
Email: lamodel@example.com

Links:
[Instagram](https://instagram.com/lamodel)
[X](https://x.com/lamodel)
[OnlyFans](https://onlyfans.com/lamodel)
[Fansly](https://fansly.com/lamodel)

Reviews:
[Private Delights](https://privatedelights.com/model/la)

Website: https://lamodel.com
  `,
];

// Sample Tryst profile content (simulated)
const SAMPLE_TRYST_PROFILES = [
  `
# Miami Angel

Miami, FL, US

Phone: (305) 555-4321
Email: miamiangel@example.com

Follow me:
[Instagram](https://instagram.com/miamiangel)
[OnlyFans](https://onlyfans.com/miamiangel)
[X](https://x.com/miamiangel)

Reviews:
[The Erotic Review](https://theeroticreview.com/model/miami-angel)

Website: https://miamiangel.com
  `,
  `
# NYC Goddess

New York, NY, US

Phone: (212) 555-8765
Email: nycgoddess@example.com

Social:
[Instagram](https://instagram.com/nycgoddess)
[TikTok](https://tiktok.com/@nycgoddess)
[Telegram](https://t.me/nycgoddess)

Reviews:
[Private Delights](https://privatedelights.ch/model/nyc-goddess)

Website: https://nycgoddess.com
  `,
];

// Combine samples to simulate 50 providers (repeat with variations)
function generateTestProfiles() {
  const profiles = [];
  for (let i = 0; i < 50; i++) {
    const source = i % 2 === 0 ? "eros" : "tryst";
    const sampleIndex = i % (source === "eros" ? SAMPLE_EROS_PROFILES.length : SAMPLE_TRYST_PROFILES.length);
    const profile = source === "eros" ? SAMPLE_EROS_PROFILES[sampleIndex] : SAMPLE_TRYST_PROFILES[sampleIndex];
    
    // Add variation to make each profile unique
    const variedProfile = profile
      .replace(/model@example\.com/, `model${i}@example.com`)
      .replace(/\(305\) 555-1234/, `(305) 555-${String(i).padStart(4, "0")}`)
      .replace(/instagram\.com\/vipmodel/, `instagram.com/model${i}`)
      .replace(/onlyfans\.com\/vipmodel/, `onlyfans.com/model${i}`)
      .replace(/linktr\.ee\/vipmodel/, `linktr.ee/model${i}`)
      .replace(/x\.com\/vipmodel/, `x.com/model${i}`)
      .replace(/theeroticreview\.com\/model\/miami/, `theeroticreview.com/model/miami-${i}`)
      .replace(/privatedelights\.ch\/model\/miami/, `privatedelights.ch/model/miami-${i}`)
      .replace(/vipmodel\.com/, `model${i}.com`);
    
    profiles.push({
      id: `test-${i}`,
      source,
      content: variedProfile,
    });
  }
  return profiles;
}

async function runDryRun() {
  console.log("=== Social Media Enrichment Dry-Run ===\n");
  console.log("Testing extraction on 50 simulated providers...\n");

  const profiles = generateTestProfiles();
  const stats = {
    total: profiles.length,
    bySource: { eros: 0, tryst: 0 },
    socialMedia: {
      instagram: 0,
      twitter: 0,
      onlyfans: 0,
      fansly: 0,
      telegram: 0,
      whatsapp: 0,
      tiktok: 0,
      linktree: 0,
      website: 0,
      extra_links: 0,
    },
    reviewLinks: {
      ter: 0,
      pd: 0,
      tob: 0,
      p411: 0,
      total_review_links: 0,
    },
    contactInfo: {
      phone: 0,
      email: 0,
    },
    errors: 0,
  };

  for (const profile of profiles) {
    try {
      stats.bySource[profile.source]++;
      
      const result = extractContactAndSocialFromMarkdown(profile.content);
      
      // Count social media platforms
      if (result.social_media.instagram) stats.socialMedia.instagram++;
      if (result.social_media.twitter) stats.socialMedia.twitter++;
      if (result.social_media.onlyfans) stats.socialMedia.onlyfans++;
      if (result.social_media.fansly) stats.socialMedia.fansly++;
      if (result.social_media.telegram) stats.socialMedia.telegram++;
      if (result.social_media.whatsapp) stats.socialMedia.whatsapp++;
      if (result.social_media.tiktok) stats.socialMedia.tiktok++;
      if (result.social_media.linktree) stats.socialMedia.linktree++;
      if (result.social_media.website) stats.socialMedia.website++;
      if (result.social_media.extra_links) stats.socialMedia.extra_links++;
      
      // Count review links
      if (result.social_media.ter_url) stats.reviewLinks.ter++;
      if (result.social_media.pd_url) stats.reviewLinks.pd++;
      if (result.social_media.tob_url) stats.reviewLinks.tob++;
      if (result.social_media.p411_url) stats.reviewLinks.p411++;
      if (result.social_media.review_links) {
        stats.reviewLinks.total_review_links += result.social_media.review_links.length;
      }
      
      // Count contact info
      if (result.phone) stats.contactInfo.phone++;
      if (result.email) stats.contactInfo.email++;
      
    } catch (error) {
      stats.errors++;
      console.error(`Error processing profile ${profile.id}: ${error.message}`);
    }
  }

  // Print results
  console.log("=== Results ===\n");
  console.log(`Total profiles tested: ${stats.total}`);
  console.log(`By source: Eros=${stats.bySource.eros}, Tryst=${stats.bySource.tryst}`);
  console.log(`Errors: ${stats.errors}\n`);
  
  console.log("=== Social Media Links Found ===");
  console.log(`Instagram: ${stats.socialMedia.instagram}`);
  console.log(`Twitter/X: ${stats.socialMedia.twitter}`);
  console.log(`OnlyFans: ${stats.socialMedia.onlyfans}`);
  console.log(`Fansly: ${stats.socialMedia.fansly}`);
  console.log(`Telegram: ${stats.socialMedia.telegram}`);
  console.log(`WhatsApp: ${stats.socialMedia.whatsapp}`);
  console.log(`TikTok: ${stats.socialMedia.tiktok}`);
  console.log(`Linktree: ${stats.socialMedia.linktree}`);
  console.log(`Website: ${stats.socialMedia.website}`);
  console.log(`Extra links: ${stats.socialMedia.extra_links}\n`);
  
  console.log("=== Review Links Found ===");
  console.log(`TER (The Erotic Review): ${stats.reviewLinks.ter}`);
  console.log(`PD (Private Delights): ${stats.reviewLinks.pd}`);
  console.log(`TOB (The Other Board): ${stats.reviewLinks.tob}`);
  console.log(`P411 (Preferred411): ${stats.reviewLinks.p411}`);
  console.log(`Total review links in review_links array: ${stats.reviewLinks.total_review_links}\n`);
  
  console.log("=== Contact Info Found ===");
  console.log(`Phone numbers: ${stats.contactInfo.phone}`);
  console.log(`Email addresses: ${stats.contactInfo.email}\n`);
  
  console.log("=== Sample Output (First Profile) ===");
  const sampleResult = extractContactAndSocialFromMarkdown(profiles[0].content);
  console.log(JSON.stringify(sampleResult, null, 2));
  
  console.log("\n=== Dry-Run Complete ===");
  console.log("No database writes were made. This was a read-only test.");
  
  return stats;
}

// Run the dry-run
runDryRun().catch((error) => {
  console.error("Dry-run failed:", error);
  process.exit(1);
});
