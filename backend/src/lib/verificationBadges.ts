/** Earned verification badges — P411 and/or review sites. Evergreen roster is separate. */

export type ProviderBadgeRow = {
  verification_provider?: string | null;
  p411_url?: string | null;
  p411_verified_at?: Date | string | null;
  ter_url?: string | null;
  pd_url?: string | null;
  tob_url?: string | null;
  review_verified_at?: Date | string | null;
};

export function hasP411Badge(provider: ProviderBadgeRow | null | undefined): boolean {
  return Boolean(provider?.p411_url || provider?.p411_verified_at);
}

export function hasReviewBadge(provider: ProviderBadgeRow | null | undefined): boolean {
  return Boolean(
    provider?.ter_url ||
      provider?.pd_url ||
      provider?.tob_url ||
      provider?.review_verified_at,
  );
}

export function isEvergreenRoster(provider: ProviderBadgeRow | null | undefined): boolean {
  return provider?.verification_provider === "evergreen";
}

/** Imported listings need P411 or review badge for public catalog (evergreen exempt). */
export function hasPublicVerificationBadge(provider: ProviderBadgeRow | null | undefined): boolean {
  if (!provider) return false;
  if (isEvergreenRoster(provider)) return true;
  return hasP411Badge(provider) || hasReviewBadge(provider);
}

export function publicVerificationBadgeWhere(): Record<string, unknown> | null {
  if (
    process.env.STRICT_VERIFICATION_GATE === "0" ||
    process.env.PUBLIC_REQUIRE_VERIFICATION_BADGE === "0"
  ) {
    return null;
  }

  return {
    OR: [
      { verification_provider: "evergreen" },
      { p411_url: { not: null } },
      { ter_url: { not: null } },
      { pd_url: { not: null } },
      { tob_url: { not: null } },
    ],
  };
}

export function browseVerifiedFilterWhere(): Record<string, unknown> {
  return {
    OR: [
      { verification_provider: "evergreen" },
      { p411_url: { not: null } },
      { ter_url: { not: null } },
      { pd_url: { not: null } },
      { tob_url: { not: null } },
    ],
  };
}
