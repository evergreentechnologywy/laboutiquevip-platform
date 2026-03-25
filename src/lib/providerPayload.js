function normalizeOptionalString(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildProviderSignupPayload({ formData, userId, billingPeriod }) {
  const durationDays = formData.ad_package !== "none"
    ? (billingPeriod === "monthly" ? 30 : 7)
    : 0;
  const adPackageExpiry = durationDays > 0
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    : null;

  return {
    user_id: userId,
    display_name: formData.display_name.trim(),
    tagline: normalizeOptionalString(formData.tagline),
    bio: normalizeOptionalString(formData.bio),
    location_city: formData.location_city.trim(),
    location_state: formData.location_state.trim(),
    location_country: normalizeOptionalString(formData.location_country) ?? "USA",
    age: normalizeOptionalNumber(formData.age),
    phone: normalizeOptionalString(formData.phone),
    email: normalizeOptionalString(formData.email),
    ad_package: formData.ad_package,
    ad_package_expiry: adPackageExpiry,
    verification_documents: Array.isArray(formData.verification_documents) ? formData.verification_documents : [],
    pending_photos: [],
  };
}
