/** Server-side provider field guardrails — strips privileged fields for non-admins. */
export function deriveProviderState(
  input: Record<string, unknown>,
  existing?: Record<string, unknown> | null,
  options?: { isAdmin?: boolean },
) {
  const isAdmin = options?.isAdmin ?? false;
  const adPackage = isAdmin
    ? ((input.ad_package as string | undefined) ?? (existing?.ad_package as string | undefined) ?? "none")
    : ((existing?.ad_package as string | undefined) ?? "none");
  const isPremium = ["featured", "premium", "elite"].includes(String(adPackage));
  const requestedStatus = typeof input.status === "string" ? input.status : null;

  let nextStatus = (existing?.status as string | undefined) ?? "pending_verification";
  if (isAdmin) {
    nextStatus = requestedStatus ?? nextStatus;
  } else if (existing?.is_profile_approved && (requestedStatus === "active" || requestedStatus === "paused")) {
    nextStatus = requestedStatus;
  }

  return {
    ...input,
    ad_package: adPackage,
    ad_package_expiry: isAdmin
      ? (input.ad_package_expiry ?? existing?.ad_package_expiry ?? null)
      : (existing?.ad_package_expiry ?? null),
    ad_package_started_at: isAdmin
      ? (input.ad_package_started_at ?? existing?.ad_package_started_at ?? null)
      : (existing?.ad_package_started_at ?? null),
    ad_package_expiration_reminder_sent_at: isAdmin
      ? (input.ad_package_expiration_reminder_sent_at ?? existing?.ad_package_expiration_reminder_sent_at ?? null)
      : (existing?.ad_package_expiration_reminder_sent_at ?? null),
    is_premium: isPremium,
    status: nextStatus,
    photos: isAdmin
      ? (Array.isArray(input.photos) ? input.photos : (existing?.photos ?? []))
      : (existing?.photos ?? []),
    pending_photos: Array.isArray(input.pending_photos) ? input.pending_photos : (existing?.pending_photos ?? []),
    verification_documents: Array.isArray(input.verification_documents)
      ? input.verification_documents
      : (existing?.verification_documents ?? []),
  };
}
