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
    verification_provider: normalizeOptionalString(formData.verification_provider),
    verification_username: normalizeOptionalString(formData.verification_username),
    verification_url: normalizeOptionalString(formData.verification_url),
    review_provider: normalizeOptionalString(formData.review_provider),
    review_username: normalizeOptionalString(formData.review_username),
    review_url: normalizeOptionalString(formData.review_url),
    verification_documents: Array.isArray(formData.verification_documents) ? formData.verification_documents : [],
    pending_photos: [],
  };
}
