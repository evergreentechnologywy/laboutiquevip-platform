/**
 * Shared verification-approval propagation.
 *
 * Both the Didit webhook and the admin review path must apply the same
 * Provider-side effects when a verification is approved — previously only the
 * Didit path did, leaving admin-approved providers unverified.
 */
export async function applyVerificationApproval(
  prisma: any,
  userId: string,
): Promise<void> {
  await prisma.provider.updateMany({
    where: { user_id: userId },
    data: {
      is_verified: true,
      is_profile_approved: true,
      status: "active",
      rejection_reason: null,
    },
  });
}

/**
 * Monotonic verification status guard.
 *
 * Didit can deliver duplicate/out-of-order events (each with a new dedupe
 * key). Without a guard, a stale "pending" event can regress an already
 * approved verification and null reviewedAt. Ranks:
 *   pending(0) < in_progress(1) < under_review(2) < approved/rejected(3)
 * Terminal states (approved/rejected) are sticky — nothing regresses them.
 */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  in_progress: 1,
  under_review: 2,
  approved: 3,
  rejected: 3,
};

const TERMINAL_STATUSES = new Set(["approved", "rejected"]);

export function isVerificationTransitionAllowed(
  currentStatus: string | null | undefined,
  nextStatus: string,
): boolean {
  const current = (currentStatus ?? "pending").trim().toLowerCase();
  const next = nextStatus.trim().toLowerCase();
  if (TERMINAL_STATUSES.has(current)) {
    // Terminal is sticky — only the same status (idempotent retry) is allowed.
    return next === current;
  }
  const currentRank = STATUS_RANK[current] ?? 0;
  const nextRank = STATUS_RANK[next] ?? 0;
  return nextRank >= currentRank;
}
