const PLACEHOLDER = "change-me-in-production";

/**
 * Resolve the legacy JWT secret.
 *
 * Fails closed: the public placeholder is only permitted in explicit
 * development/test (or local tooling where NODE_ENV is unset). Any other
 * environment (staging, preview, production) must provide a real secret —
 * previously only NODE_ENV=production exactly was guarded, so staging deploys
 * silently used the placeholder.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret !== PLACEHOLDER) {
    return secret;
  }
  const env = process.env.NODE_ENV;
  if (env == null || env === "" || env === "development" || env === "test") {
    return PLACEHOLDER;
  }
  throw new Error(
    "JWT_SECRET must be set to a non-default value outside development/test",
  );
}
