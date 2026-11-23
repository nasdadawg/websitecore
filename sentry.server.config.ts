import * as Sentry from '@sentry/nextjs';
import { scrubEvent, scrubTransaction } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Never send user-identifying data (emails, IPs, etc.) by default.
  sendDefaultPii: false,
  // Privacy-safe: strip lead PII, secrets, tokens, cookies, headers, bodies,
  // DB URLs and env values from every error event before it leaves the process.
  beforeSend(event) {
    return scrubEvent(event);
  },
  beforeSendTransaction(transaction) {
    return scrubTransaction(transaction);
  },
});
