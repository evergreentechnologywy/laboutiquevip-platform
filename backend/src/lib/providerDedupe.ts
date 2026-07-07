export function normalizeProviderName(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function erosFileId(url: string | null | undefined): string | null {
  const match = String(url ?? "").match(/\/files\/(\d+)\.htm/i);
  return match ? match[1] : null;
}

export function providerDedupeKey(provider: {
  display_name?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  verification_url?: string | null;
}): string {
  const fileId = erosFileId(provider.verification_url);
  if (fileId) return `eros:${fileId}`;

  const name = normalizeProviderName(provider.display_name);
  const city = String(provider.location_city ?? "").toLowerCase().trim();
  const state = String(provider.location_state ?? "").toLowerCase().trim();
  return `name:${name}|${city}|${state}`;
}

export function providerSearchScore(provider: Record<string, unknown>): number {
  const photos = Array.isArray(provider.photos) ? provider.photos.length : 0;
  let score = photos * 10;
  if (provider.status === "active") score += 1000;
  if (provider.is_verified) score += 500;
  if (provider.is_premium) score += 200;
  if (provider.is_profile_approved) score += 100;
  if (provider.verification_provider === "eros") score += 50;
  const updated = provider.updated_date ? new Date(String(provider.updated_date)).getTime() : 0;
  return score + updated / 1e12;
}

export function dedupeProviders<T extends Record<string, unknown>>(providers: T[]): T[] {
  const bestByKey = new Map<string, T>();
  for (const provider of providers) {
    const key = providerDedupeKey(provider);
    const existing = bestByKey.get(key);
    if (!existing || providerSearchScore(provider) > providerSearchScore(existing)) {
      bestByKey.set(key, provider);
    }
  }

  const seen = new Set<string>();
  const result: T[] = [];
  for (const provider of providers) {
    const key = providerDedupeKey(provider);
    if (seen.has(key)) continue;
    result.push(bestByKey.get(key)!);
    seen.add(key);
  }
  return result;
}
