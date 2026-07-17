/** Client-side badge flags for provider cards and profile headers. */
import { getProviderReviewLinks } from "@/lib/reviewLinks";

export function getProviderBadgeFlags(provider) {
  const evergreen = provider?.verification_provider === "evergreen";
  const links = getProviderReviewLinks(provider);
  const p411 = Boolean(links.p411 || provider?.p411_verified_at);
  // Only real review profile URLs count — not generic /search stubs or empty verified timestamps alone
  const review = links.any;

  return {
    evergreen,
    p411,
    review,
    showEvergreenElite: evergreen,
    showP411Verified: p411 && !evergreen,
    showReviewVerified: review && !evergreen,
  };
}
