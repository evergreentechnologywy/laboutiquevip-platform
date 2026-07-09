// @ts-nocheck
import React, { useCallback, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Star, Shield, Crown, MapPin, Check, AlertTriangle,
  Video, ChevronLeft, ChevronRight, ExternalLink, Phone, MessageCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { getDisplayProfilePhotos } from "@/lib/profilePhotos";
import { ProfileImage } from "@/components/ProfileImage";
import { VerificationBadges } from "@/components/VerificationBadges";
import { ProviderContactAndSocial } from "@/components/ProviderContactAndSocial";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createPageUrl } from "@/utils";

const MAX_PROVIDER_PHOTOS = 8;

function resolveProviderId(profileSlug, queryId) {
  return queryId || profileSlug || null;
}

async function fetchPublicProvider(identifier) {
  if (!identifier) return null;
  try {
    const res = await fetch(`/api/v1/providers/by-slug/${encodeURIComponent(identifier)}`);
    if (res.ok) return res.json();
  } catch { /* fall through */ }
  const providers = await base44.entities.Provider.filter({ id: identifier });
  return providers.length > 0 ? providers[0] : null;
}

export default function ViewProfile() {
  const { profileSlug } = useParams();
  const [searchParams] = useSearchParams();
  const queryId = searchParams.get("id");
  const providerId = resolveProviderId(profileSlug, queryId);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const galleryRef = useRef(null);
  const touchStart = useRef(0);

  const { data: provider, isLoading } = useQuery({
    queryKey: ['provider', providerId],
    queryFn: async () => {
      const currentProvider = await fetchPublicProvider(providerId);
      if (!currentProvider) return null;
      const viewCount = (currentProvider.views_count || 0) + 1;
      try {
        await base44.entities.Provider.update(currentProvider.id, { views_count: viewCount });
      } catch { return currentProvider; }
      return { ...currentProvider, views_count: viewCount };
    },
    enabled: !!providerId,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', provider?.id],
    queryFn: () => base44.entities.Review.filter({ provider_id: provider.id, status: 'approved' }, '-created_date'),
    enabled: !!provider?.id,
  });

  const ratingMeta = getProviderRatingMeta(provider, reviews.length);
  const displayPhotos = getDisplayProfilePhotos(provider, MAX_PROVIDER_PHOTOS);

  const prevPhoto = useCallback(
    () => setSelectedPhoto((p) => (p === 0 ? displayPhotos.length - 1 : p - 1)),
    [displayPhotos.length],
  );
  const nextPhoto = useCallback(
    () => setSelectedPhoto((p) => (p === displayPhotos.length - 1 ? 0 : p + 1)),
    [displayPhotos.length],
  );

  // Touch swipe support
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 60) diff > 0 ? nextPhoto() : prevPhoto();
  };

  // Keyboard nav
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") prevPhoto();
      else if (e.key === "ArrowRight") nextPhoto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevPhoto, nextPhoto]);

  const hasExternalReviewUrl = !!(provider?.ter_url || provider?.pd_url || provider?.tob_url);

  const stats = [
    provider?.age && { label: "Age", value: provider.age },
    provider?.service_type && { label: provider.service_type.charAt(0).toUpperCase() + provider.service_type.slice(1), value: provider.service_type },
    provider?.ethnicity && { label: "Ethnicity", value: provider.ethnicity },
    provider?.rate_hourly && { label: "Rate", value: `$${Number(provider.rate_hourly).toLocaleString()}/hr` },
  ].filter(Boolean);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-96 w-full rounded-3xl mb-8" />
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <Skeleton className="h-40" />
              <Skeleton className="h-60" />
            </div>
            <Skeleton className="h-80" />
          </div>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-zinc-300 mb-2">Profile not found</h2>
          <p className="text-zinc-500">This provider profile doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 pb-20 md:pb-0">
      <SEO
        title={`${provider.display_name} | ${provider.location_city} | La Boutique VIP`}
        description={provider.tagline || `View profile of ${provider.display_name} in ${provider.location_city}`}
        ogTitle={`${provider.display_name} | La Boutique VIP`}
        ogDescription={provider.tagline}
        ogImage={displayPhotos[0]}
        noindex
        jsonLd={displayPhotos[0] ? {
          "@context": "https://schema.org",
          "@type": "Person",
          "name": provider.display_name,
          "description": provider.bio || provider.tagline || "",
          "image": displayPhotos[0],
          "address": {
            "@type": "PostalAddress",
            "addressLocality": provider.location_city,
            "addressRegion": provider.location_state,
          },
          ...(provider.rate_hourly && {
            "makesOffer": {
              "@type": "Offer",
              "price": String(provider.rate_hourly),
              "priceCurrency": "USD",
            }
          }),
        } : undefined}
      />

      {/* ── Photo Gallery — carousel with dot indicators ── */}
      <section className="relative" ref={galleryRef}>
        <div className="relative mx-auto max-w-7xl">
          <div
            className="relative aspect-[3/4] sm:aspect-[4/5] lg:aspect-[3/2] overflow-hidden bg-zinc-900 lg:rounded-b-[40px] cursor-pointer"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <ProfileImage
              src={displayPhotos[selectedPhoto]}
              alt={provider.display_name}
              priority
              className="w-full h-full"
            />

            {/* Subtle gradient — keeps UI readable without crushing the photo */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/50 via-transparent to-transparent pointer-events-none" />

            {/* Nav arrows */}
            {displayPhotos.length > 1 && (
              <>
                <button
                  onClick={prevPhoto}
                  aria-label="Previous photo"
                  className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 rounded-2xl bg-zinc-950/60 backdrop-blur-md border border-zinc-700/50 p-2.5 md:p-3 text-zinc-200 hover:bg-zinc-950/80 hover:border-zinc-500 transition-all"
                >
                  <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
                </button>
                <button
                  onClick={nextPhoto}
                  aria-label="Next photo"
                  className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 rounded-2xl bg-zinc-950/60 backdrop-blur-md border border-zinc-700/50 p-2.5 md:p-3 text-zinc-200 hover:bg-zinc-950/80 hover:border-zinc-500 transition-all"
                >
                  <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
                </button>
              </>
            )}

            {/* Breadcrumbs */}
            <div className="absolute top-4 left-4 md:top-6 md:left-8 z-20">
              <Breadcrumb>
                <BreadcrumbList className="text-xs text-zinc-400 [&_a]:text-zinc-300 [&_a]:hover:text-white">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild><Link to={createPageUrl("Browse")}>Browse</Link></BreadcrumbLink>
                  </BreadcrumbItem>
                  {provider.location_city && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link to={`${createPageUrl("Browse")}?location=${encodeURIComponent(provider.location_city)}`}>
                            {provider.location_city}
                          </Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </>
                  )}
                  <BreadcrumbSeparator />
                  <BreadcrumbItem><BreadcrumbPage className="text-zinc-200">{provider.display_name}</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        </div>

        {/* ── Dot indicators (replaces thumbnail strip) ── */}
        {displayPhotos.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-3 mb-1">
            {displayPhotos.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedPhoto(i)}
                aria-label={`Photo ${i + 1}`}
                className={`rounded-full transition-all duration-300 ${
                  selectedPhoto === i
                    ? "w-6 h-1.5 bg-rose-500"
                    : "w-1.5 h-1.5 bg-zinc-700 hover:bg-zinc-500"
                }`}
              />
            ))}
            <span className="ml-2 text-[11px] text-zinc-600 font-medium">
              {selectedPhoto + 1}/{displayPhotos.length}
            </span>
          </div>
        )}
      </section>

      {/* ── Main layout ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
        <div className="grid lg:grid-cols-[1fr_380px] gap-8 lg:gap-12">

          {/* ── LEFT COLUMN: header + tabs ── */}
          <div className="min-w-0">
            {/* Header */}
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-zinc-100">
                  {provider.display_name}
                </h1>
                {provider.is_premium && (
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 border-0 text-zinc-950 font-semibold">
                    <Crown className="w-3 h-3 mr-1" /> Premium
                  </Badge>
                )}
                <VerificationBadges provider={provider} size="sm" />
              </div>
              {provider.tagline && (
                <p className="text-lg md:text-xl text-zinc-400 font-light mb-3">{provider.tagline}</p>
              )}

              {/* ── Quick stats bar ── */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  {provider.location_city}, {provider.location_state}
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-zinc-300 font-medium">{ratingMeta.value}</span>
                  <span className="text-zinc-500">· {ratingMeta.detail}</span>
                </div>
                {stats.slice(0, 3).map((s) => (
                  <span key={s.label} className="text-zinc-500">
                    <span className="text-zinc-400 font-medium">{s.value}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* ── Tabs ── */}
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="w-full justify-start gap-1 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-1.5 h-auto flex-wrap sticky top-[72px] z-20 backdrop-blur-xl">
                {['about', 'details', 'services', 'reviews'].map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-xl px-5 py-2.5 text-sm font-medium capitalize data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:shadow-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {tab === 'about' ? 'About' : tab}
                    {tab === 'reviews' && (reviews.length > 0 || hasExternalReviewUrl) && (
                      <span className="ml-2 rounded-full bg-rose-500/15 text-rose-400 text-xs px-2 py-0.5 font-medium">
                        {reviews.length || 'ext'}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="about" className="mt-6">
                <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-zinc-100 text-lg font-serif">About Me</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-zinc-400 leading-7 whitespace-pre-wrap">
                      {provider.bio || 'No bio available.'}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="details" className="mt-6">
                <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-zinc-100 text-lg font-serif">Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                      {[
                        ['Age', provider.age],
                        ['Gender', provider.service_type],
                        ['Ethnicity', provider.ethnicity],
                        ['Hair', provider.hair_color],
                        ['Eyes', provider.eye_color],
                        ['Height', provider.height],
                        ['Body Type', provider.body_type],
                      ].filter(([, v]) => v).map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between sm:justify-start sm:gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                          <span className="text-sm text-zinc-500 font-medium">{label}</span>
                          <span className="text-sm text-zinc-200">{value}</span>
                        </div>
                      ))}
                    </div>
                    {!provider.age && !provider.service_type && !provider.ethnicity && (
                      <p className="text-zinc-500 text-sm py-4 text-center">No details listed yet.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="services" className="mt-6">
                <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-zinc-100 text-lg font-serif">Services</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {provider.services_offered?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {provider.services_offered.map((service, index) => (
                          <Badge key={index} variant="outline" className="border-zinc-700/60 bg-zinc-900/40 text-zinc-300 rounded-xl px-3.5 py-2 text-sm font-normal hover:border-rose-500/30 transition-colors">
                            <Check className="w-3.5 h-3.5 mr-1.5 text-rose-400" />
                            {service}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm py-4 text-center">No services listed yet.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reviews" className="mt-6">
                <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-zinc-100 text-lg font-serif">Reviews</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {reviews.length === 0 ? (
                      <div className="py-4">
                        {hasExternalReviewUrl ? (
                          <div className="grid gap-3">
                            {provider.ter_url && (
                              <a href={provider.ter_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-emerald-500/30 transition-all group">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                                  <Star className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-zinc-200 group-hover:text-emerald-300">The Erotic Review</p>
                                  <p className="text-xs text-zinc-500 mt-0.5">View verified reviews on TER</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 shrink-0" />
                              </a>
                            )}
                            {provider.pd_url && (
                              <a href={provider.pd_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-violet-500/30 transition-all group">
                                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                                  <Star className="w-5 h-5 text-violet-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-zinc-200 group-hover:text-violet-300">PrivateDelights</p>
                                  <p className="text-xs text-zinc-500 mt-0.5">View profile and reviews on PD</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 shrink-0" />
                              </a>
                            )}
                            {provider.tob_url && (
                              <a href={provider.tob_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-amber-500/30 transition-all group">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                                  <Star className="w-5 h-5 text-amber-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-zinc-200 group-hover:text-amber-300">TheOtherBoard</p>
                                  <p className="text-xs text-zinc-500 mt-0.5">View profile and reviews on TOB</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 shrink-0" />
                              </a>
                            )}
                            <p className="text-[10px] text-zinc-500 text-center leading-4 pt-1">
                              Third-party links for reference only. Review content is handled externally.
                            </p>
                          </div>
                        ) : (
                          <div className="py-10 text-center">
                            <Star className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                            <p className="text-zinc-500">No reviews yet. Be the first — reviews appear after moderation.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="divide-y divide-zinc-800/50">
                          {reviews.map((review) => (
                            <div key={review.id} className="py-4 first:pt-0 last:pb-0">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex gap-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} />
                                  ))}
                                </div>
                                <span className="text-sm font-semibold text-zinc-200">{review.reviewer_name}</span>
                                <span className="text-xs text-zinc-500 ml-auto">{format(new Date(review.created_date), 'MMM d, yyyy')}</span>
                              </div>
                              <p className="text-sm text-zinc-400 leading-6">{review.comment}</p>
                            </div>
                          ))}
                        </div>
                        {hasExternalReviewUrl && (
                          <div className="mt-4 pt-4 border-t border-zinc-800/50">
                            <p className="text-xs text-zinc-500 mb-3">Also see reviews on:</p>
                            <div className="flex flex-wrap gap-2">
                              {provider.ter_url && (
                                <a href={provider.ter_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                                  <Star className="w-3 h-3" /> TER
                                </a>
                              )}
                              {provider.pd_url && (
                                <a href={provider.pd_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 hover:bg-violet-500/20 transition-colors">
                                  <Star className="w-3 h-3" /> PD
                                </a>
                              )}
                              {provider.tob_url && (
                                <a href={provider.tob_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors">
                                  <Star className="w-3 h-3" /> TOB
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <aside className="space-y-5">
            {/* Rates — premium gradient card */}
            <Card className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border-zinc-800 rounded-2xl overflow-hidden sticky top-24">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-amber-500/5 pointer-events-none" />
              <CardHeader className="pb-3 relative">
                <CardTitle className="text-zinc-100 font-serif text-lg flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-rose-500" /> Rates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 relative">
                {provider.rate_hourly && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/20 transition-colors">
                    <span className="text-sm text-zinc-400 font-medium">1 Hour</span>
                    <span className="text-xl font-bold text-rose-400">${Number(provider.rate_hourly).toLocaleString()}</span>
                  </div>
                )}
                {provider.rate_two_hours && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/20 transition-colors">
                    <span className="text-sm text-zinc-400 font-medium">2 Hours</span>
                    <span className="text-xl font-bold text-rose-400">${Number(provider.rate_two_hours).toLocaleString()}</span>
                  </div>
                )}
                {provider.rate_overnight && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/20 transition-colors">
                    <span className="text-sm text-zinc-400 font-medium">Overnight</span>
                    <span className="text-xl font-bold text-rose-400">${Number(provider.rate_overnight).toLocaleString()}</span>
                  </div>
                )}
                {!provider.rate_hourly && !provider.rate_two_hours && !provider.rate_overnight && (
                  <p className="text-sm text-zinc-500 text-center py-3">Contact for rates</p>
                )}
                <Separator className="bg-zinc-800/50" />
                <p className="text-[11px] text-zinc-500 leading-5 px-1">
                  Rates are supplied by the advertiser. La Boutique VIP does not set or negotiate pricing.
                </p>
              </CardContent>
            </Card>

            {/* Contact & social */}
            <ProviderContactAndSocial provider={provider} />

            {/* External trust references */}
            {(provider.p411_url || provider.ter_url || provider.pd_url || provider.tob_url || provider.verification_provider) && (
              <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-zinc-100 font-serif text-base">External trust references</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {provider.p411_url && (
                    <a href={provider.p411_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-sky-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-sky-300">Preferred411{provider.p411_id ? ` · ${provider.p411_id}` : ''}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-sky-400" />
                    </a>
                  )}
                  {provider.ter_url && (
                    <a href={provider.ter_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-emerald-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-emerald-300">The Erotic Review</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400" />
                    </a>
                  )}
                  {provider.pd_url && (
                    <a href={provider.pd_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-violet-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-violet-300">PrivateDelights</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-violet-400" />
                    </a>
                  )}
                  {provider.tob_url && (
                    <a href={provider.tob_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-amber-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-amber-300">TheOtherBoard</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
                    </a>
                  )}
                  {provider.verification_url && (
                    <a href={provider.verification_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-rose-300">
                        {provider.verification_provider || 'Verification account'}
                        {provider.verification_username ? ` · @${String(provider.verification_username).replace(/^@/, '')}` : ''}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-rose-400" />
                    </a>
                  )}
                  <p className="text-[10px] text-zinc-500 leading-5 pt-1">
                    Third-party links for reference only. Verification and review status are handled externally.
                  </p>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>

      {/* ── Mobile CTA bar (fixed bottom) ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800 shadow-2xl shadow-black/50">
        <div className="flex items-stretch gap-2 px-3 py-3 max-w-lg mx-auto">
          {provider.phone && (
            <>
              <a
                href={`tel:${provider.phone}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-colors"
              >
                <Phone className="w-4 h-4" /> Call
              </a>
              <a
                href={`sms:${provider.phone}`}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Text
              </a>
            </>
          )}
          {!provider.phone && provider.email && (
            <a
              href={`mailto:${provider.email}`}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> Send message
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function getVideoEmbedUrl(url) {
  if (!url) return "";
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url;
}