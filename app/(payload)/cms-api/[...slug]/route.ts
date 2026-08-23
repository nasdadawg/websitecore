import config from '@/payload.config';
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes';

// Payload REST API is served under /cms-api (see payload.config.ts `routes.api`),
// keeping the custom public intake handler at POST /api/leads unambiguous.
// GraphQL is intentionally NOT mounted.
export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
