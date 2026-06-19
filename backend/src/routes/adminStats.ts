import type { ApiRequest, ApiResponse } from "../types.js";

interface AdminStatsContext {
  prisma: any;
}

export async function adminStatsHandler(_request: ApiRequest, context: AdminStatsContext): Promise<ApiResponse> {
  try {
    const [
      totalProviders,
      pendingProviders,
      pendingPhotoProviders,
      activeProviders,
      suspendedProviders,
      verifiedProviders,
      pendingReviews,
      totalReviews,
      totalUsers,
    ] = await Promise.all([
      context.prisma.provider.count(),
      context.prisma.provider.count({ where: { status: "pending_verification" } }),
      context.prisma.provider.count({ where: { status: "pending_photos" } }),
      context.prisma.provider.count({ where: { status: "active" } }),
      context.prisma.provider.count({ where: { status: "suspended" } }),
      context.prisma.provider.count({ where: { is_verified: true } }),
      context.prisma.review.count({ where: { status: "pending" } }),
      context.prisma.review.count(),
      context.prisma.user.count(),
    ]);

    return {
      statusCode: 200,
      body: {
        providers: {
          total: totalProviders,
          pending: pendingProviders + pendingPhotoProviders,
          active: activeProviders,
          suspended: suspendedProviders,
          verified: verifiedProviders,
        },
        reviews: {
          total: totalReviews,
          pending: pendingReviews,
        },
        users: {
          total: totalUsers,
        },
      },
    };
  } catch (e: any) {
    console.error("adminStatsHandler error:", e?.message || e);
    return { statusCode: 500, body: { error: "internal_server_error" } };
  }
}
