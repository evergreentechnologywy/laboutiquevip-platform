function readAffiliateId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const affiliateIds = {
  nordVpn: readAffiliateId(import.meta.env.VITE_NORDVPN_AFF_ID),
  booking: readAffiliateId(import.meta.env.VITE_BOOKING_AFF_ID),
  textVerified: readAffiliateId(import.meta.env.VITE_TEXTVERIFIED_AFF_ID),
  stripe: readAffiliateId(import.meta.env.VITE_STRIPE_AFF_ID),
  knownHost: readAffiliateId(import.meta.env.VITE_KNOWNHOST_AFF_ID),
  onlyFans: readAffiliateId(import.meta.env.VITE_ONLYFANS_AFF_ID),
  stdCheck: readAffiliateId(import.meta.env.VITE_STDCHECK_AFF_ID),
  expressVpn: readAffiliateId(import.meta.env.VITE_EXPRESSVPN_AFF_ID),
  adamEve: readAffiliateId(import.meta.env.VITE_ADAMEVE_AFF_ID),
  namecheap: readAffiliateId(import.meta.env.VITE_NAMECHEAP_AFF_ID),
};

export function nordVpnAffiliateUrl() {
  return affiliateIds.nordVpn
    ? `https://go.nordvpn.net/aff_c?offer_id=15&aff_id=${encodeURIComponent(affiliateIds.nordVpn)}`
    : "https://nordvpn.com";
}

export function bookingAffiliateUrl() {
  return affiliateIds.booking
    ? `https://www.booking.com/index.html?aid=${encodeURIComponent(affiliateIds.booking)}`
    : "https://www.booking.com";
}

export function textVerifiedAffiliateUrl() {
  return affiliateIds.textVerified
    ? `https://www.textverified.com/?ref=${encodeURIComponent(affiliateIds.textVerified)}`
    : "https://www.textverified.com";
}

export function stripeAffiliateUrl() {
  return affiliateIds.stripe
    ? `https://stripe.com/referral/${encodeURIComponent(affiliateIds.stripe)}`
    : "https://stripe.com";
}

export function knownHostAffiliateUrl() {
  return affiliateIds.knownHost
    ? `https://www.knownhost.com/aff.php?aff=${encodeURIComponent(affiliateIds.knownHost)}`
    : "https://www.knownhost.com";
}

export function onlyFansAffiliateUrl() {
  return affiliateIds.onlyFans
    ? `https://onlyfans.com/?ref=${encodeURIComponent(affiliateIds.onlyFans)}`
    : "https://onlyfans.com";
}

export function stdCheckAffiliateUrl() {
  return affiliateIds.stdCheck
    ? `https://www.stdcheck.com/?aid=${encodeURIComponent(affiliateIds.stdCheck)}`
    : "https://www.stdcheck.com";
}

export function expressVpnAffiliateUrl() {
  return affiliateIds.expressVpn
    ? `https://www.expressvpn.com/order?a_aid=${encodeURIComponent(affiliateIds.expressVpn)}`
    : "https://www.expressvpn.com";
}

export function adamEveAffiliateUrl() {
  return affiliateIds.adamEve
    ? `https://www.adameve.com/?partner=${encodeURIComponent(affiliateIds.adamEve)}`
    : "https://www.adameve.com";
}

export function namecheapAffiliateUrl() {
  return affiliateIds.namecheap
    ? `https://www.namecheap.com/?aff=${encodeURIComponent(affiliateIds.namecheap)}`
    : "https://www.namecheap.com";
}