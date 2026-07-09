import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseErosProfileDetails } from "./eros-profile-parse.mjs";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "eros-kiera-sample.md",
);

const SAMPLE_MARKDOWN = fs.existsSync(fixturePath)
  ? fs.readFileSync(fixturePath, "utf8")
  : `# KIERA BENNETT

[8036290716](tel:8036290716)

Escort in Carolinas

### American Supermodel

Tall. Blonde. Breathtaking.

Step into a world of luxury and desire with a stunning 5'10" blonde enchantress whose presence turns heads and lingers in memory.

##### Details

Gender female

Age 21

Ethnicity caucasian

Hair Color blonde

Eye color hazel

Height 5'10"
`;

test("parseErosProfileDetails extracts full bio and structured attributes", () => {
  const parsed = parseErosProfileDetails(SAMPLE_MARKDOWN);

  assert.equal(parsed.tagline, "American Supermodel");
  assert.match(parsed.description ?? "", /Tall\. Blonde\. Breathtaking\./);
  assert.match(parsed.bio ?? "", /American Supermodel/);
  assert.match(parsed.bio ?? "", /Gender: Female/);
  assert.equal(parsed.service_type, "Female");
  assert.equal(parsed.ethnicity, "Caucasian");
  assert.equal(parsed.hair_color, "Blonde");
  assert.equal(parsed.eye_color, "Hazel");
  assert.equal(parsed.height, "5'10\"");
});
