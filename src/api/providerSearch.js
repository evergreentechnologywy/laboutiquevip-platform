/**
 * @typedef {Error & {
 *   status?: number,
 *   data?: any,
 * }} ApiError
 */

export async function searchProviders({
  q = "",
  location = "",
  verified = false,
  premium = false,
  minPrice = 0,
  maxPrice = 2000,
  sort = "newest",
  page = 1,
  limit = 60,
} = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (location) params.set("location", location);
  if (verified) params.set("verified", "true");
  if (premium) params.set("premium", "true");
  params.set("minPrice", String(minPrice));
  params.set("maxPrice", String(maxPrice));
  params.set("sort", sort);
  params.set("page", String(page));
  params.set("limit", String(limit));

  const res = await fetch(`/api/v1/search/providers?${params.toString()}`, {
    credentials: "same-origin",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    /** @type {ApiError} */
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function fetchSearchLocations() {
  const res = await fetch("/api/v1/search/locations", { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    /** @type {ApiError} */
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
