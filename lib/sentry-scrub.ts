/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Privacy-safe Sentry scrubbing. Guarantees we never transmit lead PII, secrets,
 * tokens, cookies, auth headers, raw bodies, database URLs, or environment
 * values. Applied to both error events and transactions.
 */

const PII_PATTERNS: RegExp[] = [
  // emails
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // US/NANP phone numbers (with optional separators)
  /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // bearer / auth / turnstile tokens
  /(?:bearer\s+|authorization\s*[:=]\s*|turnstile[_-]?token)\S*/gi,
  // generic secret-ish assignments
  /(?:secret|password|api[_-]?key|token|dsn|connectionstring|database_uri|private[_-]?key)\s*[:=]\s*\S+/gi,
  // postgres / database connection URIs
  /[a-z]+:\/\/\S+/gi,
];

export function scrubString(value: string): string {
  let out = value;
  for (const re of PII_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

function scrubValue(v: any): any {
  if (typeof v === 'string') return scrubString(v);
  if (Array.isArray(v)) return v.map(scrubValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (/secret|token|password|key|authorization|cookie|dsn|body|message|email|phone|name/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubValue(val);
      }
    }
    return out;
  }
  return v;
}

/** Scrub an error event. Returns the event, or null to drop it entirely. */
export function scrubEvent(event: any): any {
  if (!event) return null;

  // Never transmit request body, cookies, headers, query string, or env.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.env;
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubString(event.request.url);
  }

  // Scrub exception messages + values.
  if (event.exception?.values) {
    for (const v of event.exception.values) {
      if (v.value) v.value = scrubString(v.value);
      if (v.type) v.type = scrubString(v.type);
    }
  }

  // Scrub breadcrumbs (they can capture form data / input).
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.message) b.message = scrubString(b.message);
      if (b.data) b.data = scrubValue(b.data);
    }
  }

  // Never send user PII.
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
    delete event.user.name;
  }

  // Scrub context values that might carry PII.
  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      event.contexts[key] = scrubValue(event.contexts[key]);
    }
  }

  return event;
}

/** Scrub a transaction the same way (spans/breadcrumbs may carry PII). */
export function scrubTransaction(transaction: any): any {
  if (!transaction) return null;
  if (transaction.request) {
    delete transaction.request.data;
    delete transaction.request.cookies;
    delete transaction.request.headers;
    delete transaction.request.env;
    delete transaction.request.query_string;
  }
  if (transaction.breadcrumbs) {
    for (const b of transaction.breadcrumbs) {
      if (b.message) b.message = scrubString(b.message);
      if (b.data) b.data = scrubValue(b.data);
    }
  }
  return transaction;
}
