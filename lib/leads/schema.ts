import { z } from 'zod';

/**
 * Inbound lead payload per API-CONTRACT.md.
 * `name` and `phone` are required; `email` and `message` are optional.
 */
export const LeadIntakeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(50),
  email: z.string().trim().max(254).optional(),
  message: z.string().trim().max(5000).optional(),
});

export type LeadIntake = z.infer<typeof LeadIntakeSchema>;

/**
 * AI structured-output contract (API-CONTRACT.md).
 * Defined here for the later AI module — NOT wired into M2 intake.
 * The model only recommends; deterministic code and a human decide.
 */
export const LeadIntelligenceSchema = z.object({
  priority: z.enum(['low', 'normal', 'high', 'vip']),
  intentScore: z.number().int().min(0).max(100),
  summary: z.string().max(500),
  extractedFacts: z.record(z.string(), z.string()),
  missingInformation: z.array(z.string()).max(8),
  recommendedAction: z.string().max(300),
  recommendedChannel: z.enum(['call', 'text', 'email', 'human-review']),
  requiresHumanReview: z.boolean(),
  prohibitedClaimsDetected: z.array(z.string()).max(8),
});

export type LeadIntelligence = z.infer<typeof LeadIntelligenceSchema>;
