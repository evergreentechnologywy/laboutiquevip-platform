import { z } from "zod";

function optionalStringFromUnknown(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text ? text : undefined;
}

const normalizedNowpaymentsWebhookSchema = z.object({
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

export const nowpaymentsWebhookSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object") {
    return input;
  }

  const payload = input as Record<string, unknown>;
  if (payload.data && typeof payload.data === "object") {
    return payload;
  }

  const paymentId = optionalStringFromUnknown(payload.payment_id);
  const invoiceId = optionalStringFromUnknown(payload.invoice_id);
  const purchaseId = optionalStringFromUnknown(payload.purchase_id);
  const status = optionalStringFromUnknown(payload.payment_status);
  const orderId = optionalStringFromUnknown(payload.order_id);

  return {
    id: paymentId ?? invoiceId ?? purchaseId ?? orderId,
    type: status ? `payment.${status}` : "payment.updated",
    data: {
      invoice_id: invoiceId,
      external_ref: orderId,
      order_id: orderId,
      status,
      currency: optionalStringFromUnknown(payload.price_currency),
      amount_cents: (() => {
        const priceAmount = payload.price_amount ?? payload.actually_paid_at_fiat;
        if (typeof priceAmount === "number" && Number.isFinite(priceAmount)) {
          return Math.round(priceAmount * 100);
        }
        if (typeof priceAmount === "string") {
          const parsed = Number(priceAmount);
          if (Number.isFinite(parsed)) {
            return Math.round(parsed * 100);
          }
        }
        return undefined;
      })(),
    },
  };
}, normalizedNowpaymentsWebhookSchema);

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
