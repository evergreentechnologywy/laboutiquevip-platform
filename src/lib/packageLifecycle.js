const packageLabels = {
  none: "Free listing",
  basic: "Basic",
  featured: "Featured",
  premium: "Premium",
};

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseDateOnly(value) {
  if (!value) return null;
  const dateOnly = typeof value === "string" ? value.slice(0, 10) : null;
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  return dateOnly;
}

function dateOnlyFromDate(date) {
  return date.toISOString().slice(0, 10);
}

export function getPackageLifecycleDisplay(provider = {}, options = {}) {
  const now = options.now ?? new Date();
  const packageId = provider?.ad_package || "none";
  const expiryDateOnly = parseDateOnly(provider?.ad_package_expiry);
  const isExpired = Boolean(packageId && packageId !== "none" && expiryDateOnly && expiryDateOnly < dateOnlyFromDate(now));
  const isActivePaidPackage = Boolean(packageId && packageId !== "none" && provider?.ad_package_expiry && !isExpired);
  const packageName = packageLabels[packageId] || packageId;
  const startedDate = formatDate(provider?.ad_package_started_at);
  const expiresDate = formatDate(provider?.ad_package_expiry);

  return {
    packageName,
    startedLabel: startedDate || "Not active",
    expiresLabel: expiresDate ? `${isExpired ? "Expired" : "Expires"} ${expiresDate}` : "No paid package expiration",
    tone: isExpired ? "danger" : packageId === "premium" || packageId === "featured" ? "premium" : isActivePaidPackage ? "warning" : "default",
    isActivePaidPackage,
    isExpired,
  };
}
