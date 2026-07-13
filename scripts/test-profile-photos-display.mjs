import {
  getPrimaryProfilePhoto,
  getProfilePhotoCandidates,
  getProfilePhotos,
  isTrystImageUrl,
} from "../src/lib/profilePhotos.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const trystSmall =
  "https://media-v2.tryst.a4cdn.org/profiles/e381d715-75be-4b13-aaf9-095872befcf2/photos/9cab9694-b8f9-4b52-995c-ff8eb43e1428/small.avif";
const r2 = "/api/r2-photo/931759d2-2c8a-435b-bc22-1a856dac1181/000.jpg";
const eros = "https://www.eros.com/i/1344283/profile/96a1a341-a766-4870-b98d-0bb.jpg";

assert(isTrystImageUrl(trystSmall), "tryst detector");
const trystOnly = { id: "1", display_name: "hollieluxe", photos: [trystSmall] };
assert(!!getPrimaryProfilePhoto(trystOnly), "tryst-only primary must not be null");
assert(getPrimaryProfilePhoto(trystOnly).includes("/api/tryst-photo?"), "proxy tryst");
assert(decodeURIComponent(getPrimaryProfilePhoto(trystOnly)).includes("/large.avif"), "prefer large");
assert(getProfilePhotoCandidates(trystOnly, 3).length >= 2, "size fallbacks");

const mixed = { id: "2", display_name: "x", photos: [trystSmall, r2, eros] };
const gallery = getProfilePhotos(mixed.photos, mixed);
assert(gallery[0].includes("/api/r2-photo/"), "R2 first");
assert(gallery.some((u) => u.includes("eros.com")), "keeps eros");
assert(gallery.some((u) => isTrystImageUrl(u)), "keeps tryst");

console.log("ok profile photo display routing");
