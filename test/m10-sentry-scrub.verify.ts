/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M10 — Sentry privacy-scrub verification (no DSN required).
 *
 * Proves lib/sentry-scrub strips lead PII, secrets, tokens, auth headers,
 * raw bodies, DB URLs and env values from error events and transactions.
 * Run: `npx tsx test/m10-sentry-scrub.verify.ts`
 */
import { scrubString, scrubEvent, scrubTransaction } from '../lib/sentry-scrub';

let failures = 0;
function check(name: string, cond: boolean, evidence: string): boolean {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  —  ${evidence}`);
  if (!cond) failures += 1;
  return cond;
}

// ── scrubString ──
const email = 'alice@example.com';
const phone = '555-123-4567';
const bearer = 'Bearer abc.def.ghi-token';
const secretAssign = 'database_uri=postgres://user:pass@host:5432/db';
const uri = 'postgresql://u:p@aws-0-us-east-2.pooler.supabase.com:5432/db';

const emailOut = scrubString(email);
check('email scrubbed', emailOut.includes('[REDACTED]') && !emailOut.includes('@'), `out=${emailOut}`);

const phoneOut = scrubString(phone);
check('phone scrubbed', phoneOut.includes('[REDACTED]') && !phoneOut.includes('555'), `out=${phoneOut}`);

const bearerOut = scrubString(bearer);
check('bearer token scrubbed', !bearerOut.includes('abc.def.ghi'), `out=${bearerOut}`);

const secretOut = scrubString(secretAssign);
check('secret assignment scrubbed', !secretOut.includes('postgres://') && !secretOut.includes('pass'), `out=${secretOut}`);

const uriOut = scrubString(uri);
check('db URI scrubbed', !uriOut.includes('supabase') && !uriOut.includes('pooler'), `out=${uriOut}`);

// ── scrubEvent ──
const event: any = {
  request: {
    data: { name: 'Alice', phone: '555-123-4567', message: 'secret message' },
    cookies: { session: 'abc123' },
    headers: { authorization: 'Bearer xyz', cookie: 'session=abc123' },
    env: { DATABASE_URI: 'postgres://u:p@host/db', SENTRY_DSN: 'https://x@y.ingest.sentry.io/1' },
    query_string: '?secret=abc',
    url: 'https://example.com/api/leads?token=abc',
  },
  exception: { values: [{ value: 'Error for alice@example.com with phone 555-123-4567', type: 'Error' }] },
  breadcrumbs: [{ message: 'posted lead for bob@example.com', data: { email: 'bob@example.com' } }],
  user: { email: 'owner@example.com', ip_address: '1.2.3.4', username: 'owner', id: 'u1' },
  contexts: { response: { status: 500 } },
};

const scrubbed = scrubEvent(event);
check('request.data removed', scrubbed.request.data === undefined, 'data deleted');
check('request.cookies removed', scrubbed.request.cookies === undefined, 'cookies deleted');
check('request.headers removed', scrubbed.request.headers === undefined, 'headers deleted');
check('request.env removed', scrubbed.request.env === undefined, 'env deleted');
check('request.query_string removed', scrubbed.request.query_string === undefined, 'query_string deleted');
check('request.url scrubbed', !scrubbed.request.url.includes('token'), `url=${scrubbed.request.url}`);
check('exception message scrubbed', !scrubbed.exception.values[0].value.includes('alice@example.com'), `msg=${scrubbed.exception.values[0].value}`);
check('breadcrumb message scrubbed', !scrubbed.breadcrumbs[0].message.includes('bob@example.com'), `msg=${scrubbed.breadcrumbs[0].message}`);
check('breadcrumb data scrubbed', scrubbed.breadcrumbs[0].data.email === '[REDACTED]', `data=${JSON.stringify(scrubbed.breadcrumbs[0].data)}`);
check('user.email removed', scrubbed.user.email === undefined, 'email deleted');
check('user.ip_address removed', scrubbed.user.ip_address === undefined, 'ip deleted');
check('user.id retained (not PII)', scrubbed.user.id === 'u1', `id=${scrubbed.user.id}`);

// ── scrubTransaction ──
const tx: any = {
  request: { data: { name: 'Carol' }, headers: { authorization: 'Bearer zzz' } },
  breadcrumbs: [{ message: 'lead carol@example.com 555-000-1111', data: {} }],
};
const scrubbedTx = scrubTransaction(tx);
check('tx request.data removed', scrubbedTx.request.data === undefined, 'data deleted');
check('tx request.headers removed', scrubbedTx.request.headers === undefined, 'headers deleted');
check('tx breadcrumb scrubbed', !scrubbedTx.breadcrumbs[0].message.includes('carol@example.com'), `msg=${scrubbedTx.breadcrumbs[0].message}`);

console.log('════════════════════════════════════════════════════════════');
console.log(failures === 0 ? 'RESULT: ALL M10 SENTRY SCRUB CHECKS PASSED' : `RESULT: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
