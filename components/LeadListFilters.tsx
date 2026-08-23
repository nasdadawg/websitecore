'use client';

import { usePathname } from 'next/navigation';
import * as qs from 'qs-esm';
import React from 'react';

/**
 * "Today" in UTC — nextFollowUp is a Payload `date` field with no `timezone`
 * configured, and the schema has no tenant/user timezone, so the app/database
 * convention is UTC. We never use the server/browser's local timezone.
 */
function utcDayBounds(): { today: string; tomorrow: string } {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    today: new Date(start).toISOString(),
    tomorrow: new Date(start + 86_400_000).toISOString(),
  };
}

/**
 * M7 — quick-filter links rendered above the Leads list.
 * Each link navigates to the same list view with a `where` query param,
 * so tenant-scoped read access applies unchanged.
 */
export const LeadListFilters = () => {
  const pathname = usePathname();
  const { today, tomorrow } = utcDayBounds();

  const filters = [
    { label: 'New', where: { status: { equals: 'new' } } },
    { label: 'No Follow-up Date', where: { nextFollowUp: { exists: false } } },
    {
      label: 'Due Today',
      where: {
        and: [
          { nextFollowUp: { greater_than_equal: today } },
          { nextFollowUp: { less_than: tomorrow } },
        ],
      },
    },
    {
      label: 'Overdue',
      where: {
        and: [
          { nextFollowUp: { less_than: today } },
          // Task spec said "status not in [booked, archived]", but the status
          // enum is new/qualified/contacted/won/lost/spam (a native Postgres
          // enum) — "booked"/"archived" don't exist and would error. The app's
          // "closed" statuses are won/lost, so we exclude those.
          { status: { not_in: ['won', 'lost'] } },
        ],
      },
    },
  ];

  const linkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--theme-elevation-300, #3a3a3a)',
    background: 'var(--theme-elevation-50, #141414)',
    color: 'var(--theme-elevation-800, #ececec)',
    fontSize: 13,
    lineHeight: 1.4,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0 12px' }}>
      {filters.map((f) => (
        <a
          key={f.label}
          href={`${pathname}?${qs.stringify({ where: f.where })}`}
          style={linkStyle}
        >
          {f.label}
        </a>
      ))}
    </div>
  );
};

export default LeadListFilters;
