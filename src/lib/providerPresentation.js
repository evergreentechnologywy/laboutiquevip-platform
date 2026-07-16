export function getProviderRatingMeta(provider, reviewCountOverride) {
  const reviewCount = Number(reviewCountOverride ?? provider?.reviews_count ?? 0);
  const rating = Number(provider?.rating_average);

  if (reviewCount > 0 && Number.isFinite(rating) && rating > 0) {
    return {
      value: rating.toFixed(1),
      detail: `${reviewCount} approved review${reviewCount === 1 ? "" : "s"}`,
      hasReviews: true,
    };
  }

  return {
    value: "New",
    detail: "Awaiting reviews",
    hasReviews: false,
  };
}

export function normalizeOptionalUrl(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizedDisplayName(provider) {
  return String(provider?.display_name ?? provider?.displayName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function dedupeProvidersForDisplay(providers = []) {
  const seen = new Set();

  return providers.filter((provider) => {
    const normalizedName = normalizedDisplayName(provider);
    const key = normalizedName ? `name:${normalizedName}` : `id:${provider?.id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
