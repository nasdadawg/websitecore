'use client';

import React, { useState } from 'react';
import { useConfig, useDocumentInfo } from '@payloadcms/ui';

const TERMINAL_STATUSES = ['won', 'lost', 'spam'] as const;

type Mode = 'schedule' | 'close' | null;

/**
 * M9 — Guided "complete follow-up" action on the lead detail view.
 *
 * Exactly two mutually exclusive paths:
 *   1. Schedule — pick a future `nextFollowUp` date.
 *   2. Close    — pick a terminal status (won/lost/spam).
 *
 * Sends a transient `_completeFollowUp: true` marker alongside the update. The
 * server-side `beforeValidate` hook enforces exactly-one-of (valid future date
 * XOR terminal status) and never persists the marker.
 */
export const CompleteFollowUp = () => {
  const { id } = useDocumentInfo();
  const { config } = useConfig();
  const [mode, setMode] = useState<Mode>(null);
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [status, setStatus] = useState('won');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Only render on an existing document (never on the create view).
  if (!id) return null;

  async function submit() {
    const data: Record<string, unknown> = { _completeFollowUp: true };
    if (mode === 'schedule' && nextFollowUp) {
      data.nextFollowUp = new Date(nextFollowUp).toISOString();
    } else if (mode === 'close') {
      data.status = status;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${config.routes.api}/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: true, message: 'Follow-up completed.' });
        // Refresh so the detail view and M7 list filters reflect the change.
        window.location.reload();
      } else {
        const message =
          (body as { errors?: { message?: string }[] })?.errors?.[0]?.message ||
          (body as { message?: string })?.message ||
          `Request failed (${res.status})`;
        setResult({ ok: false, message });
      }
    } catch {
      setResult({ ok: false, message: 'Network error while completing follow-up.' });
    } finally {
      setBusy(false);
    }
  }

  const card: React.CSSProperties = {
    marginBottom: 24,
    padding: '16px 18px',
    borderRadius: 8,
    border: '1px solid var(--theme-elevation-300, #3a3a3a)',
    background: 'var(--theme-elevation-50, #141414)',
    color: 'var(--theme-elevation-800, #ececec)',
  };
  const heading: React.CSSProperties = {
    margin: '0 0 4px',
    fontSize: 15,
    fontWeight: 600,
  };
  const hint: React.CSSProperties = { margin: '0 0 12px', fontSize: 13, opacity: 0.7 };
  const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 };
  const input: React.CSSProperties = {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--theme-elevation-300, #3a3a3a)',
    background: 'var(--theme-elevation-100, #1a1a1a)',
    color: 'var(--theme-elevation-800, #ececec)',
    fontSize: 13,
  };
  const button: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--theme-success-500, #1f9e56)',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
  };

  return (
    <div style={card}>
      <p style={heading}>Complete follow-up</p>
      <p style={hint}>Choose exactly one path — schedule a next date, or close the lead.</p>

      <div style={row}>
        <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="radio"
            checked={mode === 'schedule'}
            onChange={() => {
              setMode('schedule');
              setResult(null);
            }}
          />
          Schedule next follow-up
        </label>
        {mode === 'schedule' && (
          <input
            type="datetime-local"
            value={nextFollowUp}
            onChange={(e) => setNextFollowUp(e.target.value)}
            style={input}
          />
        )}
      </div>

      <div style={row}>
        <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="radio"
            checked={mode === 'close'}
            onChange={() => {
              setMode('close');
              setResult(null);
            }}
          />
          Close lead
        </label>
        {mode === 'close' && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            {TERMINAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        )}
      </div>

      <button onClick={submit} disabled={busy || !mode} style={button}>
        {busy ? 'Saving…' : 'Complete follow-up'}
      </button>

      {result && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            color: result.ok ? 'var(--theme-success-500, #1f9e56)' : 'var(--theme-error-500, #e11d48)',
          }}
        >
          {result.message}
        </p>
      )}
    </div>
  );
};

export default CompleteFollowUp;
