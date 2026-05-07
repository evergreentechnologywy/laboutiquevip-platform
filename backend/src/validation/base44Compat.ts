import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(120).optional(),
  fullName: z.string().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

const providerEditableFields = {
  display_name: z.string().min(1).max(120),
  tagline: z.string().max(250).optional().nullable(),
  bio: z.string().max(4000).optional().nullable(),
  location_city: z.string().max(120).optional().nullable(),
  location_state: z.string().max(120).optional().nullable(),
  location_country: z.string().max(120).optional().nullable(),
  age: z.number().int().min(18).max(99).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(320).optional().nullable(),
  verification_provider: z.string().max(120).optional().nullable(),
  verification_username: z.string().max(120).optional().nullable(),
  verification_url: z.string().url().max(2000).optional().nullable(),
  review_provider: z.string().max(120).optional().nullable(),
  review_username: z.string().max(120).optional().nullable(),
  review_url: z.string().url().max(2000).optional().nullable(),
  rate_hourly: z.number().int().min(0).max(1000000).optional().nullable(),
  ad_package: z.enum(["none", "basic", "featured", "premium", "elite"]).optional().nullable(),
  ad_package_expiry: z.string().max(50).optional().nullable(),
  ad_package_started_at: z.string().max(80).optional().nullable(),
  ad_package_expiration_reminder_sent_at: z.string().max(80).optional().nullable(),
  verification_documents: z.array(z.string().max(2000)).max(25).optional(),
  photos: z.array(z.string().max(2000)).max(50).optional(),
  pending_photos: z.array(z.string().max(2000)).max(50).optional(),
  status: z.string().max(80).optional(),
  is_premium: z.boolean().optional(),
};

export const providerCreateSchema = z.object({
  user_id: z.string().uuid(),
  ...providerEditableFields,
}).strict();

export const providerUpdateSchema = z.object(providerEditableFields).partial().strict();

export const providerAdminUpdateSchema = providerUpdateSchema.extend({
  status: z.string().max(80).optional(),
  photos: z.array(z.string().max(2000)).max(50).optional(),
  is_verified: z.boolean().optional(),
  is_profile_approved: z.boolean().optional(),
  admin_notes: z.string().max(4000).optional().nullable(),
  rejection_reason: z.string().max(4000).optional().nullable(),
}).strict();

const guestEmailSchema = z.string().email().max(320);

export const bookingCreateSchema = z.object({
  provider_id: z.string().uuid(),
  booking_date: z.string().max(50).optional().nullable(),
  booking_time: z.string().max(50).optional().nullable(),
  duration: z.string().max(50).optional().nullable(),
  client_name: z.string().min(1).max(120),
  client_email: guestEmailSchema,
  client_phone: z.string().max(50).optional().nullable(),
  special_requests: z.string().max(2000).optional().nullable(),
}).passthrough();

export const messageCreateSchema = z.object({
  provider_id: z.string().uuid(),
  sender_name: z.string().min(1).max(120),
  sender_email: guestEmailSchema,
  subject: z.string().min(1).max(160),
  message: z.string().min(3).max(3000),
}).passthrough();

export const reviewCreateSchema = z.object({
  provider_id: z.string().uuid(),
  reviewer_name: z.string().min(1).max(120).optional().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).max(2000).optional().nullable(),
}).passthrough();

export const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  data: z.string().min(1),
});
