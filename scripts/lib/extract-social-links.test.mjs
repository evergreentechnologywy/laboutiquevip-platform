import test from "node:test";
import assert from "node:assert/strict";
import { extractContactAndSocialFromMarkdown, mergeImportedSocial } from "./extract-social-links.mjs";

test("extractContactAndSocialFromMarkdown finds social and contact links", () => {
  const markdown = `
# Sample Profile
Phone: (702) 555-1212
Email: hello@example.com

Follow me:
[Instagram](https://instagram.com/vipmodel)
[OnlyFans](https://onlyfans.com/vipmodel)
[Linktree](https://linktr.ee/vipmodel)
[WhatsApp](https://wa.me/17025551212)
[Telegram](https://t.me/vipmodel)
[Snapchat](https://www.snapchat.com/add/vipmodel)
[X](https://x.com/vipmodel)
`;

  const result = extractContactAndSocialFromMarkdown(markdown);
  assert.equal(result.phone, "7025551212");
  assert.equal(result.email, "hello@example.com");
  assert.equal(result.social_media.instagram, "vipmodel");
  assert.equal(result.social_media.onlyfans, "https://onlyfans.com/vipmodel");
  assert.equal(result.social_media.linktree, "https://linktr.ee/vipmodel");
  assert.equal(result.social_media.whatsapp, "17025551212");
  assert.equal(result.social_media.telegram, "vipmodel");
  assert.equal(result.social_media.snapchat, "vipmodel");
  assert.equal(result.social_media.twitter, "vipmodel");
});

test("mergeImportedSocial preserves existing keys and import metadata", () => {
  const merged = mergeImportedSocial(
    { instagram: "existing", eros_profile: "https://eros.com/old" },
    { instagram: "new", onlyfans: "https://onlyfans.com/x" },
    { eros_profile: "https://eros.com/new" },
  );
  assert.equal(merged.instagram, "existing");
  assert.equal(merged.onlyfans, "https://onlyfans.com/x");
  assert.equal(merged.eros_profile, "https://eros.com/new");
});
