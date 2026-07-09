// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, ArrowRight } from "lucide-react";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { getPrimaryProfilePhoto } from "@/lib/profilePhotos";
import { getProviderBadgeFlags } from "@/lib/verificationBadges";
import { ProfileImage } from "@/components/ProfileImage";
import { VerificationBadges } from "@/components/VerificationBadges";
import { PremiumBadge } from "@/components/PremiumBadge";

const NEW_LISTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function sanitizeLocation(city) {
  const s = String(city ?? "").trim();
  // Strip markdown artifacts, URLs, and excessive length
  const clean = s
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\*\*?([^*]+)\*?\*/g, "$1")
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/[|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (clean.length > 30) return clean.slice(0, 27) + "...";
  return clean;
}

/**
 * Shared provider listing card for Browse results and Home featured grid.
 * Trust chips (Evergreen Elite / P411 / Review Verified / Premium) lead the
 * overlay; name, city, and rate band sit on a bottom gradient bar.
 */
export function ProviderListingCard({ provider }) {
  const ratingMeta = getProviderRatingMeta(provider);
  const flags = getProviderBadgeFlags(provider);
  const hasTrustChips =
    flags.showEvergreenElite || flags.showP411Verified || flags.showReviewVerified || provider.is_premium;
  const isTouring = provider.tour_plan?.cities?.length > 0;
  const isNew =
    provider.is_new || new Date() - new Date(provider.created_date) < NEW_LISTING_WINDOW_MS;

  return (
    <Link to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="group block hover-lift">
      <article data-testid="provider-card" className="overflow-hidden rounded-[32px] glass-panel glass-panel-hover glow-rose-hover relative">
        <div className="relative aspect-[4/5] overflow-hidden bg-zinc-950">
          <ProfileImage
            src={getPrimaryProfilePhoto(provider)}
            alt={provider.display_name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2 z-10">
            <VerificationBadges provider={provider} />
            {provider.is_premium && <PremiumBadge />}
            {isTouring && (
              <Badge className="rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-semibold shadow-sm">
                <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
                Touring
              </Badge>
            )}
            {isNew && !hasTrustChips && (
              <Badge className="rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold shadow-sm">
                Just joined
              </Badge>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent px-5 pb-4 pt-12">
            <h3 className="text-xl font-semibold text-zinc-100 transition group-hover:text-amber-400">
              {provider.display_name}
            </h3>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm text-zinc-300 truncate max-w-[60%]">
                <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
                {sanitizeLocation(provider.location_city)}{provider.location_state ? `, ${provider.location_state}`.slice(0, 20) : ''}
              </span>
              {provider.rate_hourly && (
                <span className="rounded-full border border-zinc-700/70 bg-zinc-950/80 px-3 py-1 text-sm font-medium text-zinc-100 whitespace-nowrap">
                  ${provider.rate_hourly}/hr
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 pt-5">
          {(provider.ad_headline || provider.tagline) && (
            <p className="line-clamp-2 text-sm leading-6 text-zinc-400 font-light">
              {provider.ad_headline || provider.tagline}
            </p>
          )}

          {isTouring && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-rose-400">
              Next: {provider.tour_plan.cities[0].city} {provider.tour_plan.cities[0].startsAt}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between gap-4 text-xs uppercase tracking-wider font-semibold border-t border-zinc-900 pt-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Star className={`h-4 w-4 ${ratingMeta.hasReviews ? "fill-amber-400 text-amber-400" : "text-zinc-700"}`} aria-hidden="true" />
                <span className="font-semibold text-zinc-300">{ratingMeta.value}</span>
                <span className="text-zinc-500 font-normal normal-case">{ratingMeta.detail}</span>
              </div>
              {/* Review site indicator dots */}
              <div className="flex items-center gap-1">
                {provider.ter_url && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="TER matched" />}
                {provider.pd_url && <span className="w-1.5 h-1.5 rounded-full bg-violet-400" title="PrivateDelights matched" />}
                {provider.tob_url && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="TheOtherBoard matched" />}
                {provider.p411_url && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="P411 matched" />}
              </div>
            </div>
            <span className="inline-flex items-center gap-2 text-zinc-300 group-hover:text-amber-400 transition-colors">
              View profile
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
