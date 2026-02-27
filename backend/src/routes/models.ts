import type { AuditLogger } from "../utils/auditLogger.js";
import type { ApiRequest, ApiResponse } from "../types.js";
import {
  calendarUpdateSchema,
  formatValidationErrors,
  modelProfilePatchSchema,
  modelRegistrationSchema,
  tourCreateSchema,
  tourPatchSchema,
} from "../validation/models.js";
import { labelFromSlug, slugify } from "../utils/slug.js";
import { ZodError } from "zod";

interface ModelRoutesContext {
  prisma: any;
  auditLogger: AuditLogger;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function hasRole(request: ApiRequest, role: "admin" | "provider"): boolean {
  return request.auth?.roles.includes(role) ?? false;
}

function forbidden(message: string): ApiResponse {
  return json(403, { error: "forbidden", message });
}

function unauthorized(): ApiResponse {
  return json(401, { error: "unauthorized", message: "Authentication required" });
}

function resolveTargetUserId(request: ApiRequest): { userId?: string; error?: ApiResponse } {
  const currentUserId = request.auth?.userId;
  if (!currentUserId) {
    return { error: unauthorized() };
  }

  const targetUserId = request.query.get("user_id");
  if (!targetUserId) {
    return { userId: currentUserId };
  }

  if (!hasRole(request, "admin")) {
    return { error: forbidden("Only admins may access another provider profile") };
  }

  return { userId: targetUserId };
}

function profileResponse(profile: any): Record<string, unknown> {
  return {
    id: profile.id,
    userId: profile.userId,
    slug: profile.slug,
    displayName: profile.displayName,
    city: profile.city,
    bio: profile.bio,
    services: profile.services,
    rates: profile.rates,
    contactPreferences: profile.contactPreferences,
    isPublished: profile.isPublished,
    publishedAt: profile.publishedAt,
    isVerified: profile.isVerified,
    tags: (profile.tags ?? []).map((item: any) => item.tag.slug),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

async function ensureTags(prisma: any, tagSlugs: string[]): Promise<void> {
  if (tagSlugs.length === 0) {
    return;
  }

  await Promise.all(
    tagSlugs.map((slug) =>
      prisma.modelTag.upsert({
        where: { slug },
        create: { slug, label: labelFromSlug(slug) },
        update: { label: labelFromSlug(slug) },
      }),
    ),
  );
}

function validationError(error: ZodError): ApiResponse {
  return json(400, {
    error: "validation_error",
    issues: formatValidationErrors(error),
  });
}

function uniqueTagSlugs(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => slugify(tag)).filter(Boolean))];
}

export async function registerModelHandler(request: ApiRequest, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!request.auth?.userId) {
    return unauthorized();
  }

  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  try {
    const payload = modelRegistrationSchema.parse(request.body ?? {});
    const profileExists = await context.prisma.providerProfile.findUnique({
      where: { userId: request.auth.userId },
    });

    if (profileExists) {
      return json(409, {
        error: "already_registered",
        message: "Provider profile already exists",
      });
    }

    const citySlug = slugify(payload.city);
    const profileSlug = `${slugify(payload.displayName)}-${citySlug}-${request.auth.userId.slice(0, 8)}`;
    const tagSlugs = uniqueTagSlugs(payload.tags);

    await ensureTags(context.prisma, tagSlugs);

    const created = await context.prisma.providerProfile.create({
      data: {
        userId: request.auth.userId,
        slug: profileSlug,
        displayName: payload.displayName,
        city: payload.city,
        citySlug,
        bio: payload.bio,
        services: payload.services,
        rates: payload.rates,
        contactPreferences: payload.contactPreferences,
        isPublished: payload.isPublished,
        publishedAt: payload.isPublished ? new Date() : null,
        tags: {
          create: tagSlugs.map((slug) => ({
            tag: { connect: { slug } },
          })),
        },
      },
      include: {
        tags: { include: { tag: true } },
      },
    });

    await context.auditLogger.append({
      actorId: request.auth.userId,
      action: "provider_profile.create",
      resourceType: "provider_profile",
      resourceId: created.id,
      metadata: {
        userId: created.userId,
        slug: created.slug,
        isPublished: created.isPublished,
      },
    });

    return json(201, { profile: profileResponse(created) });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return json(500, { error: "internal_error" });
  }
}

export async function getModelMeHandler(request: ApiRequest, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  const resolved = resolveTargetUserId(request);
  if (resolved.error) {
    return resolved.error;
  }

  const profile = await context.prisma.providerProfile.findUnique({
    where: { userId: resolved.userId },
    include: {
      tags: { include: { tag: true } },
    },
  });

  if (!profile) {
    return json(404, {
      error: "not_found",
      message: "Provider profile not found",
    });
  }

  return json(200, { profile: profileResponse(profile) });
}

export async function patchModelMeHandler(request: ApiRequest, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  const resolved = resolveTargetUserId(request);
  if (resolved.error) {
    return resolved.error;
  }

  try {
    const payload = modelProfilePatchSchema.parse(request.body ?? {});
    const existing = await context.prisma.providerProfile.findUnique({
      where: { userId: resolved.userId },
    });

    if (!existing) {
      return json(404, {
        error: "not_found",
        message: "Provider profile not found",
      });
    }

    const tags = uniqueTagSlugs(payload.tags);
    if (payload.tags) {
      await ensureTags(context.prisma, tags);
    }

    const nextDisplayName = payload.displayName ?? existing.displayName;
    const nextCity = payload.city ?? existing.city;
    const nextCitySlug = slugify(nextCity);

    const updated = await context.prisma.providerProfile.update({
      where: { userId: resolved.userId },
      data: {
        displayName: payload.displayName,
        city: payload.city,
        citySlug: payload.city ? nextCitySlug : undefined,
        slug: payload.displayName || payload.city
          ? `${slugify(nextDisplayName)}-${nextCitySlug}-${existing.userId.slice(0, 8)}`
          : undefined,
        bio: payload.bio,
        services: payload.services,
        rates: payload.rates,
        contactPreferences: payload.contactPreferences,
        isPublished: payload.isPublished,
        publishedAt: payload.isPublished === undefined
          ? undefined
          : payload.isPublished
            ? new Date()
            : null,
        tags: payload.tags
          ? {
              deleteMany: {},
              create: tags.map((slug) => ({
                tag: { connect: { slug } },
              })),
            }
          : undefined,
      },
      include: {
        tags: { include: { tag: true } },
      },
    });

    await context.auditLogger.append({
      actorId: request.auth?.userId ?? null,
      action: "provider_profile.update",
      resourceType: "provider_profile",
      resourceId: updated.id,
      metadata: {
        targetUserId: resolved.userId,
      },
    });

    return json(200, { profile: profileResponse(updated) });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return json(500, { error: "internal_error" });
  }
}

async function getProfileByRequest(request: ApiRequest, context: ModelRoutesContext): Promise<{ profile?: any; error?: ApiResponse }> {
  const resolved = resolveTargetUserId(request);
  if (resolved.error) {
    return { error: resolved.error };
  }

  const profile = await context.prisma.providerProfile.findUnique({
    where: { userId: resolved.userId },
  });

  if (!profile) {
    return {
      error: json(404, { error: "not_found", message: "Provider profile not found" }),
    };
  }

  return { profile };
}

export async function getCalendarHandler(request: ApiRequest, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  const resolved = await getProfileByRequest(request, context);
  if (resolved.error) {
    return resolved.error;
  }

  const blocks = await context.prisma.providerAvailabilityBlock.findMany({
    where: { profileId: resolved.profile.id },
    orderBy: [{ startsAt: "asc" }],
  });

  return json(200, { blocks });
}

export async function putCalendarHandler(request: ApiRequest, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  try {
    const payload = calendarUpdateSchema.parse(request.body ?? {});
    const resolved = await getProfileByRequest(request, context);
    if (resolved.error) {
      return resolved.error;
    }

    await context.prisma.$transaction([
      context.prisma.providerAvailabilityBlock.deleteMany({
        where: { profileId: resolved.profile.id },
      }),
      context.prisma.providerAvailabilityBlock.createMany({
        data: payload.blocks.map((block) => ({
          profileId: resolved.profile.id,
          city: block.city,
          citySlug: slugify(block.city),
          startsAt: new Date(block.startsAt),
          endsAt: new Date(block.endsAt),
          isAvailable: block.isAvailable,
        })),
      }),
    ]);

    await context.auditLogger.append({
      actorId: request.auth?.userId ?? null,
      action: "provider_calendar.update",
      resourceType: "provider_profile",
      resourceId: resolved.profile.id,
      metadata: { blockCount: payload.blocks.length },
    });

    return getCalendarHandler(request, context);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return json(500, { error: "internal_error" });
  }
}

export async function getToursHandler(request: ApiRequest, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  const resolved = await getProfileByRequest(request, context);
  if (resolved.error) {
    return resolved.error;
  }

  const tours = await context.prisma.providerTour.findMany({
    where: { profileId: resolved.profile.id },
    orderBy: [{ startsAt: "asc" }],
  });

  return json(200, { tours });
}

export async function postToursHandler(request: ApiRequest, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  try {
    const payload = tourCreateSchema.parse(request.body ?? {});
    const resolved = await getProfileByRequest(request, context);
    if (resolved.error) {
      return resolved.error;
    }

    const created = await context.prisma.providerTour.create({
      data: {
        profileId: resolved.profile.id,
        city: payload.city,
        citySlug: slugify(payload.city),
        startsAt: new Date(payload.startsAt),
        endsAt: new Date(payload.endsAt),
        notes: payload.notes,
      },
    });

    await context.auditLogger.append({
      actorId: request.auth?.userId ?? null,
      action: "provider_tour.create",
      resourceType: "provider_tour",
      resourceId: created.id,
      metadata: { profileId: resolved.profile.id },
    });

    return json(201, { tour: created });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return json(500, { error: "internal_error" });
  }
}

export async function patchTourHandler(request: ApiRequest, tourId: string, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  try {
    const payload = tourPatchSchema.parse(request.body ?? {});
    const resolved = await getProfileByRequest(request, context);
    if (resolved.error) {
      return resolved.error;
    }

    const existing = await context.prisma.providerTour.findFirst({
      where: { id: tourId, profileId: resolved.profile.id },
    });

    if (!existing) {
      return json(404, { error: "not_found", message: "Tour not found" });
    }

    const startsAt = payload.startsAt ? new Date(payload.startsAt) : existing.startsAt;
    const endsAt = payload.endsAt ? new Date(payload.endsAt) : existing.endsAt;

    if (startsAt > endsAt) {
      return json(400, {
        error: "validation_error",
        issues: [{ path: "startsAt", message: "startsAt must be before or equal to endsAt" }],
      });
    }

    const updated = await context.prisma.providerTour.update({
      where: { id: tourId },
      data: {
        city: payload.city,
        citySlug: payload.city ? slugify(payload.city) : undefined,
        startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
        endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
        notes: payload.notes,
      },
    });

    await context.auditLogger.append({
      actorId: request.auth?.userId ?? null,
      action: "provider_tour.update",
      resourceType: "provider_tour",
      resourceId: updated.id,
      metadata: { profileId: resolved.profile.id },
    });

    return json(200, { tour: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return json(500, { error: "internal_error" });
  }
}

export async function deleteTourHandler(request: ApiRequest, tourId: string, context: ModelRoutesContext): Promise<ApiResponse> {
  if (!hasRole(request, "provider") && !hasRole(request, "admin")) {
    return forbidden("Provider role required");
  }

  const resolved = await getProfileByRequest(request, context);
  if (resolved.error) {
    return resolved.error;
  }

  const existing = await context.prisma.providerTour.findFirst({
    where: { id: tourId, profileId: resolved.profile.id },
  });

  if (!existing) {
    return json(404, { error: "not_found", message: "Tour not found" });
  }

  await context.prisma.providerTour.delete({ where: { id: tourId } });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "provider_tour.delete",
    resourceType: "provider_tour",
    resourceId: tourId,
    metadata: { profileId: resolved.profile.id },
  });

  return {
    statusCode: 204,
    body: null,
  };
}
