export const adPackages = [
  {
    id: "none",
    name: "Free Listing",
    label: "Free Listing",
    priceWeekly: 0,
    priceMonthly: 0,
    duration: "Forever",
    billingModes: ["free"],
    features: [
      "Basic profile listing",
      "Standard search visibility",
      "Contact form access",
    ],
    color: "zinc",
    premium: false,
    recommended: false,
  },
  {
    id: "basic",
    name: "Basic",
    label: "Basic",
    priceWeekly: 19,
    priceMonthly: 59,
    duration: "weekly or monthly",
    billingModes: ["weekly", "monthly"],
    features: [
      "Improved listing visibility",
      "More screen space than free listings",
      "Entry paid placement for approved profiles",
    ],
    color: "blue",
    premium: false,
    recommended: false,
  },
  {
    id: "featured",
    name: "Featured",
    label: "Featured",
    priceWeekly: 39,
    priceMonthly: 119,
    duration: "weekly or monthly",
    billingModes: ["weekly", "monthly"],
    features: [
      "Higher exposure in browse results",
      "Expanded screen presence",
      "Recommended tier for most advertisers",
    ],
    color: "rose",
    premium: true,
    recommended: true,
  },
  {
    id: "premium",
    name: "Premium",
    label: "Premium",
    priceWeekly: 69,
    priceMonthly: 199,
    duration: "weekly or monthly",
    billingModes: ["weekly", "monthly"],
    features: [
      "Maximum exposure",
      "Largest placement treatment",
      "Strongest premium signage and visibility",
    ],
    color: "amber",
    premium: true,
    recommended: false,
  },
];

export function getAdPackageById(packageId) {
  return adPackages.find((pkg) => pkg.id === packageId) ?? adPackages[0];
}

export function formatPackagePrice(pkg, billingPeriod = "weekly") {
  if (!pkg || pkg.id === "none") {
    return "$0";
  }

  return billingPeriod === "monthly"
    ? `$${pkg.priceMonthly}/month`
    : `$${pkg.priceWeekly}/week`;
}
