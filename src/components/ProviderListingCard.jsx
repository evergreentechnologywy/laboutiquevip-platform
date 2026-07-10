// @ts-nocheck
import React, { useState } from "react";
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
import { motion } from "framer-motion";

const NEW_LISTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function sanitizeLocation(city) {
  const s = String(city ?? "").trim();
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

export function ProviderListingCard({ provider }) {
  const ratingMeta = getProviderRatingMeta(provider);
  const flags = getProviderBadgeFlags(provider);
  const hasTrustChips =
    flags.showEvergreenElite || flags.showP411Verified || flags.showReviewVerified || provider.is_premium;
  const isTouring = provider.tour_plan?.cities?.length > 0;
  const isNew =
    provider.is_new || new Date() - new Date(provider.created_date) < NEW_LISTING_WINDOW_MS;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link 
      to={createPageUrl(`ViewProfile?id=${provider.id}`)} 
      className="block perspective-[1200px]" 
      aria-label={`View profile of ${provider.display_name}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.article 
        data-testid="provider-card" 
        className="group relative overflow-hidden rounded-[2rem] bg-zinc-950/40 backdrop-blur-xl border border-white/5 hover:border-white/10 transition-colors duration-500 shadow-2xl"
        role="article" 
        aria-label={provider.display_name}
        whileHover={{ y: -8, scale: 1.01, rotateX: 2, rotateY: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {/* Cinematic glow behind the card content */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />

        <div className="relative aspect-[4/5] overflow-hidden rounded-t-[2rem]">
          <ProfileImage
            src={getPrimaryProfilePhoto(provider)}
            alt={provider.display_name}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-transparent to-zinc-950/95 pointer-events-none transition-opacity duration-500 group-hover:opacity-80" />

          {/* Badges Container */}
          <div className="absolute left-4 top-4 flex flex-wrap gap-2 z-10">
            <VerificationBadges provider={provider} />
            {provider.is_premium && <PremiumBadge />}
            {isTouring && (
              <Badge className="rounded-full bg-rose-500/20 backdrop-blur-md border border-rose-500/30 text-rose-300 text-[10px] font-medium shadow-sm">
                <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
                Touring
              </Badge>
            )}
            {isNew && !hasTrustChips && !provider.verification_provider && (
              <Badge className="rounded-full bg-blue-500/20 backdrop-blur-md border border-blue-500/30 text-blue-300 text-[10px] font-medium shadow-sm">
                New
              </Badge>
            )}
          </div>

          {/* Title & Location Overlay */}
          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 translate-y-3 group-hover:translate-y-0 transition-transform duration-500 ease-[0.16,1,0.3,1]">
            <h3 className="text-3xl font-serif tracking-tight text-white/90 group-hover:text-amber-200 transition-colors duration-300">
              {provider.display_name}
            </h3>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300/80 truncate">
                <MapPin className="h-4 w-4 text-zinc-400/80 shrink-0" aria-hidden="true" />
                {sanitizeLocation(provider.location_city)}{provider.location_state ? `, ${provider.location_state}`.slice(0, 20) : ''}
              </span>
              {provider.rate_hourly && (
                <span className="rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-sm font-semibold text-white whitespace-nowrap shadow-lg">
                  ${provider.rate_hourly}/hr
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="relative p-6 pt-5 bg-zinc-950/80 backdrop-blur-2xl">
          {(provider.ad_headline || provider.tagline) && (
            <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400 font-light tracking-wide group-hover:text-zinc-200 transition-colors duration-500">
              {provider.ad_headline || provider.tagline}
            </p>
          )}

          {isTouring && (
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400/90">
              Next: {provider.tour_plan.cities[0].city} {provider.tour_plan.cities[0].startsAt}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/5 pt-5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Star className={`h-4 w-4 ${ratingMeta.hasReviews ? "fill-amber-400 text-amber-400" : "text-zinc-700"}`} aria-hidden="true" />
                <span className="font-medium text-zinc-200">{ratingMeta.value}</span>
                <span className="text-zinc-500 text-xs">{ratingMeta.detail}</span>
              </div>
              {/* Review site indicator dots with glow */}
              <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                {provider.ter_url && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="TER matched" />}
                {provider.pd_url && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" title="PrivateDelights matched" />}
                {provider.tob_url && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" title="TheOtherBoard matched" />}
                {provider.p411_url && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" title="P411 matched" />}
              </div>
            </div>
            <motion.span 
              className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 group-hover:text-amber-400 transition-colors duration-300"
              animate={{ x: isHovered ? 4 : 0 }}
            >
              View Profile
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </motion.span>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
