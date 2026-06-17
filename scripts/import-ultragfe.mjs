#!/usr/bin/env node
/**
 * Ultragfe importer for laboutiquevip.net
 *
 * Crawls ultragfe.com and upserts provider content into the Provider table.
 * Uses Prisma directly for database integration.
 */

const BASE_URL = "https://ultragfe.com";
const MAX_PROVIDER_PHOTOS = 32;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const options = {
  dryRun: args.has("dry-run"),
  state: args.get("state") ?? null,
  maxStates: Number(args.get("max-states") ?? "0"),
  maxCities: Number(args.get("max-cities") ?? "0"),
  maxProviders: Number(args.get("max-providers") ?? "0"),
  delayMs: Number(args.get("delay-ms") ?? "350"),
};

const dynamicImport = new Function(
  "modulePath",
  "return import(modulePath)",
);

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("../backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    // Fall through to default package import.
  }

  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) {
    throw new Error("PrismaClient not available. Run `npm run db:generate`.");
  }
  return new runtime.PrismaClient();
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const prisma = hasDatabaseUrl ? await createPrismaClient() : null;

const stats = {
  states: 0,
  cities: 0,
  providerCards: 0,
  profilesFetched: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlDecode(input) {
  if (!input) return input;
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripTags(input) {
  return htmlDecode((input ?? "").replaceAll(/<[^>]*>/g, "").trim());
}

function normalizePhone(phone) {
  const digits = (phone ?? "").replaceAll(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function fetchText(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-importer/1.0)",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function matchAll(regex, text) {
  return [...text.matchAll(regex)];
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function getStates() {
  const html = await fetchText(`${BASE_URL}/browse/`);
  if (!html) return [];

  const matches = matchAll(
    /href="(\/browse\/([a-z-]+)\.html)"[^>]*class="state-[^"]*"[\s\S]*?<div class="name">([^<]+)<\/div>/g,
    html,
  );

  const states = matches.map((m) => ({
    slug: m[2].trim(),
    name: stripTags(m[3]),
    url: `${BASE_URL}${m[1]}`,
  }));
  return uniqBy(states, (s) => s.slug);
}

async function getCities(stateUrl) {
  const html = await fetchText(stateUrl);
  if (!html) return [];

  const matches = matchAll(
    /href="(\/location\/[^"]+\.html)"[^>]*class="city-card"[\s\S]*?<span class="city-name">([^<]+)<\/span>/g,
    html,
  );

  const cities = matches.map((m) => {
    const cityText = stripTags(m[2]);
    return {
      name: cityText.split(",")[0]?.trim() ?? cityText,
      url: `${BASE_URL}${m[1]}`,
    };
  });
  return uniqBy(cities, (c) => c.url);
}

async function getProviderCards(cityUrl) {
  const cards = [];
  const seenSourceIds = new Set();
  let page = 1;

  while (true) {
    const pageUrl =
      page === 1 ? cityUrl : cityUrl.replace(".html", `-page${page}.html`);
    const html = await fetchText(pageUrl);
    if (!html) break;

    const matches = matchAll(
      /href="(\/provider\/(\d+)-[^"]+\.html)"[^>]*class="provider-card"/g,
      html,
    );

    if (matches.length === 0 && page > 1) break;
    for (const m of matches) {
      if (seenSourceIds.has(m[2])) continue;
      seenSourceIds.add(m[2]);
      cards.push({
        sourceId: m[2],
        url: `${BASE_URL}${m[1]}`,
      });
    }

    const hasNext =
      html.includes(`-page${page + 1}.html`) || html.includes(`page=${page + 1}`);
    if (!hasNext) break;
    page += 1;
    await sleep(200);
  }

  return cards;
}

function parseProfile(html, sourceUrl) {
  const profile = {
    sourceUrl,
    display_name: null,
    phone: null,
    email: null,
    location_city: null,
    location_state: null,
    bio: null,
    reviews_count: 0,
    age: null,
    services_offered: [],
    photos: [],
    review_url: null,
  };

  const name = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1];
  profile.display_name = stripTags(name ?? "") || null;

  const phoneHref = html.match(/href="tel:([^"]+)"/i)?.[1];
  const phoneText = html.match(/\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/)?.[0];
  profile.phone = (phoneHref ?? phoneText ?? "").trim() || null;

  const email = html.match(/href="mailto:([^"]+)"/i)?.[1];
  profile.email = (email ?? "").trim().toLowerCase() || null;

  const breadcrumbAnchors = matchAll(/<a[^>]*>([^<]+)<\/a>/g, html)
    .map((m) => stripTags(m[1]))
    .filter(
      (x) =>
        x &&
        !["All States", "Browse States", "Home", "Ultra GFE", "🗺️ All States"].includes(
          x,
        ),
    );
  if (breadcrumbAnchors.length >= 2) {
    profile.location_state = breadcrumbAnchors[breadcrumbAnchors.length - 2];
    profile.location_city = breadcrumbAnchors[breadcrumbAnchors.length - 1];
  }

  const metaDesc = html.match(
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
  )?.[1];
  profile.bio = stripTags(metaDesc ?? "") || null;

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  if (title) {
    const firstSegment = title.split("-")[0]?.trim() ?? "";
    profile.services_offered = firstSegment
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 15);
  }

  const reviews = html.match(/⭐\s*(\d+)\s*reviews?/i)?.[1];
  profile.reviews_count = Number(reviews ?? 0) || 0;

  const age = html.match(/\b(\d{2})\s*years?\b/i)?.[1];
  if (age) {
    const parsedAge = Number(age);
    if (parsedAge >= 18 && parsedAge <= 99) profile.age = parsedAge;
  }

  const photoCandidates = matchAll(/<img[^>]+src="([^"]+)"/gi, html).map(
    (m) => m[1].trim(),
  );
  profile.photos = [...new Set(photoCandidates)]
    .filter((src) =>
      ["/images/", "photos.skipsweb.com", "imagedelivery.net"].some((token) =>
        src.includes(token),
      ),
    )
    .map((src) => (src.startsWith("http") ? src : new URL(src, BASE_URL).toString()))
    .slice(0, MAX_PROVIDER_PHOTOS);

  const ter = html.match(/href="([^"]*theeroticreview[^"]*)"/i)?.[1];
  profile.review_url = ter ?? null;

  return profile;
}

async function findExistingProvider(profile) {
  if (!prisma) return null;
  if (profile.email) {
    const byEmail = await prisma.provider.findFirst({
      where: { email: { equals: profile.email, mode: "insensitive" } },
    });
    if (byEmail) return byEmail;
  }

  const phoneDigits = normalizePhone(profile.phone);
  if (phoneDigits) {
    const byPhone = await prisma.$queryRaw`
      SELECT *
      FROM "Provider"
      WHERE phone IS NOT NULL
        AND regexp_replace(phone, '\D', '', 'g') LIKE ${`%${phoneDigits}`}
      LIMIT 1
    `;
    if (Array.isArray(byPhone) && byPhone.length > 0) return byPhone[0];
  }

  return null;
}

function buildProviderPayload(profile, existing = null) {
  const mergedPhotos = Array.isArray(existing?.photos)
    ? [...new Set([...existing.photos, ...profile.photos])].slice(0, MAX_PROVIDER_PHOTOS)
    : profile.photos;

  return {
    display_name: profile.display_name ?? existing?.display_name ?? "Unknown",
    bio: profile.bio ?? existing?.bio ?? null,
    location_city: profile.location_city ?? existing?.location_city ?? null,
    location_state: profile.location_state ?? existing?.location_state ?? null,
    age: profile.age ?? existing?.age ?? null,
    phone: profile.phone ?? existing?.phone ?? null,
    email: profile.email ?? existing?.email ?? null,
    reviews_count: profile.reviews_count ?? existing?.reviews_count ?? 0,
    services_offered: profile.services_offered ?? existing?.services_offered ?? [],
    photos: mergedPhotos,
    verification_provider: "ultragfe",
    verification_url: profile.sourceUrl,
    review_provider: "ultragfe",
    review_url: profile.review_url ?? existing?.review_url ?? null,
    ad_headline: profile.display_name ?? existing?.ad_headline ?? null,
    ad_body: profile.bio ?? existing?.ad_body ?? null,
  };
}

async function importProfile(profile) {
  if (!prisma && options.dryRun) {
    // Crawl-only dry run mode when DATABASE_URL is not configured locally.
    stats.created += 1;
    return;
  }
  if (!prisma) {
    throw new Error("DATABASE_URL is required for live import.");
  }

  const existing = await findExistingProvider(profile);

  if (existing) {
    stats.updated += 1;
    if (options.dryRun) return;

    const data = buildProviderPayload(profile, existing);
    await prisma.provider.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  stats.created += 1;
  if (options.dryRun) return;

  const data = buildProviderPayload(profile, null);
  await prisma.provider.create({
    data: {
      ...data,
      status: "active",
      is_verified: true,
      is_profile_approved: true,
      is_premium: false,
    },
  });
}

function enforceLimit(current, max) {
  return max > 0 && current >= max;
}

async function run() {
  const startedAt = Date.now();
  console.log(
    `[import-ultragfe] start dryRun=${options.dryRun} state=${options.state ?? "ALL"} db=${hasDatabaseUrl ? "on" : "off"}`,
  );

  if (!prisma && !options.dryRun) {
    throw new Error("DATABASE_URL is required for live import mode.");
  }

  let states = await getStates();
  if (options.state) states = states.filter((s) => s.slug === options.state);
  if (options.maxStates > 0) states = states.slice(0, options.maxStates);
  stats.states = states.length;

  for (const state of states) {
    console.log(`[state] ${state.name} (${state.slug})`);
    let cities = await getCities(state.url);
    if (options.maxCities > 0) cities = cities.slice(0, options.maxCities);
    stats.cities += cities.length;

    for (const city of cities) {
      console.log(`  [city] ${city.name}`);
      let cards = await getProviderCards(city.url);
      if (options.maxProviders > 0) cards = cards.slice(0, options.maxProviders);
      stats.providerCards += cards.length;

      for (const card of cards) {
        try {
          const html = await fetchText(card.url);
          if (!html) {
            stats.errors += 1;
            continue;
          }
          stats.profilesFetched += 1;
          const profile = parseProfile(html, card.url);

          if (!profile.display_name || (!profile.email && !profile.phone)) {
            stats.skipped += 1;
            continue;
          }

          await importProfile(profile);
        } catch (err) {
          stats.errors += 1;
          console.error(`    [error] ${card.url}: ${String(err)}`);
        }

        await sleep(options.delayMs);
      }
    }
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log("[import-ultragfe] complete", {
    ...stats,
    elapsedSeconds: elapsed,
  });
}

run()
  .catch((err) => {
    console.error("[import-ultragfe] fatal", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
