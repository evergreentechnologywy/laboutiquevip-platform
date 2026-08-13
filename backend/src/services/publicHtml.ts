import type { PublishedCityRecord, PublishedProfileRecord } from "../lib/publishedCatalog.js";

const BASE_URL = process.env.PUBLIC_BASE_URL ?? "https://www.laboutiquevip.net";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PAGE_STYLES = `
  :root { color-scheme: dark; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #09090b;
    color: #f4f4f5;
    line-height: 1.5;
  }
  a { color: #fb7185; }
  .wrap { max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
  header { margin-bottom: 1.5rem; }
  .brand { font-size: 0.75rem; letter-spacing: 0.2em; text-transform: uppercase; color: #fb7185; }
  h1 { font-size: 1.75rem; margin: 0.25rem 0 0.75rem; }
  .meta { color: #a1a1aa; font-size: 0.95rem; }
  ul { list-style: none; padding: 0; margin: 1.25rem 0 0; }
  li { padding: 0.65rem 0; border-bottom: 1px solid #27272a; }
  .cta { margin-top: 2rem; }
  .btn {
    display: inline-block;
    padding: 0.65rem 1rem;
    border-radius: 0.5rem;
    background: #fb7185;
    color: #09090b;
    text-decoration: none;
    font-weight: 600;
  }
`;

function layout(title: string, description: string, canonicalPath: string, body: string): string {
  const canonical = `${BASE_URL}${canonicalPath}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="robots" content="index,follow">
  <style>${PAGE_STYLES}</style>
</head>
<body id="lbv-public-directory">
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
}

export function renderCityPageHtml(
  city: PublishedCityRecord,
  profiles: PublishedProfileRecord[],
): string {
  const title = `${city.name}, ${city.stateCode} — La Boutique VIP`;
  const description = `Browse ${city.providerCount} listings in ${city.name}, ${city.stateName}. Verified directory with transparent rates.`;
  const profileItems = profiles
    .map((profile) => {
      const label = escapeHtml(profile.displayName);
      const href = escapeHtml(`/profile/${encodeURIComponent(profile.slug)}`);
      return `<li><a href="${href}">${label}</a></li>`;
    })
    .join("");

  const body = `
    <header>
      <div class="brand">La Boutique VIP</div>
      <h1>${escapeHtml(city.name)}, ${escapeHtml(city.stateCode)}</h1>
      <p class="meta">${city.providerCount} providers · ${city.verifiedCount} verified</p>
    </header>
    <main data-page="city" data-city-slug="${escapeHtml(city.slug)}">
      ${profiles.length > 0 ? `<ul>${profileItems}</ul>` : "<p class=\"meta\">No published listings in this city yet.</p>"}
      <p class="cta"><a class="btn" href="/city/${escapeHtml(city.slug)}">Open interactive browse</a></p>
    </main>`;

  return layout(title, description, `/city/${city.slug}`, body);
}

export function renderProfilePageHtml(profile: PublishedProfileRecord): string {
  const location =
    profile.cityName && profile.stateCode
      ? `${profile.cityName}, ${profile.stateCode}`
      : profile.cityName || profile.stateCode || "United States";
  const title = `${profile.displayName} — La Boutique VIP`;
  const description = `View ${profile.displayName} in ${location} on La Boutique VIP.`;

  const body = `
    <header>
      <div class="brand">La Boutique VIP</div>
      <h1>${escapeHtml(profile.displayName)}</h1>
      <p class="meta">${escapeHtml(location)}</p>
    </header>
    <main data-page="profile" data-profile-slug="${escapeHtml(profile.slug)}">
      <p class="meta">Published listing on the La Boutique VIP directory.</p>
      <p class="cta"><a class="btn" href="/profile/${escapeHtml(profile.slug)}">View full profile</a></p>
    </main>`;

  return layout(title, description, `/profile/${profile.slug}`, body);
}
