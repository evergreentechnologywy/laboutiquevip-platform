export function isValidProfilePhoto(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.includes("/api/r2-photo/")) return false;
  if (lower.includes("theeroticreview.com/library/")) return false;
  if (lower.includes("coop.theeroticreview.com/hit.php")) return false;
  if (lower.includes("eros-logo")) return false;
  if (lower.endsWith("lamp.png")) return false;
  if (lower.includes("loader.php")) return false;
  if (lower.includes(".js")) return false;
  if (lower.includes(".html")) return false;
  return (
    /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(lower) ||
    /ultragfe\.com\/images|photos\.skipsweb\.com|imagedelivery\.net|i\.eros\.com/.test(lower)
  );
}

export function getProfilePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos.filter(isValidProfilePhoto);
}
