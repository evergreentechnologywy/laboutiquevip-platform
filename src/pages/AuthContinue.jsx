import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { buildLoginUrl, defaultLandingForRole, sanitizeNextUrl } from "@/lib/authUrls";

/**
 * Post-Clerk landing: wait for Postgres role, then route to ?next= or role default.
 */
export default function AuthContinue() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();
  const next = sanitizeNextUrl(new URLSearchParams(location.search).get("next"));

  if (isLoadingAuth) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center bg-zinc-950">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={buildLoginUrl(next)} replace />;
  }

  return <Navigate to={defaultLandingForRole(user?.role, next)} replace />;
}
