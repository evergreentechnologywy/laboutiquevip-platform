const { PrismaClient } = require("../backend/generated/prisma-client");
const prisma = new PrismaClient();

const STATE_MAP = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

function parseLocationFromBio(bio) {
  const text = String(bio || "");
  const match = text.match(/\bin\s+(.+),\s*([A-Z]{2})\b/i);
  if (!match) return null;
  return {
    location_city: match[1].trim(),
    location_state: match[2].toUpperCase(),
  };
}

function parseLocationFromVerificationUrl(url) {
  try {
    const parsed = new URL(url);
    const hostPath = parsed.hostname + parsed.pathname;
    const cityMatch = hostPath.match(/ultragfe\.com\/images\/([a-z0-9-]+)-/i);
    if (!cityMatch) return null;
    const city = cityMatch[1]
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { location_city: city, location_state: null };
  } catch {
    return null;
  }
}

(async () => {
  const rows = await prisma.provider.findMany({
    where: {
      ad_package: "elite",
      user_id: { not: null },
    },
    select: {
      id: true,
      display_name: true,
      bio: true,
      verification_url: true,
      location_city: true,
      location_state: true,
      photos: true,
    },
  });

  let updated = 0;
  for (const row of rows) {
    const currentCity = String(row.location_city || "").trim().toLowerCase();
    const needsFix =
      !currentCity ||
      currentCity === "tbd" ||
      currentCity === "unknown" ||
      currentCity.includes("escort") ||
      currentCity.includes("massage") ||
      currentCity.length > 40;
    if (!needsFix) continue;

    const fromBio = parseLocationFromBio(row.bio);
    const firstPhoto = Array.isArray(row.photos) ? row.photos.find((url) => String(url).includes("ultragfe.com/images/")) : null;
    const fromPhoto = firstPhoto ? parseLocationFromVerificationUrl(firstPhoto) : null;
    const fromUrl = row.verification_url ? parseLocationFromVerificationUrl(row.verification_url) : null;
    const next = fromBio || fromUrl || fromPhoto;
    if (!next?.location_city) continue;

    await prisma.provider.update({
      where: { id: row.id },
      data: {
        location_city: next.location_city,
        location_state: next.location_state || row.location_state,
      },
    });
    updated += 1;
    console.log(row.display_name, "->", next.location_city, next.location_state || row.location_state);
  }

  console.log(JSON.stringify({ checked: rows.length, updated }, null, 2));
  await prisma.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
