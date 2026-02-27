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

  const andFilters: Record<string, unknown>[] = [];

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
    const overlapFilter: Record<string, unknown> = {};

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
