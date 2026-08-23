import { serve } from "@upstash/workflow/nextjs";
import { adminSupabase } from "@/lib/supabase/admin";
import { scoreLead } from "@/lib/ai/lead";
import { sendLeadAlertEmail } from "@/lib/resend";
import { leadWorkflowPayloadSchema, type LeadWorkflowPayload } from "@/lib/lead";

// Each `context.run()` call is a durable step: if it throws, QStash retries
// that step (not the whole workflow) until it succeeds or hits the retry cap.
export const maxDuration = 300;

export const { POST } = serve<LeadWorkflowPayload>(async (context) => {
  const payload = leadWorkflowPayloadSchema.parse(context.requestPayload);

  // 1) Score intent + fit (0-100) with structured AI output.
  const analysis = await context.run("score-lead", () =>
    scoreLead({
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      note: payload.note,
    }),
  );

  // 2) Persist the enriched lead. Idempotent via dedupe_key = workflow run id,
  //    so a retried step upserts the same row instead of double-inserting.
  const saved = await context.run("save-lead", async () => {
    const { data, error } = await adminSupabase()
      .from("leads")
      .upsert(
        {
          tenant_id: payload.tenantId,
          dedupe_key: context.workflowRunId,
          name: payload.name ?? null,
          phone: payload.phone ?? null,
          email: payload.email ?? null,
          note: payload.note ?? null,
          source: payload.source ?? null,
          fit_score: analysis.fitScore,
          intent: analysis.intent,
          budget_tier: analysis.budgetTier,
          summary: analysis.summary,
          status: analysis.fitScore >= 70 ? "qualified" : "new",
        },
        { onConflict: "dedupe_key" },
      )
      .select("id")
      .single();

    if (error) throw new Error(`Failed to save lead: ${error.message}`);
    return { id: data.id };
  });

  // 3) Notify the owner. Owner contact is resolved here (service role) so the
  //    public route never touches private tenant columns.
  await context.run("notify-owner", async () => {
    const { data: tenant, error } = await adminSupabase()
      .from("tenants")
      .select("name, contact_email, domain")
      .eq("id", payload.tenantId)
      .single();

    if (error || !tenant) {
      throw new Error(`Tenant not found for lead: ${error?.message ?? "unknown"}`);
    }

    await sendLeadAlertEmail({
      to: tenant.contact_email,
      tenantName: tenant.name,
      tenantDomain: tenant.domain ?? undefined,
      leadId: saved.id,
      lead: { name: payload.name, phone: payload.phone, email: payload.email, note: payload.note },
      analysis,
    });
  });

  return { leadId: saved.id, fitScore: analysis.fitScore };
});
