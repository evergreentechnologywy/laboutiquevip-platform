import React from "react";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

/**
 * Single Premium chip used on cards ("soft" translucent amber) and profile
 * headers ("solid" brand gradient). Sizes match VerificationBadges so mixed
 * badge rows stay visually consistent.
 */
export function PremiumBadge({ variant = "soft", size = "sm", className = "" }) {
  const iconClass = size === "sm" ? "mr-1 h-3 w-3" : "mr-1.5 h-3.5 w-3.5";
  const textClass = size === "sm" ? "text-[10px]" : "text-xs";
  const variantClass =
    variant === "solid"
      ? "bg-gradient-to-r from-rose-500 to-amber-500 border-0 text-white"
      : "bg-amber-500/10 border border-amber-500/20 text-amber-400";

  return (
    <Badge className={`rounded-full font-semibold shadow-sm ${variantClass} ${textClass} ${className}`}>
      <Crown className={iconClass} aria-hidden="true" />
      Premium
    </Badge>
  );
}
