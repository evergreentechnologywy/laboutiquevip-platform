import { z } from "zod";
import { slugify } from "../utils/slug.js";

const dateStringSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Invalid ISO datetime",
  });

const tagSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .transform((value) => slugify(value));

const servicesSchema = z.array(z.string().trim().min(1).max(80)).max(25);

const ratesSchema = z
  .object({
    currency: z.string().trim().min(3).max(3).default("USD"),
    incall: z.number().finite().nonnegative().optional(),
    outcall: z.number().finite().nonnegative().optional(),
    hourly: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

const contactPreferencesSchema = z
  .object({
    telegram: z.string().trim().max(120).optional(),
    signal: z.string().trim().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().trim().max(32).optional(),
    acceptsCalls: z.boolean().optional(),
    acceptsTexts: z.boolean().optional(),
  })
  .passthrough();

export const modelRegistrationSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(80),
  bio: z.string().trim().min(10).max(4000),
  services: servicesSchema.default([]),
  rates: ratesSchema.default({ currency: "USD" }),
  contactPreferences: contactPreferencesSchema.default({}),
  tags: z.array(tagSchema).max(20).default([]),
  isPublished: z.boolean().optional().default(false),
});

export const modelProfilePatchSchema = modelRegistrationSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const dateRangeBaseSchema = z.object({
  startsAt: dateStringSchema,
  endsAt: dateStringSchema,
});

const dateRangeSchema = dateRangeBaseSchema.refine(
  (value) => new Date(value.startsAt) <= new Date(value.endsAt),
  {
    message: "startsAt must be before or equal to endsAt",
    path: ["startsAt"],
  },
);

export const availabilityBlockSchema = z.object({
  city: z.string().trim().min(2).max(80),
  startsAt: dateStringSchema,
  endsAt: dateStringSchema,
  isAvailable: z.boolean().default(true),
});

export const calendarUpdateSchema = z
  .object({
    blocks: z.array(availabilityBlockSchema).max(500),
  })
  .superRefine((value, ctx) => {
    for (const [index, block] of value.blocks.entries()) {
      if (new Date(block.startsAt) > new Date(block.endsAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", index, "startsAt"],
          message: "startsAt must be before or equal to endsAt",
        });
      }
    }
  });

const tourBaseSchema = z.object({
  city: z.string().trim().min(2).max(80),
  startsAt: dateStringSchema,
  endsAt: dateStringSchema,
  notes: z.string().trim().max(1000).optional(),
});

export const tourCreateSchema = tourBaseSchema.refine(
  (value) => new Date(value.startsAt) <= new Date(value.endsAt),
  {
    message: "startsAt must be before or equal to endsAt",
    path: ["startsAt"],
  },
);

export const tourPatchSchema = tourBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && new Date(value.startsAt) > new Date(value.endsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "startsAt must be before or equal to endsAt",
      });
    }
  });

export interface SearchModelsQuery {
  city?: string;
  verified?: boolean;
  tag?: string;
  availableFrom?: string;
  availableTo?: string;
  page: number;
  limit: number;
}

export const searchModelsQuerySchema = z
  .object({
    city: z.string().trim().min(1).max(80).optional(),
    verified: z.enum(["true", "false"]).optional(),
    tag: tagSchema.optional(),
    available_from: dateStringSchema.optional(),
    available_to: dateStringSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((value, ctx) => {
    if (value.available_from && value.available_to) {
      const from = new Date(value.available_from);
      const to = new Date(value.available_to);
      if (from > to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["available_from"],
          message: "available_from must be before or equal to available_to",
        });
      }
    }
  })
  .transform((value): SearchModelsQuery => ({
    city: value.city,
    verified: value.verified === undefined ? undefined : value.verified === "true",
    tag: value.tag,
    availableFrom: value.available_from,
    availableTo: value.available_to,
    page: value.page,
    limit: value.limit,
  }));

export function formatValidationErrors(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
