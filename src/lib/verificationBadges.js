/** Client-side badge flags for provider cards and profile headers. */

export function getProviderBadgeFlags(provider) {
  const evergreen = provider?.verification_provider === "evergreen";
  const p411 = Boolean(provider?.p411_url || provider?.p411_verified_at);
  const review = Boolean(
    provider?.ter_url ||
      provider?.pd_url ||
      provider?.tob_url ||
      provider?.review_verified_at,
  );

  return {
    evergreen,
    p411,
    review,
    showEvergreenElite: evergreen,
    showP411Verified: p411 && !evergreen,
    showReviewVerified: review && !evergreen,
  };
}
