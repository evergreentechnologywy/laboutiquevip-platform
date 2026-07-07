// @ts-nocheck
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";

/** Gate dashboard routes: guests → Clerk login; wrong role → home. */
export function RequireRole({ roles, children, loginNext }) {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();
  const nextPath = loginNext || location.pathname;

  if (isLoadingAuth) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center bg-zinc-950">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;
  }

  if (!roles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
