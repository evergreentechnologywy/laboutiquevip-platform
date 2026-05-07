import test from "node:test";
import assert from "node:assert/strict";
import { validateStartupOrThrow } from "./startup.js";

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const previous: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("validateStartupOrThrow requires a NOWPayments IPN secret in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      NOWPAYMENTS_API_KEY: "np-api-key",
      NOWPAYMENTS_IPN_SECRET: undefined,
      NOWPAYMENTS_WEBHOOK_SECRET: undefined,
      DIDIT_API_KEY: "didit-api-key",
      DIDIT_WORKFLOW_ID: "workflow-id",
      DIDIT_WEBHOOK_SECRET: "didit-webhook-secret",
      CORS_ALLOWLIST: "https://www.laboutiquevip.net",
      PUBLIC_BASE_URL: "https://www.laboutiquevip.net",
    },
    () => {
      assert.throws(
        () => validateStartupOrThrow(),
        /NOWPAYMENTS_IPN_SECRET/,
      );
    },
  );
});

test("validateStartupOrThrow accepts NOWPAYMENTS_IPN_SECRET in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      NOWPAYMENTS_API_KEY: "np-api-key",
      NOWPAYMENTS_IPN_SECRET: "np-ipn-secret",
      NOWPAYMENTS_WEBHOOK_SECRET: undefined,
      DIDIT_API_KEY: "didit-api-key",
      DIDIT_WORKFLOW_ID: "workflow-id",
      DIDIT_WEBHOOK_SECRET: "didit-webhook-secret",
      CORS_ALLOWLIST: "https://www.laboutiquevip.net",
      PUBLIC_BASE_URL: "https://www.laboutiquevip.net",
    },
    () => {
      assert.doesNotThrow(() => validateStartupOrThrow());
    },
  );
});
