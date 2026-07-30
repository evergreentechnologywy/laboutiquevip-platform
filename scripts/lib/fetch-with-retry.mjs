// fetchWithRetry — exponential backoff + jitter + 429 Retry-After handling.
export async function fetchWithRetry(url, options = {}, {
  retries = 5,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
  retryOn = [408, 425, 429, 500, 502, 503, 504],
} = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (!retryOn.includes(res.status) || attempt === retries) return res;
      const retryAfter = res.headers.get?.("retry-after");
      let delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      if (retryAfter) {
        const ra = Number(retryAfter);
        if (Number.isFinite(ra)) delay = Math.max(delay, ra * 1000);
      }
      delay += Math.floor(Math.random() * 500); // jitter
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs) + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}
