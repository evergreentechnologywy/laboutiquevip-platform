function readAffiliateId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const affiliateIds = {
  nordVpn: readAffiliateId(import.meta.env.VITE_NORDVPN_AFF_ID),
  booking: readAffiliateId(import.meta.env.VITE_BOOKING_AFF_ID),
  textVerified: readAffiliateId(import.meta.env.VITE_TEXTVERIFIED_AFF_ID),
  stripe: readAffiliateId(import.meta.env.VITE_STRIPE_AFF_ID),
  knownHost: readAffiliateId(import.meta.env.VITE_KNOWNHOST_AFF_ID),
};

export function nordVpnAffiliateUrl() {
  if (!affiliateIds.nordVpn) return null;
  return `https://go.nordvpn.net/aff_c?offer_id=15&aff_id=${encodeURIComponent(affiliateIds.nordVpn)}`;
}

export function bookingAffiliateUrl() {
  if (!affiliateIds.booking) return null;
  return `https://www.booking.com/index.html?aid=${encodeURIComponent(affiliateIds.booking)}`;
}

export function textVerifiedAffiliateUrl() {
  if (!affiliateIds.textVerified) return null;
  return `https://www.textverified.com/?ref=${encodeURIComponent(affiliateIds.textVerified)}`;
}

export function stripeAffiliateUrl() {
  if (!affiliateIds.stripe) return null;
  return `https://stripe.com/referral/${encodeURIComponent(affiliateIds.stripe)}`;
}

export function knownHostAffiliateUrl() {
  if (!affiliateIds.knownHost) return null;
  return `https://www.knownhost.com/aff.php?aff=${encodeURIComponent(affiliateIds.knownHost)}`;
}
