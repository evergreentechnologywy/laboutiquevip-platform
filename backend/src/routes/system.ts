import type { ApiRequest, ApiResponse } from "../types.js";
import { PUBLIC_VERIFICATION_PROVIDERS, publicProviderVisibilityWhere } from "./providerVisibility.js";
import { readAllImportStatuses, readMaintenanceState } from "../lib/importControl.js";

interface SystemContext {
  prisma: any;
}

function isAdmin(request: ApiRequest): boolean {
  return request.auth?.roles.includes("admin") ?? false;
}

export async function systemStatusHandler(request: ApiRequest, context: SystemContext): Promise<ApiResponse> {
  const maintenance = await readMaintenanceState();
  const publicCatalogCount = await context.prisma.provider.count({
    where: publicProviderVisibilityWhere(),
  });

  const body: Record<string, unknown> = {
    ok: true,
    maintenance: {
      mode: maintenance.mode,
      banner: maintenance.mode === "soft"
        ? "Catalog refresh in progress — some listings may be temporarily unavailable."
        : maintenance.mode === "hard"
          ? "Site maintenance in progress. Please check back shortly."
          : null,
    },
    catalog: {
      publicCount: publicCatalogCount,
    },
    sources: PUBLIC_VERIFICATION_PROVIDERS,
  };

  if (isAdmin(request)) {
    const [totalProviders, pendingProviders, activeProviders] = await Promise.all([
      context.prisma.provider.count(),
      context.prisma.provider.count({
        where: { OR: [{ status: "pending_verification" }, { status: "pending_photos" }] },
      }),
      context.prisma.provider.count({ where: { status: "active" } }),
    ]);

    const imports = await readAllImportStatuses();
    body.detailed = {
      providers: { total: totalProviders, pending: pendingProviders, active: activeProviders },
      imports,
      maintenance,
    };
  }

  return { statusCode: 200, body };
}
