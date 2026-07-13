import {
  sanitizeNextUrl,
  buildLoginUrl,
  buildRegisterUrl,
  buildAuthContinueUrl,
  defaultLandingForRole,
} from "../src/lib/authUrls.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(sanitizeNextUrl("//evil.com") === "/", "block protocol-relative");
assert(sanitizeNextUrl("/login") === "/", "block login loop");
assert(sanitizeNextUrl("/admindashboard") === "/admindashboard", "keep next");
assert(buildLoginUrl("/providerdashboard") === "/login?next=%2Fproviderdashboard", "login next");
assert(buildRegisterUrl("/browse").includes("next="), "register next");
assert(buildAuthContinueUrl("/devdashboard").includes("auth/continue"), "continue");
assert(defaultLandingForRole("admin") === "/admindashboard", "admin land");
assert(defaultLandingForRole("provider", "/browse") === "/browse", "honor next");
assert(defaultLandingForRole("member") === "/browse", "member land");
console.log("ok auth urls");
