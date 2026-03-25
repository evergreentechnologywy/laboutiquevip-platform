import { isProduction } from "./security.js";

function requiredInProduction(name: string, opts?: { allowEmpty?: boolean }): string | null {
  const value = process.env[name];
  if (value == null) {
    return name;
  }
  if (!opts?.allowEmpty && !value.trim()) {
    return name;
  }
  return null;
}

export function validateStartupOrThrow(): void {
  if (!isProduction()) {
    return;
  }

  const missing = [
    requiredInProduction("DATABASE_URL"),
    requiredInProduction("NOWPAYMENTS_API_KEY"),
    requiredInProduction("NOWPAYMENTS_WEBHOOK_SECRET"),
    requiredInProduction("DIDIT_API_KEY"),
    requiredInProduction("DIDIT_WORKFLOW_ID"),
    requiredInProduction("DIDIT_WEBHOOK_SECRET"),
    requiredInProduction("CORS_ALLOWLIST"),
    requiredInProduction("PUBLIC_BASE_URL"),
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}
