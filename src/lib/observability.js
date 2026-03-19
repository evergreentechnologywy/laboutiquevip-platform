import * as Sentry from '@sentry/react';

let initialized = false;

function resolveEnvironment() {
  return import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development';
}

export function initFrontendObservability() {
  if (initialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: resolveEnvironment(),
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
    integrations: [Sentry.browserTracingIntegration()],
  });

  initialized = true;
}

export function captureFrontendException(error, context = {}) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    scope.setContext('frontend', context);
    Sentry.captureException(error);
  });
}

export { Sentry };
