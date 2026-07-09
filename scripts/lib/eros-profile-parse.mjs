function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  const text = cleanText(value);
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function parseErosDetailValue(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inline = new RegExp(`\\b${escaped}\\s+([^\\n]+)`, "i");
  const inlineMatch = markdown.match(inline);
  if (inlineMatch) {
    let value = cleanText(inlineMatch[1]);
    const stopRx =
      /\s+(?:Gender|Age|Ethnicity|Hair Color|Eye color|Height|Availability|Available to)\b/i;
    const stopMatch = value.match(stopRx);
    if (stopMatch?.index != null && stopMatch.index > 0) {
      value = cleanText(value.slice(0, stopMatch.index));
    }
    return value || null;
  }

  const multiline = new RegExp(`\\b${escaped}\\s*\\n\\s*([^\\n]+)`, "i");
  return cleanText(markdown.match(multiline)?.[1] ?? "") || null;
}

function extractErosDescription(markdown, tagline) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const tagIdx = lines.findIndex((line) => /^###\s+/.test(line));
  if (tagIdx < 0) return null;

  const paragraphs = [];
  let buffer = [];

  const flush = () => {
    const text = cleanText(buffer.join(" "));
    if (text) paragraphs.push(text);
    buffer = [];
  };

  for (let i = tagIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) {
      flush();
      continue;
    }
    if (/^#{4,5}\s/.test(line)) break;
    if (/^!\[/.test(line)) continue;
    if (/^\[/.test(line) && line.includes("](")) continue;
    if (/^(Previous|Next|Favourite|Home)$/i.test(line)) continue;
    if (/^(Escort|Trans|Massage) in\b/i.test(line)) continue;
    if (/^\d+\.\s*\[/.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    if (/^Our (partners|categories)/i.test(line)) continue;
    if (/^\[803\d+\]/i.test(line)) continue;

    buffer.push(line);
  }
  flush();

  const seen = new Set();
  const deduped = paragraphs.filter((paragraph) => {
    if (seen.has(paragraph)) return false;
    seen.add(paragraph);
    return true;
  });

  const body = deduped.join("\n\n");
  if (!body) return null;
  if (tagline && body.toLowerCase() === tagline.toLowerCase()) return null;
  return body;
}

export function parseErosProfileDetails(markdown) {
  const tagline =
    markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^###\s+/.test(line))
      ?.replace(/^###\s+/, "")
      .trim() ?? null;

  const description = extractErosDescription(markdown, tagline);
  const gender = parseErosDetailValue(markdown, "Gender");
  const ethnicityRaw = parseErosDetailValue(markdown, "Ethnicity");
  const hairColor = titleCase(parseErosDetailValue(markdown, "Hair Color"));
  const eyeColor = titleCase(parseErosDetailValue(markdown, "Eye color"));
  const height = parseErosDetailValue(markdown, "Height");

  const bodyType = parseErosDetailValue(markdown, "Body Type") ?? parseErosDetailValue(markdown, "Build");
  const availability = parseErosDetailValue(markdown, "Availability");

  // Services: look for listed services in the description text
  const servicesPatterns = ["GFE", "PSE", "DATY", "BBBJ", "CIM", "COF", "Greek", "MSOG", "DFK", "LFK", "FK", "Duo", "Fetish", "BDSM", "Roleplay"];
  const desc = (description ?? "").toLowerCase();
  const services_offered = servicesPatterns.filter(s => desc.includes(s.toLowerCase()));

  const detailLabels = [];
  if (gender) detailLabels.push(`Gender: ${titleCase(gender)}`);
  if (ethnicityRaw) detailLabels.push(`Ethnicity: ${titleCase(ethnicityRaw)}`);
  if (hairColor) detailLabels.push(`Hair Color: ${hairColor}`);
  if (eyeColor) detailLabels.push(`Eye color: ${eyeColor}`);
  if (height) detailLabels.push(`Height: ${height}`);

  const bioParts = [tagline, description, ...detailLabels].filter(Boolean);
  const bio = bioParts.length ? bioParts.join("\n\n") : null;

  return {
    tagline,
    bio,
    description,
    service_type: gender ? titleCase(gender) : null,
    ethnicity: ethnicityRaw ? titleCase(ethnicityRaw) : null,
    hair_color: hairColor,
    eye_color: eyeColor,
    height,
    body_type: bodyType ? titleCase(bodyType) : null,
    services_offered: services_offered.length ? services_offered : null,
    availability,
  };
}
