#!/usr/bin/env node
const JINA = "https://r.jina.ai/http://";
const PROFILE_RE = /https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s)]+\/files\/\d+\.htm/gi;

async function mirror(url) {
  const res = await fetch(`${JINA}${url.replace(/^https?:\/\//i, "")}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; lbv-probe/1.0)" },
  });
  return res.ok ? res.text() : "";
}

function hubKey(url) {
  const m = url.toLowerCase().match(/eros\.com\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\//);
  if (!m) return null;
  const state = m[1];
  let city = m[2] ?? state;
  if (city === "files" || city === "sections") city = state;
  return `${state}/${city}`;
}

function belongs(url, hub) {
  const u = url.toLowerCase();
  if (hub === "florida/miami") return u.includes("/florida/miami/");
  if (hub === "north_carolina/charlotte") return u.includes("/north_carolina/charlotte/");
  return false;
}

const hub = process.argv[2] || "florida/miami";

// sitemap profiles shard 1 sample
let sitemapCount = 0;
for (let shard = 1; shard <= 3; shard++) {
  const text = await mirror(`https://www.eros.com/sitemap-profiles-${shard}.xml`);
  const urls = [...(text.match(PROFILE_RE) ?? [])];
  sitemapCount += urls.filter((u) => belongs(u, hub)).length;
  if (!text || urls.length === 0) break;
}

// sections sitemap
const sectionsText = await mirror("https://www.eros.com/sitemap-sections.xml");
const sectionUrls = [...new Set((sectionsText.match(/https?:\/\/www\.eros\.com\/[^\s)]+\/sections\/[^\s)]+\.htm/gi) ?? []))]
  .filter((u) => belongs(u, hub));

let sectionProfiles = 0;
for (const sectionUrl of sectionUrls.slice(0, 3)) {
  const text = await mirror(sectionUrl);
  sectionProfiles += new Set(text.match(PROFILE_RE) ?? []).size;
}

console.log(JSON.stringify({ hub, sitemapSampleProfiles: sitemapCount, sectionPages: sectionUrls.length, sectionProfilesSample3: sectionProfiles }, null, 2));
