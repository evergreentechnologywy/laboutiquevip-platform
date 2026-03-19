import * as Sentry from "@sentry/node";

let initialized = false;

function normalizeEnvironment(value: string | undefined): string {
  const resolved = value?.trim();
  return resolved && resolved.length > 0 ? resolved : "development";
}

export function initBackendObservability(): void {
  if (initialized) {
    return;
  }

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: normalizeEnvironment(process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV),
    release: process.env.SENTRY_RELEASE?.trim() || process.env.GIT_COMMIT_SHA?.trim() || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
  });

  initialized = true;
}

export function captureBackendException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("backend", context);
    }
    Sentry.captureException(error);
  });
}

export function captureBackendMessage(message: string, context?: Record<string, unknown>): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("backend", context);
    }
    Sentry.captureMessage(message);
  });
}
