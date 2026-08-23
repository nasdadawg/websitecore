import { Resend } from 'resend';
import { env } from '../env';

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

export type NotifyOwnerInput = {
  tenantName: string;
  notifyEmail: string;
  lead: { name?: string; phone?: string; email?: string; message?: string };
};

/**
 * Send the owner notification. NEVER throws — per API-CONTRACT.md a failed
 * email must not un-save a lead. Failures are logged and the flow moves on.
 */
export async function notifyOwner(input: NotifyOwnerInput): Promise<void> {
  const r = getResend();
  if (!r) {
    console.warn('[notify] RESEND_API_KEY not configured — skipping owner notification.');
    return;
  }

  const from = `concierge@${env.RESEND_FROM_DOMAIN || 'updates.example.com'}`;

  try {
    const { error } = await r.emails.send({
      from,
      to: [input.notifyEmail],
      subject: `New lead — ${input.lead.name ?? 'Anonymous'}`,
      html: buildHtml(input),
      ...(input.lead.email ? { replyTo: input.lead.email } : {}),
    });
    if (error) {
      console.error('[notify] Resend error:', error.message);
    }
  } catch (err) {
    console.error('[notify] failed to send owner notification:', err);
  }
}

function buildHtml(input: NotifyOwnerInput): string {
  const { lead, tenantName } = input;
  const contact = [lead.phone, lead.email].filter(Boolean).join(' · ');
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  return `<!doctype html>
<html><body style="margin:0;background:#0a0a0b;color:#e7e5e4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <p style="margin:0 0 8px;color:#d4ad54;font-size:12px;letter-spacing:.2em;text-transform:uppercase;">New lead · ${esc(tenantName)}</p>
  <h1 style="margin:0 0 16px;font-size:26px;color:#fafaf9;">${esc(lead.name ?? 'Anonymous')}</h1>
  <div style="background:#141416;border:1px solid #26262a;border-radius:12px;padding:20px;margin:0 0 20px;">
    <p style="margin:0 0 10px;font-size:14px;line-height:1.6;">${esc(lead.message ?? '(no message)')}</p>
    <p style="margin:0;font-size:13px;color:#a8a29e;">${esc(contact)}</p>
  </div>
</div></body></html>`;
}
