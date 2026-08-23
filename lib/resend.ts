import { Resend } from "resend";
import { env, requireSecret } from "@/lib/env";
import type { LeadAnalysis } from "@/lib/ai/lead";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(requireSecret("RESEND_API_KEY", env.RESEND_API_KEY));
  }
  return resend;
}

/**
 * Dynamic "from" address per tenant.
 * NOTE: a custom tenant domain will only deliver once it's verified in Resend —
 * otherwise fall back to the single verified `RESEND_FROM_DOMAIN`.
 */
function fromAddress(tenantDomain?: string): string {
  if (tenantDomain && env.RESEND_FROM_DOMAIN === tenantDomain) {
    return `concierge@${tenantDomain}`;
  }
  return `concierge@${env.RESEND_FROM_DOMAIN || "updates.example.com"}`;
}

export type LeadAlertInput = {
  to: string;
  tenantName: string;
  tenantDomain?: string;
  leadId: string;
  lead: { name?: string; phone?: string; email?: string; note?: string };
  analysis: LeadAnalysis;
};

export async function sendLeadAlertEmail(input: LeadAlertInput) {
  const subject = `New ${input.analysis.budgetTier} lead · ${input.analysis.fitScore}/100 — ${input.lead.name ?? "Anonymous"}`;

  const { data, error } = await getResend().emails.send({
    from: fromAddress(input.tenantDomain),
    to: [input.to],
    subject,
    html: buildHtml(input),
    ...(input.lead.email ? { replyTo: input.lead.email } : {}),
  });

  if (error) {
    throw new Error(`Resend failed to send lead alert: ${error.message}`);
  }
  return data;
}

function buildHtml(input: LeadAlertInput): string {
  const { lead, analysis, tenantName } = input;
  const contactLine = [lead.phone, lead.email]
    .filter((x): x is string => Boolean(x))
    .map(escapeHtml)
    .join(" · ");

  return `<!doctype html>
<html>
<body style="margin:0;background:#0a0a0b;color:#e7e5e4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <p style="margin:0 0 8px;color:#d4ad54;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;">New lead · ${escapeHtml(tenantName)}</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#fafaf9;">${escapeHtml(lead.name ?? "Anonymous")}</h1>
    <div style="background:#141416;border:1px solid #26262a;border-radius:12px;padding:20px;margin:0 0 20px;">
      <p style="margin:0 0 10px;font-size:14px;line-height:1.6;">${escapeHtml(lead.note ?? "(no message)")}</p>
      <p style="margin:0;font-size:13px;color:#a8a29e;">${contactLine || "&nbsp;"}</p>
    </div>
    <div style="display:flex;gap:12px;margin:0 0 24px;">
      ${scorePill("Fit score", `${analysis.fitScore}/100`)}
      ${scorePill("Intent", analysis.intent)}
      ${scorePill("Budget", analysis.budgetTier)}
    </div>
    <p style="margin:0;font-size:13px;color:#78716c;">${escapeHtml(analysis.summary)}</p>
  </div>
</body>
</html>`;
}

function scorePill(label: string, value: string): string {
  return `<div style="flex:1;background:#141416;border:1px solid #26262a;border-radius:8px;padding:10px 12px;">
    <div style="font-size:10px;color:#78716c;letter-spacing:0.12em;text-transform:uppercase;">${label}</div>
    <div style="font-size:16px;font-weight:600;color:#fafaf9;">${escapeHtml(value)}</div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
