import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Star, Crown } from "lucide-react";
import { getProviderBadgeFlags } from "@/lib/verificationBadges";

export function VerificationBadges({ provider, className = "", size = "sm" }) {
  const flags = getProviderBadgeFlags(provider);
  const iconClass = size === "sm" ? "mr-1 h-3 w-3" : "mr-1.5 h-3.5 w-3.5";
  const textClass = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {flags.showEvergreenElite && (
        <Badge className={`rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold shadow-sm ${textClass}`}>
          <Crown className={iconClass} aria-hidden="true" />
          Evergreen Elite
        </Badge>
      )}
      {flags.showP411Verified && (
        <Badge className={`rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-300 font-semibold shadow-sm ${textClass}`}>
          <Shield className={iconClass} aria-hidden="true" />
          P411 Verified
        </Badge>
      )}
      {flags.showReviewVerified && (
        <Badge className={`rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-semibold shadow-sm ${textClass}`}>
          <Star className={iconClass} aria-hidden="true" />
          Review Verified
        </Badge>
      )}
    </div>
  );
}
