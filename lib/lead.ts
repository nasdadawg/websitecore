import { z } from "zod";

/** Raw lead form submitted by a public visitor. */
export const leadFormSchema = z
  .object({
    name: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(50).optional(),
    email: z.string().trim().max(254).optional(),
    note: z.string().trim().max(5000).optional(),
  })
  .refine((v) => v.name || v.phone || v.email, {
    message: "At least one of name, phone, or email is required.",
  });

export type LeadFormInput = z.infer<typeof leadFormSchema>;

/** Payload sent from the API route to the durable workflow. */
export const leadWorkflowPayloadSchema = leadFormSchema.extend({
  tenantId: z.string().uuid(),
  source: z.string().trim().max(500).optional(),
});

export type LeadWorkflowPayload = z.infer<typeof leadWorkflowPayloadSchema>;
