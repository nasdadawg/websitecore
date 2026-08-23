import { z } from "zod";
import { generateText, Output } from "ai";
import { getModel } from "@/lib/ai/model";

/** Structured lead assessment produced by the AI scoring step. */
export const leadAnalysisSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  intent: z.enum(["ready_to_book", "researching", "low_intent", "unknown"]),
  budgetTier: z.enum(["premium", "mid", "budget", "unknown"]),
  summary: z.string().min(1).max(300),
});

export type LeadAnalysis = z.infer<typeof leadAnalysisSchema>;

export type LeadInput = {
  name?: string;
  phone?: string;
  email?: string;
  note?: string;
};

const SYSTEM_PROMPT = [
  "You are the lead qualification engine for a luxury local-services business (auto detailing, exotic car rentals, high-end event spaces).",
  "Score the inbound lead's purchase intent and fit on a 0-100 scale, classify intent, estimate budget tier, and write a one-line summary the owner can skim.",
  "Be conservative: when a lead is thin or ambiguous, lower the score and mark unknowns rather than guessing optimistically.",
].join("\n");

/** Run structured lead scoring with the configured model. */
export async function scoreLead(input: LeadInput): Promise<LeadAnalysis> {
  const model = getModel();

  const prompt = [
    "Analyze this inbound lead:",
    `Name: ${input.name ?? "(not provided)"}`,
    `Phone: ${input.phone ?? "(not provided)"}`,
    `Email: ${input.email ?? "(not provided)"}`,
    `Message: ${input.note ?? "(not provided)"}`,
  ].join("\n");

  const { output } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt,
    output: Output.object({ schema: leadAnalysisSchema, name: "lead_analysis" }),
  });

  return output;
}
