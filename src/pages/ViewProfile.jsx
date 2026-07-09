// @ts-nocheck
import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Star, Shield, Crown, MapPin, Check, AlertTriangle, MessageSquare, Send,
  CheckCircle2, Loader2, Video, ChevronLeft, ChevronRight, ExternalLink,
  Globe, Mail, Phone,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { getDisplayProfilePhotos } from "@/lib/profilePhotos";
import { ProfileImage } from "@/components/ProfileImage";
import { VerificationBadges } from "@/components/VerificationBadges";
import { PremiumBadge } from "@/components/PremiumBadge";
import { ProviderContactAndSocial } from "@/components/ProviderContactAndSocial";
import { renderTextWithLinks } from "@/lib/linkify";
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
  } catch {
    // Fall through to authenticated entity filter.
  }
  const providers = await base44.entities.Provider.filter({ id: identifier });
  return providers.length > 0 ? providers[0] : null;
}

export default function ViewProfile() {
  const { profileSlug } = useParams();
  const [searchParams] = useSearchParams();
  const queryId = searchParams.get("id");
  const providerId = resolveProviderId(profileSlug, queryId);
  const [selectedPhoto, setSelectedPhoto] = React.useState(0);
  const [messageForm, setMessageForm] = React.useState({ name: "", email: "", message: "" });
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const { data: provider, isLoading } = useQuery({
    queryKey: ['provider', providerId],
    queryFn: async () => {
      const currentProvider = await fetchPublicProvider(providerId);
      if (!currentProvider) return null;

      const viewCount = (currentProvider.views_count || 0) + 1;

      // Public viewers may not be authenticated, so a failed analytics update
      // must not block rendering the actual profile.
      try {
        await base44.entities.Provider.update(currentProvider.id, { views_count: viewCount });
      } catch {
        return currentProvider;
      }

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

  const handleMessageSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await base44.entities.Message.create({
        provider_id: provider?.id || providerId,
        sender_name: messageForm.name,
        sender_email: messageForm.email,
        message: messageForm.message,
        subject: `Enquiry for ${provider?.display_name || "Provider"}`,
      });
      setSent(true);
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setSending(false);
    }
  };

  const prevPhoto = () => setSelectedPhoto((p) => (p === 0 ? displayPhotos.length - 1 : p - 1));
  const nextPhoto = () => setSelectedPhoto((p) => (p === displayPhotos.length - 1 ? 0 : p + 1));

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35">
      <SEO
        title={`${provider.display_name} | ${provider.location_city} | La Boutique VIP`}
        description={provider.tagline || `View profile of ${provider.display_name} in ${provider.location_city}`}
        ogTitle={`${provider.display_name} | La Boutique VIP`}
        ogDescription={provider.tagline}
        ogImage={displayPhotos[0]}
        noindex={true}
      />

      {/* ── Photo Gallery Hero ── */}
      <section className="relative">
        <div className="relative mx-auto max-w-7xl">
          <div className="relative aspect-[3/4] md:aspect-[16/7] overflow-hidden bg-zinc-900 md:rounded-b-[40px]">
            <ProfileImage
              src={displayPhotos[selectedPhoto]}
              alt={provider.display_name}
              className="w-full h-full object-cover transition-opacity duration-300"
            />

            {/* gradient overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent pointer-events-none" />

            {/* nav arrows */}
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

            {/* photo counter */}
            {displayPhotos.length > 1 && (
              <div className="absolute bottom-4 right-4 md:bottom-6 md:right-8 z-20 rounded-full bg-zinc-950/70 backdrop-blur-md border border-zinc-700/40 px-3 py-1 text-xs font-medium text-zinc-200">
                {selectedPhoto + 1} / {displayPhotos.length}
              </div>
            )}

            {/* breadcrumb inside hero */}
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

        {/* thumbnail strip */}
        {displayPhotos.length > 1 && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-2 md:-mt-4">
            <div className="flex gap-2 md:gap-3 overflow-x-auto pb-2 scrollbar-none justify-center">
              {displayPhotos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedPhoto(index)}
                  className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                    selectedPhoto === index
                      ? 'border-rose-500 ring-2 ring-rose-500/30 scale-105 shadow-lg shadow-rose-500/20'
                      : 'border-zinc-800 hover:border-zinc-500 opacity-70 hover:opacity-100'
                  }`}
                >
                  <ProfileImage src={photo} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Main layout ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
        <div className="grid lg:grid-cols-[1fr_380px] gap-8 lg:gap-12">

          {/* ── LEFT: header + tabs ── */}
          <div className="min-w-0">
            {/* Header */}
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight text-zinc-100">
                  {provider.display_name}
                </h1>
                <VerificationBadges provider={provider} size="md" />
                {provider.is_premium && <PremiumBadge variant="solid" size="md" />}
              </div>
              {provider.tagline && (
                <p className="text-lg md:text-xl text-zinc-400 font-light mb-3">{provider.tagline}</p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  <span className="text-zinc-300">{provider.location_city}, {provider.location_state}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-zinc-300 font-medium">{ratingMeta.value}</span>
                  <span className="text-zinc-500">· {ratingMeta.detail}</span>
                </div>
              </div>
            </div>

            {/* Verification note */}
            <Card className="mb-8 bg-amber-500/5 border-amber-500/20 rounded-2xl">
              <CardContent className="py-4 text-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-100 mb-1">Verification badges</p>
                    <p className="leading-6 text-zinc-400">
                      P411 Verified and Review Verified reflect matches to Preferred411 and review sites (TER, PrivateDelights, TheOtherBoard). Badges are not sold — premium placement is labeled separately. La Boutique VIP is not affiliated with Preferred411.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Video embed */}
            {provider.video_url && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Video className="w-5 h-5 text-rose-400" />
                  <h2 className="text-lg font-semibold text-zinc-100">Video</h2>
                </div>
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800">
                  <iframe
                    src={getVideoEmbedUrl(provider.video_url)}
                    title="Provider video"
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {/* ── Tabs ── */}
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="w-full justify-start gap-1 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-1.5 h-auto flex-wrap">
                {['about', 'details', 'services', 'reviews'].map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-xl px-5 py-2.5 text-sm font-medium capitalize data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 data-[state=active]:shadow-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {tab === 'about' ? 'About' : tab}
                    {tab === 'reviews' && reviews.length > 0 && (
                      <span className="ml-2 rounded-full bg-rose-500/15 text-rose-400 text-xs px-2 py-0.5 font-medium">
                        {reviews.length}
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
                    <div className="text-zinc-400 leading-7 whitespace-pre-wrap">
                      {provider.bio ? renderTextWithLinks(provider.bio) : 'No bio available.'}
                    </div>
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
                      <div className="py-10 text-center">
                        <Star className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                        <p className="text-zinc-500">No reviews yet. Be the first — reviews appear after moderation.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-800/50">
                        {reviews.map((review) => (
                          <div key={review.id} className="py-4 first:pt-0 last:pb-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-3.5 h-3.5 ${
                                      i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-sm font-semibold text-zinc-200">{review.reviewer_name}</span>
                              <span className="text-xs text-zinc-500 ml-auto">
                                {format(new Date(review.created_date), 'MMM d, yyyy')}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-400 leading-6">{review.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── RIGHT: sidebar ── */}
          <aside className="space-y-5">
            {/* Rates — premium card */}
            <Card className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border-zinc-800 rounded-2xl overflow-hidden sticky top-24">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-amber-500/5 pointer-events-none" />
              <CardHeader className="pb-3 relative">
                <CardTitle className="text-zinc-100 font-serif text-lg flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-rose-500" />
                  Rates
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

            {/* Contact — direct info */}
            {(provider.phone || provider.email || provider.social_media?.website || provider.website) && (
              <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-zinc-100 font-serif text-lg flex items-center gap-2">
                    <span className="w-1.5 h-5 rounded-full bg-amber-500" />
                    Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {provider.phone && (
                    <a href={`tel:${provider.phone}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/30 transition-all group">
                      <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-rose-400" />
                      </div>
                      <span className="text-sm font-medium text-zinc-200 group-hover:text-rose-300 transition-colors">{provider.phone}</span>
                    </a>
                  )}
                  {provider.email && (
                    <a href={`mailto:${provider.email}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/30 transition-all group">
                      <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-rose-400" />
                      </div>
                      <span className="text-sm font-medium text-zinc-200 group-hover:text-rose-300 transition-colors break-all">{provider.email}</span>
                    </a>
                  )}
                  {(provider.social_media?.website || provider.website) && (
                    <a href={(provider.social_media?.website || provider.website).startsWith('http') ? (provider.social_media?.website || provider.website) : `https://${provider.social_media?.website || provider.website}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/30 transition-all group">
                      <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4 text-rose-400" />
                      </div>
                      <span className="text-sm font-medium text-zinc-200 group-hover:text-rose-300 transition-colors">Website</span>
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ProviderContactAndSocial — external trust & social links */}
            <ProviderContactAndSocial provider={provider} />

            {/* Enquiry form */}
            <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-zinc-100 font-serif text-lg flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-emerald-500" />
                  Send an enquiry
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sent ? (
                  <div className="py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                    </div>
                    <p className="font-semibold text-zinc-100">Message sent</p>
                    <p className="text-xs text-zinc-500 mt-1">The provider has been notified.</p>
                  </div>
                ) : (
                  <form onSubmit={handleMessageSubmit} className="space-y-3.5">
                    <div>
                      <Label htmlFor="sender-name" className="text-xs text-zinc-400 mb-1.5 block">Your Name</Label>
                      <Input id="sender-name" value={messageForm.name}
                        onChange={e => setMessageForm({...messageForm, name: e.target.value})}
                        placeholder="Name" required
                        className="bg-zinc-800/60 border-zinc-700 h-10 text-sm rounded-xl focus:border-rose-500/50 focus:ring-rose-500/10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sender-email" className="text-xs text-zinc-400 mb-1.5 block">Email Address</Label>
                      <Input id="sender-email" type="email" value={messageForm.email}
                        onChange={e => setMessageForm({...messageForm, email: e.target.value})}
                        placeholder="email@example.com" required
                        className="bg-zinc-800/60 border-zinc-700 h-10 text-sm rounded-xl focus:border-rose-500/50 focus:ring-rose-500/10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sender-msg" className="text-xs text-zinc-400 mb-1.5 block">Message</Label>
                      <Textarea id="sender-msg" value={messageForm.message}
                        onChange={e => setMessageForm({...messageForm, message: e.target.value})}
                        placeholder="Inquire about availability or services..." required rows={4}
                        className="bg-zinc-800/60 border-zinc-700 text-sm rounded-xl focus:border-rose-500/50 focus:ring-rose-500/10 resize-none"
                      />
                    </div>
                    <Button type="submit" disabled={sending}
                      className="w-full bg-zinc-100 text-zinc-900 hover:bg-white h-11 text-sm font-semibold rounded-xl transition-all">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-2" /> Send Message</>}
                    </Button>
                    <p className="text-[10px] text-zinc-500 text-center leading-4">
                      Enquiries are stored securely and sent directly to the provider.
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>

            {/* External trust references — simplified link rows */}
            {(provider.p411_url || provider.ter_url || provider.pd_url || provider.tob_url || provider.verification_provider || provider.review_provider) && (
              <Card className="bg-zinc-900/60 border-zinc-800 rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-zinc-100 font-serif text-base">External trust references</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {provider.p411_url && (
                    <a href={provider.p411_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-sky-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-sky-300">
                        Preferred411{provider.p411_id ? ` · ${provider.p411_id}` : ''}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-sky-400" />
                    </a>
                  )}
                  {(provider.ter_url || provider.pd_url || provider.tob_url) && (
                    <>
                      {provider.ter_url && (
                        <a href={provider.ter_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-emerald-500/30 transition-all group">
                          <span className="text-sm text-zinc-200 group-hover:text-emerald-300">The Erotic Review</span>
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400" />
                        </a>
                      )}
                      {provider.pd_url && (
                        <a href={provider.pd_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-emerald-500/30 transition-all group">
                          <span className="text-sm text-zinc-200 group-hover:text-emerald-300">PrivateDelights</span>
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400" />
                        </a>
                      )}
                      {provider.tob_url && (
                        <a href={provider.tob_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-emerald-500/30 transition-all group">
                          <span className="text-sm text-zinc-200 group-hover:text-emerald-300">TheOtherBoard</span>
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400" />
                        </a>
                      )}
                    </>
                  )}
                  {(provider.verification_provider || provider.verification_username || provider.verification_url) && (
                    <a href={provider.verification_url || '#'} target={provider.verification_url ? "_blank" : undefined} rel={provider.verification_url ? "noopener noreferrer" : undefined}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-rose-300 truncate">
                        {provider.verification_provider || 'Verification'}
                        {provider.verification_username ? ` · @${String(provider.verification_username).replace(/^@/, '')}` : ''}
                      </span>
                      {provider.verification_url && <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-rose-400 shrink-0" />}
                    </a>
                  )}
                  {(provider.review_provider || provider.review_username || provider.review_url) && (
                    <a href={provider.review_url || '#'} target={provider.review_url ? "_blank" : undefined} rel={provider.review_url ? "noopener noreferrer" : undefined}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-rose-500/30 transition-all group">
                      <span className="text-sm text-zinc-200 group-hover:text-rose-300 truncate">
                        {provider.review_provider || 'Review'}
                        {provider.review_username ? ` · @${String(provider.review_username).replace(/^@/, '')}` : ''}
                      </span>
                      {provider.review_url && <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-rose-400 shrink-0" />}
                    </a>
                  )}
                  <p className="text-[10px] text-zinc-500 leading-5 pt-1">
                    These links point to third-party services and are displayed for reference only. Availability, verification status, and review publication on those services are handled externally.
                  </p>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function getVideoEmbedUrl(url) {
  if (!url) return "";
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`;
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  // Direct link or unknown — return as-is, the iframe will try it
  return url;
}