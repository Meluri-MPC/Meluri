import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export function initSentry(): void {
  if (!process.env.SENTRY_DSN) {
    console.warn('[Sentry] SENTRY_DSN not set — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.VELUMX_RELEASE || '0.1.0',
    integrations: [
      Sentry.httpIntegration({ breadcrumbs: true }),
      Sentry.expressIntegration(),
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      scrubPii(event);
      return event;
    },
    beforeSendTransaction(transaction) {
      scrubPii(transaction);
      return transaction;
    },
  });

  Sentry.setTag('service', 'velumx-api');
}

export function setupSentryErrorHandler(app: any): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setupExpressErrorHandler(app);
}

function scrubPii(event: any): void {
  const piiFields = [
    'email', 'userId', 'apiKey', 'x-api-key',
    'authorization', 'sessionToken', 'token',
    'privateKey', 'secretKey', 'password',
  ];

  if (event.request?.headers) {
    for (const field of piiFields) {
      if (event.request.headers[field]) {
        event.request.headers[field] = '[FILTERED]';
      }
    }
  }

  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.data) {
        for (const field of piiFields) {
          if (crumb.data[field]) {
            crumb.data[field] = '[FILTERED]';
          }
        }
      }
    }
  }
}
