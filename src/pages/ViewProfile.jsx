// @ts-nocheck
import React, { useCallback, useState, useRef, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Star, Shield, Crown, MapPin, Check,
  ChevronLeft, ChevronRight, ExternalLink, Phone, MessageCircle, AlertTriangle, Video
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { getDisplayProfilePhotos } from "@/lib/profilePhotos";
import { getProviderReviewLinks } from "@/lib/reviewLinks";
import { ProfileImage } from "@/components/ProfileImage";
import { VerificationBadges } from "@/components/VerificationBadges";
import { ProviderContactAndSocial } from "@/components/ProviderContactAndSocial";
import { SEO } from "@/components/SEO";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";

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
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 280], [1, 0.15]);

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
    const hasPhotos = displayPhotos.length > 0;
    const reviewLinks = provider
      ? getProviderReviewLinks(provider)
      : { ter: null, pd: null, tob: null, p411: null, any: false };

  const prevPhoto = useCallback(
    () => {
      if (displayPhotos.length < 2) return;
      setSelectedPhoto((p) => (p === 0 ? displayPhotos.length - 1 : p - 1));
    },
    [displayPhotos.length],
  );
  const nextPhoto = useCallback(
    () => {
      if (displayPhotos.length < 2) return;
      setSelectedPhoto((p) => (p === displayPhotos.length - 1 ? 0 : p + 1));
    },
    [displayPhotos.length],
  );

  useEffect(() => {
    if (selectedPhoto >= displayPhotos.length) setSelectedPhoto(0);
  }, [displayPhotos.length, selectedPhoto]);

  // Touch swipe support
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 60) diff > 0 ? nextPhoto() : prevPhoto();
  };

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") prevPhoto();
      else if (e.key === "ArrowRight") nextPhoto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevPhoto, nextPhoto]);

  const hasExternalReviewUrl = reviewLinks.any;

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
          <Skeleton className="h-[60vh] w-full rounded-[3rem] mb-8 bg-zinc-900/50" />
          <div className="grid lg:grid-cols-[1fr_380px] gap-12">
            <div className="space-y-6">
              <Skeleton className="h-40 bg-zinc-900/50 rounded-2xl" />
              <Skeleton className="h-60 bg-zinc-900/50 rounded-2xl" />
            </div>
            <Skeleton className="h-[500px] bg-zinc-900/50 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center p-12 rounded-3xl bg-zinc-900/30 backdrop-blur-xl border border-white/5">
          <h2 className="text-3xl font-serif font-bold text-white mb-4">Profile not found</h2>
          <p className="text-zinc-400">This provider profile doesn't exist or has been removed.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 pb-24 md:pb-12">
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

      {/* ── Immersive Photo Gallery ── */}
      <section
        className={`relative w-full overflow-hidden ${
          hasPhotos ? "h-[52vh] min-h-[420px] sm:h-[62vh] lg:h-[68vh]" : "h-[36vh] min-h-[300px]"
        }`}
        ref={galleryRef}
        aria-label={`${provider.display_name} photo gallery`}
      >
        {hasPhotos ? (
          <div
            className="relative w-full h-full cursor-grab active:cursor-grabbing bg-zinc-950"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={selectedPhoto}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 w-full h-full flex items-center justify-center"
              >
                <ProfileImage
                  src={displayPhotos[selectedPhoto]}
                  fallbacks={displayPhotos.filter((_, index) => index !== selectedPhoto)}
                  alt={`${provider.display_name} - Photo ${selectedPhoto + 1}`}
                  priority
                  fit="contain"
                  objectPosition="center center"
                  className="w-full h-full"
                />
              </motion.div>
            </AnimatePresence>

            {/* Soft edge vignette — do not cover the subject */}
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/55 via-transparent to-zinc-950/90 pointer-events-none" />

            {/* Nav arrows with spring animation */}
            {displayPhotos.length > 1 && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 md:px-12 z-20 pointer-events-none">
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.15)" }}
                  whileTap={{ scale: 0.9 }}
                  onClick={prevPhoto}
                  aria-label="Previous photo"
                  className="pointer-events-auto w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-xl border border-white/10 text-white shadow-2xl transition-all"
                >
                  <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.15)" }}
                  whileTap={{ scale: 0.9 }}
                  onClick={nextPhoto}
                  aria-label="Next photo"
                  className="pointer-events-auto w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-xl border border-white/10 text-white shadow-2xl transition-all"
                >
                  <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
                </motion.button>
              </div>
            )}

            {/* Filmstrip Thumbnails */}
            {displayPhotos.length > 1 && (
              <div className="absolute bottom-8 inset-x-0 z-30 flex justify-center px-4">
                <div className="flex gap-2 sm:gap-3 p-2 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 overflow-x-auto max-w-full hide-scrollbar">
                  {displayPhotos.map((photo, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedPhoto(i)}
                      type="button"
                      aria-label={`Show photo ${i + 1} of ${displayPhotos.length}`}
                      aria-pressed={selectedPhoto === i}
                      className={`relative flex-shrink-0 w-12 h-16 sm:w-16 sm:h-20 rounded-xl overflow-hidden transition-all duration-300 ${
                        selectedPhoto === i ? "ring-2 ring-amber-400 scale-105" : "opacity-50 hover:opacity-100"
                      }`}
                    >
                      <ProfileImage src={photo} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Breadcrumbs */}
            <motion.div style={{ opacity }} className="absolute top-6 left-4 right-4 md:top-8 md:left-12 md:right-auto z-30 bg-black/20 backdrop-blur-md px-4 md:px-5 py-2.5 rounded-full border border-white/10 overflow-x-auto">
              <Breadcrumb>
                <BreadcrumbList className="text-sm font-medium text-zinc-400 [&_a]:text-zinc-300 [&_a]:hover:text-amber-400 [&_a]:transition-colors">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild><Link to={createPageUrl("Browse")}>Browse</Link></BreadcrumbLink>
                  </BreadcrumbItem>
                  {provider.location_city && (
                    <>
                      <BreadcrumbSeparator className="text-zinc-600" />
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link to={`${createPageUrl("Browse")}?location=${encodeURIComponent(provider.location_city)}`}>
                            {provider.location_city}
                          </Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </>
                  )}
                  <BreadcrumbSeparator className="text-zinc-600" />
                  <BreadcrumbItem><BreadcrumbPage className="text-white">{provider.display_name}</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </motion.div>
          </div>
        ) : (
          <div className="relative w-full h-full bg-zinc-900 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 pointer-events-none" />
            <div className="text-center relative z-10">
              <div className="w-24 h-24 mx-auto rounded-3xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-2xl">
                <span className="text-4xl font-serif font-bold text-zinc-500">{(provider.display_name || "?").charAt(0).toUpperCase()}</span>
              </div>
              <p className="mt-4 text-zinc-500 font-medium">No photos yet</p>
            </div>
            {/* Breadcrumbs */}
            <div className="absolute top-6 left-4 right-4 md:top-8 md:left-12 md:right-auto z-30 bg-black/40 backdrop-blur-md px-4 md:px-5 py-2.5 rounded-full border border-white/5 overflow-x-auto">
              <Breadcrumb>
                <BreadcrumbList className="text-sm font-medium text-zinc-400 [&_a]:text-zinc-300 [&_a]:hover:text-amber-400">
                  <BreadcrumbItem><BreadcrumbLink asChild><Link to={createPageUrl("Browse")}>Browse</Link></BreadcrumbLink></BreadcrumbItem>
                  {provider.location_city && (<><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink asChild><Link to={`${createPageUrl("Browse")}?location=${encodeURIComponent(provider.location_city)}`}>{provider.location_city}</Link></BreadcrumbLink></BreadcrumbItem></>)}
                  <BreadcrumbSeparator />
                  <BreadcrumbItem><BreadcrumbPage className="text-white">{provider.display_name}</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        )}
      </section>

      {/* ── Main layout ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 md:py-16 relative z-20 -mt-10 lg:-mt-20">
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 lg:gap-16">

          {/* ── LEFT COLUMN ── */}
          <div className="min-w-0 space-y-8">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="flex flex-wrap items-end gap-4 mb-4">
                <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tight text-white drop-shadow-xl">
                  {provider.display_name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {provider.is_premium && (
                    <Badge className="bg-gradient-to-r from-amber-500 to-amber-300 border-0 text-amber-950 font-bold px-3 py-1 text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20">
                      <Crown className="w-3.5 h-3.5 mr-1.5" /> Premium
                    </Badge>
                  )}
                  <VerificationBadges provider={provider} size="sm" />
                </div>
              </div>
              
              {provider.tagline && (
                <p className="text-xl md:text-2xl text-zinc-300 font-light leading-relaxed max-w-3xl mb-6">{provider.tagline}</p>
              )}

              {/* ── Quick stats bar ── */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-sm md:text-base border-y border-white/10 py-5">
                <div className="flex items-center gap-2 text-white font-medium">
                  <MapPin className="w-5 h-5 text-rose-400" />
                  {provider.location_city}, {provider.location_state}
                </div>
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  <span className="text-white font-bold">{ratingMeta.value}</span>
                  <span className="text-zinc-500 font-medium">· {ratingMeta.detail}</span>
                </div>
                {stats.slice(0, 3).map((s) => (
                  <span key={s.label} className="text-zinc-500">
                    <span className="text-zinc-300 font-medium">{s.value}</span>
                  </span>
                ))}
              </div>
            </motion.div>

            {/* ── Tabs ── */}
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="w-full justify-start gap-2 bg-zinc-900/40 border border-white/5 rounded-2xl p-2 h-auto flex-wrap sticky top-24 z-30 backdrop-blur-2xl shadow-xl">
                {['about', 'details', 'services', 'reviews'].map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="relative rounded-xl px-6 py-3 text-sm font-semibold tracking-wide capitalize data-[state=active]:text-white text-zinc-400 hover:text-zinc-200 transition-colors z-10"
                  >
                    {tab === 'about' ? 'About' : tab}
                    {tab === 'reviews' && (reviews.length > 0 || hasExternalReviewUrl) && (
                      <span className="ml-2 rounded-full bg-rose-500/20 text-rose-300 text-xs px-2.5 py-0.5 font-bold">
                        {reviews.length || 'ext'}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="mt-8">
                <TabsContent value="about" className="outline-none">
                  <Card className="bg-white/[0.02] border-white/5 rounded-[2rem] backdrop-blur-xl shadow-2xl">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-white text-2xl font-serif">About Me</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-zinc-300 leading-relaxed text-lg font-light whitespace-pre-wrap">
                        {provider.bio || 'No bio available.'}
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="details" className="outline-none">
                  <Card className="bg-white/[0.02] border-white/5 rounded-[2rem] backdrop-blur-xl shadow-2xl">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-white text-2xl font-serif">Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid sm:grid-cols-2 gap-x-12 gap-y-6">
                        {[
                          ['Age', provider.age],
                          ['Gender', provider.service_type],
                          ['Ethnicity', provider.ethnicity],
                          ['Hair', provider.hair_color],
                          ['Eyes', provider.eye_color],
                          ['Height', provider.height],
                          ['Body Type', provider.body_type],
                        ].filter(([, v]) => v).map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between sm:justify-start sm:gap-6 py-3 border-b border-white/5 last:border-0">
                            <span className="text-sm uppercase tracking-[0.2em] font-bold text-zinc-500 w-24">{label}</span>
                            <span className="text-lg text-white font-medium">{value}</span>
                          </div>
                        ))}
                      </div>
                      {!provider.age && !provider.service_type && !provider.ethnicity && (
                        <p className="text-zinc-500 text-lg py-8 text-center font-light">No details listed yet.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="services" className="outline-none">
                  <Card className="bg-white/[0.02] border-white/5 rounded-[2rem] backdrop-blur-xl shadow-2xl">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-white text-2xl font-serif">Services</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {provider.services_offered?.length > 0 ? (
                        <div className="flex flex-wrap gap-3">
                          {provider.services_offered.map((service, index) => (
                            <Badge key={index} variant="outline" className="border-white/10 bg-white/5 text-zinc-200 rounded-xl px-4 py-2.5 text-base font-medium hover:border-rose-500/40 hover:bg-rose-500/10 transition-colors shadow-sm">
                              <Check className="w-4 h-4 mr-2 text-rose-400" />
                              {service}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-zinc-500 text-lg py-8 text-center font-light">No services listed yet.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="reviews" className="outline-none">
                  <Card className="bg-white/[0.02] border-white/5 rounded-[2rem] backdrop-blur-xl shadow-2xl">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-white text-2xl font-serif">Reviews</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {reviews.length === 0 ? (
                        <div className="py-6">
                          {hasExternalReviewUrl ? (
                            <div className="grid gap-4">
                              {reviewLinks.ter && (
                                <a href={reviewLinks.ter} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-5 p-5 rounded-2xl bg-black/40 border border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all duration-300 group">
                                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <Star className="w-6 h-6 text-emerald-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">The Erotic Review</p>
                                    <p className="text-sm text-zinc-400 mt-1 font-light">View verified reviews on TER</p>
                                  </div>
                                  <ExternalLink className="w-5 h-5 text-zinc-600 group-hover:text-emerald-400 shrink-0 transition-colors" />
                                </a>
                              )}
                              {reviewLinks.pd && (
                                <a href={reviewLinks.pd} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-5 p-5 rounded-2xl bg-black/40 border border-violet-500/20 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all duration-300 group">
                                  <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <Star className="w-6 h-6 text-violet-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-base font-bold text-white group-hover:text-violet-300 transition-colors">PrivateDelights</p>
                                    <p className="text-sm text-zinc-400 mt-1 font-light">View profile and reviews on PD</p>
                                  </div>
                                  <ExternalLink className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 shrink-0 transition-colors" />
                                </a>
                              )}
                              {reviewLinks.tob && (
                                <a href={reviewLinks.tob} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-5 p-5 rounded-2xl bg-black/40 border border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all duration-300 group">
                                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <Star className="w-6 h-6 text-amber-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">TheOtherBoard</p>
                                    <p className="text-sm text-zinc-400 mt-1 font-light">View profile and reviews on TOB</p>
                                  </div>
                                  <ExternalLink className="w-5 h-5 text-zinc-600 group-hover:text-amber-400 shrink-0 transition-colors" />
                                </a>
                              )}
                              <p className="text-[11px] font-medium tracking-wide uppercase text-zinc-500 text-center leading-relaxed pt-4">
                                Third-party links for reference only. Review content is handled externally.
                              </p>
                            </div>
                          ) : (
                            <div className="py-16 text-center">
                              <Star className="w-16 h-16 text-zinc-800 mx-auto mb-6" />
                              <p className="text-zinc-400 text-lg font-light">No reviews yet. Be the first — reviews appear after moderation.</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="divide-y divide-white/10">
                            {reviews.map((review) => (
                              <div key={review.id} className="py-6 first:pt-2 last:pb-2">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex gap-1">
                                    {[...Array(5)].map((_, i) => (
                                      <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-800'}`} />
                                    ))}
                                  </div>
                                  <span className="text-base font-bold text-white">{review.reviewer_name}</span>
                                  <span className="text-sm font-medium text-zinc-500 ml-auto">{format(new Date(review.created_date), 'MMMM d, yyyy')}</span>
                                </div>
                                <p className="text-base text-zinc-300 leading-relaxed font-light">{review.comment}</p>
                              </div>
                            ))}
                          </div>
                          {hasExternalReviewUrl && (
                            <div className="mt-8 pt-8 border-t border-white/10">
                              <p className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">Also see reviews on</p>
                              <div className="flex flex-wrap gap-3">
                                {reviewLinks.ter && (
                                  <a href={reviewLinks.ter} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all">
                                    <Star className="w-4 h-4" /> TER
                                  </a>
                                )}
                                {reviewLinks.pd && (
                                  <a href={reviewLinks.pd} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-sm font-semibold text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/40 transition-all">
                                    <Star className="w-4 h-4" /> PD
                                  </a>
                                )}
                                {reviewLinks.tob && (
                                  <a href={reviewLinks.tob} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all">
                                    <Star className="w-4 h-4" /> TOB
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
              </div>
            </Tabs>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <aside className="space-y-6">
            {/* Rates — premium glass card */}
            <Card className="bg-zinc-950/80 backdrop-blur-3xl border border-white/10 rounded-[2rem] overflow-hidden sticky top-28 shadow-2xl">
              {/* Animated cinematic glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 via-transparent to-amber-500/10 opacity-50 pointer-events-none" />
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/20 rounded-full blur-[60px] pointer-events-none" />
              
              <CardHeader className="pb-4 relative z-10 border-b border-white/5">
                <CardTitle className="text-white font-serif text-2xl flex items-center gap-3">
                  <span className="w-2 h-8 rounded-full bg-gradient-to-b from-rose-400 to-amber-400 shadow-lg shadow-rose-500/50" /> 
                  Rates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10 pt-6">
                {provider.rate_hourly && (
                  <div className="flex justify-between items-center px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-rose-500/30 hover:bg-white/[0.05] transition-all duration-300">
                    <span className="text-sm font-bold uppercase tracking-widest text-zinc-400">1 Hour</span>
                    <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-300 to-amber-300">${Number(provider.rate_hourly).toLocaleString()}</span>
                  </div>
                )}
                {provider.rate_two_hours && (
                  <div className="flex justify-between items-center px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-rose-500/30 hover:bg-white/[0.05] transition-all duration-300">
                    <span className="text-sm font-bold uppercase tracking-widest text-zinc-400">2 Hours</span>
                    <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-300 to-amber-300">${Number(provider.rate_two_hours).toLocaleString()}</span>
                  </div>
                )}
                {provider.rate_overnight && (
                  <div className="flex justify-between items-center px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-rose-500/30 hover:bg-white/[0.05] transition-all duration-300">
                    <span className="text-sm font-bold uppercase tracking-widest text-zinc-400">Overnight</span>
                    <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-300 to-amber-300">${Number(provider.rate_overnight).toLocaleString()}</span>
                  </div>
                )}
                {!provider.rate_hourly && !provider.rate_two_hours && !provider.rate_overnight && (
                  <p className="text-base text-zinc-400 text-center py-6 font-light">Contact for rates</p>
                )}
                
                <p className="text-xs text-zinc-500 text-center leading-relaxed pt-2">
                  Rates are supplied by the advertiser. La Boutique VIP does not set or negotiate pricing.
                </p>
              </CardContent>
            </Card>

            {/* Contact & social wrapped in glass */}
            <div className="bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />
              <div className="relative z-10">
                <ProviderContactAndSocial provider={provider} />
              </div>
            </div>

            {/* External trust references */}
            {(reviewLinks.any || provider.verification_provider || provider.verification_url) && (
              <Card className="bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] shadow-2xl overflow-hidden">
                <CardHeader className="pb-4 border-b border-white/5 bg-white/[0.02]">
                  <CardTitle className="text-white font-serif text-lg">Trust References</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-5">
                  {reviewLinks.p411 && (
                    <a href={reviewLinks.p411} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-black/40 border border-white/5 hover:border-sky-500/40 hover:bg-sky-500/10 transition-all group">
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-sky-300">Preferred411{provider.p411_id ? ` · ${provider.p411_id}` : ''}</span>
                      <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-sky-400 transition-colors" />
                    </a>
                  )}
                  {reviewLinks.ter && (
                    <a href={reviewLinks.ter} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-black/40 border border-white/5 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group">
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-emerald-300">The Erotic Review</span>
                      <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                    </a>
                  )}
                  {reviewLinks.pd && (
                    <a href={reviewLinks.pd} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-black/40 border border-white/5 hover:border-violet-500/40 hover:bg-violet-500/10 transition-all group">
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-violet-300">PrivateDelights</span>
                      <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                    </a>
                  )}
                  {reviewLinks.tob && (
                    <a href={reviewLinks.tob} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-black/40 border border-white/5 hover:border-amber-500/40 hover:bg-amber-500/10 transition-all group">
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-amber-300">TheOtherBoard</span>
                      <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                    </a>
                  )}
                  {provider.verification_url && (
                    <a href={provider.verification_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-black/40 border border-white/5 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all group">
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-rose-300">
                        {provider.verification_provider || 'Verification account'}
                        {provider.verification_username ? ` · @${String(provider.verification_username).replace(/^@/, '')}` : ''}
                      </span>
                      <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-rose-400 transition-colors" />
                    </a>
                  )}
                  <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 leading-relaxed pt-2 text-center">
                    Third-party links for reference only.
                  </p>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>

      {/* ── Mobile CTA bar (fixed bottom) with glassmorphism ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-2xl border-t border-white/10 shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.8)] pb-safe">
        <div className="flex items-stretch gap-3 px-4 py-4 max-w-lg mx-auto">
          {provider.phone && (
            <>
              <a
                href={`tel:${provider.phone}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold text-sm shadow-lg shadow-rose-500/20 active:scale-95 transition-transform"
              >
                <Phone className="w-4 h-4" /> Call
              </a>
              <a
                href={`sms:${provider.phone}`}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-white font-bold text-sm active:scale-95 transition-transform"
              >
                <MessageCircle className="w-4 h-4" /> Text
              </a>
            </>
          )}
          {!provider.phone && provider.email && (
            <a
              href={`mailto:${provider.email}`}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold text-sm shadow-lg shadow-rose-500/20 active:scale-95 transition-transform"
            >
              <MessageCircle className="w-4 h-4" /> Send message
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
