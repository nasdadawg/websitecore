import { withSentryConfig } from '@sentry/nextjs';
import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Payload config is handled by withPayload (externalizes server-only packages
  // like @payloadcms/db-postgres + drizzle-kit so Turbopack doesn't bundle them).
};

export default withSentryConfig(withPayload(nextConfig), {
  silent: true,
  sourcemaps: { disable: true },
});
