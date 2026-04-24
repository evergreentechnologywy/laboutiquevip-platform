import type { SearchModelsQuery } from "../validation/models.js";
import { slugify } from "../utils/slug.js";

export interface SearchFilterResult {
  where: Record<string, unknown>;
  skip: number;
  take: number;
}

export function buildSearchModelFilters(query: SearchModelsQuery): SearchFilterResult {
  const where: Record<string, unknown> = {
    isPublished: true,
  };

  if (query.verified !== undefined) {
    where.isVerified = query.verified;
  }

  const andFilters: Record<string, unknown>[] = [
    {
      NOT: {
        OR: [
          { displayName: { contains: "Batch", mode: "insensitive" } },
          { displayName: { contains: "User", mode: "insensitive" } },
          { displayName: { contains: "mixed", mode: "insensitive" } },
          { displayName: { contains: "simulation", mode: "insensitive" } },
          { displayName: { contains: "test", mode: "insensitive" } },
          { displayName: { contains: "approval", mode: "insensitive" } },
          { displayName: { contains: "concurrency", mode: "insensitive" } },
          { bio: { contains: "simulation", mode: "insensitive" } },
          { bio: { contains: "test", mode: "insensitive" } },
          { bio: { contains: "mixed live-site", mode: "insensitive" } },
          { bio: { contains: "simultaneous approval", mode: "insensitive" } },
          { bio: { contains: "concurrency", mode: "insensitive" } },
          { bio: { contains: "created during", mode: "insensitive" } },
        ],
      },
    },
  ];

  if (query.tag) {
    andFilters.push({
      tags: {
        some: {
          tag: {
            slug: query.tag,
          },
        },
      },
    });
  }

  if (query.city) {
    const citySlug = slugify(query.city);
    andFilters.push({
      OR: [
        { citySlug },
        { availabilityBlocks: { some: { citySlug } } },
        { tours: { some: { citySlug } } },
      ],
    });
  }

  if (query.availableFrom || query.availableTo) {
    const overlapFilter: Record<string, unknown> = {
      isAvailable: true,
    };

    if (query.availableFrom) {
      overlapFilter.endsAt = { gte: new Date(query.availableFrom) };
    }

    if (query.availableTo) {
      overlapFilter.startsAt = { lte: new Date(query.availableTo) };
    }

    andFilters.push({
      availabilityBlocks: {
        some: overlapFilter,
      },
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  return {
    where,
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  };
}
