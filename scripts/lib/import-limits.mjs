/**
 * Import crawl limits. Convention: 0 (or negative) means unlimited.
 */

export function parseImportLimit(raw, fallback = 0) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value <= 0 ? 0 : Math.floor(value);
}

export function effectiveLimit(limit) {
  return limit > 0 ? limit : Number.POSITIVE_INFINITY;
}

export function formatCap(value) {
  return value > 0 ? String(value) : "unlimited";
}

export function sliceToLimit(items, limit) {
  if (!Array.isArray(items)) return [];
  if (limit > 0) return items.slice(0, limit);
  return items;
}
