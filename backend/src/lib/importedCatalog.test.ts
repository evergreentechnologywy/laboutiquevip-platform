import test from "node:test";
import assert from "node:assert/strict";
import {
  isImportedCatalogProvider,
  sanitizeProviderContactForAudience,
} from "./importedCatalog.js";

test("isImportedCatalogProvider recognizes eros and tryst", () => {
  assert.equal(isImportedCatalogProvider("eros"), true);
  assert.equal(isImportedCatalogProvider("TRyst"), true);
  assert.equal(isImportedCatalogProvider("evergreen"), false);
  assert.equal(isImportedCatalogProvider(null), false);
});

test("sanitizeProviderContactForAudience keeps imported contact on detail views", () => {
  const row = {
    id: "p1",
    verification_provider: "eros",
    phone: "8036290716",
    email: "kiera@example.com",
    display_name: "Kiera",
  };

  const exposed = sanitizeProviderContactForAudience(row, { exposeImportedContact: true });
  assert.equal(exposed.phone, "8036290716");
  assert.equal(exposed.email, "kiera@example.com");
});

test("sanitizeProviderContactForAudience strips contact for non-imported listings", () => {
  const row = {
    id: "p2",
    verification_provider: "evergreen",
    phone: "555-0100",
    display_name: "Agency Model",
  };

  const redacted = sanitizeProviderContactForAudience(row, { exposeImportedContact: true });
  assert.equal(redacted.phone, undefined);
});

test("sanitizeProviderContactForAudience strips imported contact when detail exposure disabled", () => {
  const row = {
    id: "p3",
    verification_provider: "eros",
    phone: "8036290716",
    display_name: "Kiera",
  };

  const redacted = sanitizeProviderContactForAudience(row, { exposeImportedContact: false });
  assert.equal(redacted.phone, undefined);
});
