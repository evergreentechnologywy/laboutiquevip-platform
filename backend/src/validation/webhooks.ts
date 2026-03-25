import { z } from "zod";

export const nowpaymentsWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    invoice_id: z.string().min(1).optional(),
    external_ref: z.string().min(1).optional(),
    order_id: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    amount_cents: z.number().int().nonnegative().optional(),
    currency: z.string().min(1).optional(),
    entitlement: z.string().min(1).optional(),
  }),
}).superRefine((payload, ctx) => {
  if (!payload.data.invoice_id && !payload.data.external_ref && !payload.data.order_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data"],
      message: "invoice_id, external_ref, or order_id is required",
    });
  }
});

export const diditWebhookSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  verification_id: z.string().min(1).optional(),
  external_verification_ref: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((payload, ctx) => {
  if (!payload.status && !payload.event) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "status or event is required",
    });
  }

  if (!payload.verification_id && !payload.external_verification_ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["verification_id"],
      message: "verification_id or external_verification_ref is required",
    });
  }
});

export type NowpaymentsWebhookPayload = z.infer<typeof nowpaymentsWebhookSchema>;
export type DiditWebhookPayload = z.infer<typeof diditWebhookSchema>;
