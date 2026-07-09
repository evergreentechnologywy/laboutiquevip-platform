/** Imported catalog sources that may expose direct contact on profile detail views. */
export const IMPORTED_CATALOG_PROVIDERS = ["eros", "tryst"] as const;

export type ImportedCatalogProvider = (typeof IMPORTED_CATALOG_PROVIDERS)[number];

export function isImportedCatalogProvider(verificationProvider: unknown): boolean {
  const source = String(verificationProvider ?? "").trim().toLowerCase();
  return (IMPORTED_CATALOG_PROVIDERS as readonly string[]).includes(source);
}

/** Strip phone/email unless the row is an imported catalog listing. */
export function sanitizeProviderContactForAudience<T extends Record<string, unknown>>(
  row: T,
  options: { exposeImportedContact?: boolean } = {},
): T {
  if (options.exposeImportedContact && isImportedCatalogProvider(row.verification_provider)) {
    return row;
  }

  if (!("phone" in row) && !("email" in row)) {
    return row;
  }

  const { phone: _phone, email: _email, ...rest } = row as T & { phone?: unknown; email?: unknown };
  return rest as T;
}
