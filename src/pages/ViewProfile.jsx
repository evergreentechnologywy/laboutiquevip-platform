// @ts-nocheck
import React from "react";
import { Link, useParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Star, Shield, Crown, MapPin, Phone, Mail, Globe, Check, Instagram, Twitter, AlertTriangle, MessageSquare, Send, CheckCircle2, Loader2, Video, ArrowRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { ProfileImage } from "@/components/ProfileImage";
import { SEO } from "@/components/SEO";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractUserIdPrefixFromSlug(slug) {
  if (!slug || UUID_RE.test(slug)) return null;
  const prefix = slug.split("-").filter(Boolean).pop();
  return prefix && /^[0-9a-f]{8}$/i.test(prefix) ? prefix : null;
}

async function fetchProviderByIdentifier(identifier) {
  if (!identifier) return null;

  if (UUID_RE.test(identifier)) {
    const providers = await base44.entities.Provider.filter({ id: identifier });
    return providers[0] ?? null;
  }

  const userIdPrefix = extractUserIdPrefixFromSlug(identifier);
  if (userIdPrefix) {
    const providers = await base44.entities.Provider.filter({ user_id: { startsWith: userIdPrefix } });
    if (providers.length > 0) return providers[0];
  }

  return null;
}

export default function ViewProfile() {
  const urlParams = new URLSearchParams(window.location.search);
  const { profileSlug } = useParams();
  const providerLookupKey = urlParams.get('id') || profileSlug || null;
  const [selectedPhoto, setSelectedPhoto] = React.useState(0);
  const [messageForm, setMessageForm] = React.useState({ name: "", email: "", message: "" });
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const { data: provider, isLoading } = useQuery({
    queryKey: ['provider', providerLookupKey],
    queryFn: async () => {
      const currentProvider = await fetchProviderByIdentifier(providerLookupKey);
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
    enabled: !!providerLookupKey,
  });

  const providerId = provider?.id;

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', providerId],
    queryFn: () => base44.entities.Review.filter({ provider_id: providerId, status: 'approved' }, '-created_date'),
    enabled: !!providerId,
  });

  const ratingMeta = getProviderRatingMeta(provider, reviews.length);

  const handleMessageSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await base44.entities.Message.create({
        provider_id: providerId,
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-96 w-full rounded-2xl mb-8" />
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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-serif text-zinc-300 mb-2">Profile not found</h2>
          <p className="text-zinc-500 font-light mb-6">This provider profile doesn't exist or has been removed.</p>
          <Link to={createPageUrl("Browse")} className="inline-flex rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-6 py-3 text-sm font-semibold text-white hover:opacity-95">
            Back to browse
          </Link>
        </div>
      </div>
    );
  }

  const maskedPhone = provider.phone ? provider.phone.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2") : "";
  const maskedEmail = provider.email ? provider.email.replace(/(.{3}).*(@.*)/, "$1***$2") : "";

  const profileUrl = `https://www.laboutiquevip.net/viewprofile?id=${provider.id}`;
  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: provider.display_name,
    description: provider.tagline || provider.bio || undefined,
    url: profileUrl,
    image: provider.photos?.[0] || undefined,
    mainEntity: {
      "@type": "Person",
      name: provider.display_name,
      ...(provider.location_city ? { address: { "@type": "PostalAddress", addressLocality: provider.location_city, addressRegion: provider.location_state || undefined } } : {}),
    },
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title={`${provider.display_name} | ${provider.location_city} | La Boutique VIP`}
        description={provider.tagline || `View profile of ${provider.display_name} in ${provider.location_city}`}
        ogTitle={`${provider.display_name} | La Boutique VIP`}
        ogDescription={provider.tagline}
        ogImage={provider.photos?.[0]}
        ogUrl={profileUrl}
        jsonLd={profileJsonLd}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        
        {/* Photo Gallery */}
        <div className="mb-10">
          <div className="relative aspect-[4/3] sm:aspect-video rounded-[32px] overflow-hidden bg-zinc-900/60 mb-4 shadow-2xl border border-zinc-900">
            <ProfileImage
              src={provider.photos?.[selectedPhoto]}
              alt={provider.display_name}
              className="w-full h-full object-cover transition duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/40 via-transparent to-transparent" />
          </div>
          
          {provider.photos && provider.photos.length > 1 && (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {provider.photos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedPhoto(index)}
                  className={`flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 transition-all ${
                    selectedPhoto === index ? 'border-amber-400 scale-[0.98] shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-zinc-900 hover:border-zinc-700'
                  }`}
                >
                  <ProfileImage src={photo} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Video Embed */}
        {provider.video_url && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Video className="w-5 h-5 text-rose-450" />
              <h2 className="text-xl font-serif font-bold text-zinc-100">Video Introduction</h2>
            </div>
            <div className="relative aspect-video rounded-[32px] overflow-hidden bg-zinc-900/60 border border-zinc-900 shadow-2xl">
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

        <div className="grid md:grid-cols-[1.8fr_1.2fr] gap-10 items-start">
          {/* Main Content */}
          <div className="space-y-8">
            
            {/* Header / Intro */}
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {provider.is_verified && (
                  <Badge className="rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold py-1 px-3 shadow-sm">
                    <Shield className="w-3.5 h-3.5 mr-1" />
                    Verified
                  </Badge>
                )}
                {provider.is_premium && (
                  <Badge className="rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold py-1 px-3 shadow-sm">
                    <Crown className="w-3.5 h-3.5 mr-1" />
                    Premium
                  </Badge>
                )}
              </div>
              <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-zinc-100 mb-3">{provider.display_name}</h1>
              <p className="text-lg sm:text-xl text-zinc-400 font-light mb-4">{provider.tagline}</p>
              
              <div className="flex flex-wrap items-center gap-5 text-sm text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-zinc-400" />
                  <span>{provider.location_city}, {provider.location_state}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-zinc-350">{ratingMeta.value}</span>
                  <span className="text-zinc-550">({ratingMeta.detail})</span>
                </div>
              </div>
            </div>

            {/* Verification Alert Info box */}
            <div className="rounded-[32px] border border-amber-500/20 bg-amber-500/5 p-6 sm:p-8 shadow-sm">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-1 shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-amber-450 uppercase tracking-widest">Verification status</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400 font-light">
                    Verification badges reflect checks completed through external identity providers and internal moderation. Reviews are published only after approval.
                  </p>
                </div>
              </div>
            </div>

            {/* About Me */}
            <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
              <h2 className="text-xl font-serif font-bold text-zinc-100 mb-4">About Me</h2>
              <p className="whitespace-pre-wrap text-zinc-400 font-light leading-7 text-sm sm:text-base">{provider.bio || 'No bio available.'}</p>
            </div>

            {/* Details Grid */}
            <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
              <h2 className="text-xl font-serif font-bold text-zinc-100 mb-6">Profile Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {provider.age && (
                  <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-550 font-semibold mb-1">Age</p>
                    <p className="text-lg font-serif font-bold text-zinc-200">{provider.age}</p>
                  </div>
                )}
                {provider.ethnicity && (
                  <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-550 font-semibold mb-1">Ethnicity</p>
                    <p className="text-lg font-serif font-bold text-zinc-200">{provider.ethnicity}</p>
                  </div>
                )}
                {provider.height && (
                  <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-550 font-semibold mb-1">Height</p>
                    <p className="text-lg font-serif font-bold text-zinc-200">{provider.height}</p>
                  </div>
                )}
                {provider.body_type && (
                  <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-550 font-semibold mb-1">Body Type</p>
                    <p className="text-lg font-serif font-bold text-zinc-200 truncate">{provider.body_type}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Services */}
            {provider.services_offered && provider.services_offered.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
                <h2 className="text-xl font-serif font-bold text-zinc-100 mb-4">Services</h2>
                <div className="flex flex-wrap gap-2.5">
                  {provider.services_offered.map((service, index) => (
                    <Badge key={index} variant="outline" className="border-zinc-800 bg-zinc-950/30 text-zinc-355 text-xs font-medium py-1.5 px-4 rounded-full">
                      <Check className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                      {service}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
              <h2 className="text-xl font-serif font-bold text-zinc-100 mb-6">Reviews ({reviews.length})</h2>
              {reviews.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 font-light text-sm">
                  <p>Be the first to leave a review. Reviews appear after moderation.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b border-zinc-900 last:border-0 pb-6 last:pb-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-800'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-semibold text-zinc-200">{review.reviewer_name}</span>
                        <span className="text-xs text-zinc-550 ml-auto">
                          {format(new Date(review.created_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-zinc-400 font-light text-sm leading-6">{review.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            
            {/* Rates Card */}
            <div className="bg-gradient-to-br from-zinc-900/50 to-zinc-950 border border-zinc-900 rounded-[32px] p-6 sm:p-8 shadow-2xl">
              <h2 className="text-xl font-serif font-bold text-zinc-100 mb-6">Rates</h2>
              <div className="space-y-4">
                {provider.rate_hourly && (
                  <div className="flex justify-between items-center py-1.5 border-b border-zinc-900/80">
                    <span className="text-sm text-zinc-400 font-light">1 Hour</span>
                    <span className="text-2xl font-serif font-bold text-amber-400">${provider.rate_hourly}</span>
                  </div>
                )}
                {provider.rate_two_hours && (
                  <div className="flex justify-between items-center py-1.5 border-b border-zinc-900/80">
                    <span className="text-sm text-zinc-400 font-light">2 Hours</span>
                    <span className="text-2xl font-serif font-bold text-amber-400">${provider.rate_two_hours}</span>
                  </div>
                )}
                {provider.rate_overnight && (
                  <div className="flex justify-between items-center py-1.5 border-b border-zinc-900/80">
                    <span className="text-sm text-zinc-400 font-light">Overnight</span>
                    <span className="text-2xl font-serif font-bold text-amber-400">${provider.rate_overnight}</span>
                  </div>
                )}
                
                <p className="text-xs text-zinc-550 leading-5 pt-2">
                  This profile is published for advertising visibility. Contact details shown below are the only verified routing.
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
              <h2 className="text-xl font-serif font-bold text-zinc-100 mb-4">Send enquiry</h2>
              {sent ? (
                <div className="py-8 text-center text-rose-400">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-rose-450 glow-rose" />
                  <p className="font-semibold text-zinc-200">Enquiry sent successfully</p>
                  <p className="text-xs text-zinc-550 mt-2">The advertiser will receive your message.</p>
                </div>
              ) : (
                <form onSubmit={handleMessageSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sender-name" className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Your Name</Label>
                    <Input 
                      id="sender-name" 
                      value={messageForm.name} 
                      onChange={e => setMessageForm({...messageForm, name: e.target.value})}
                      placeholder="Name" 
                      required 
                      className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sender-email" className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Email Address</Label>
                    <Input 
                      id="sender-email" 
                      type="email" 
                      value={messageForm.email} 
                      onChange={e => setMessageForm({...messageForm, email: e.target.value})}
                      placeholder="email@example.com" 
                      required 
                      className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sender-msg" className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Message</Label>
                    <Textarea 
                      id="sender-msg" 
                      value={messageForm.message} 
                      onChange={e => setMessageForm({...messageForm, message: e.target.value})}
                      placeholder="Inquire about availability or bookings..." 
                      required 
                      rows={4}
                      className="bg-zinc-950/70 border-zinc-850 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm leading-6" 
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={sending}
                    className="w-full bg-gradient-to-r from-rose-500 to-amber-500 hover:opacity-95 text-white h-12 font-semibold rounded-2xl shadow-lg border-0 glow-rose mt-2"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Send Enquiry</>}
                  </Button>
                  <p className="text-[10px] text-zinc-650 text-center leading-4">
                    Enquiries are securely delivered direct to the advertiser.
                  </p>
                </form>
              )}
            </div>

            {/* Contact Details Panel */}
            <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
              <h2 className="text-xl font-serif font-bold text-zinc-100 mb-4">Contact</h2>
              <div className="space-y-4">
                {provider.phone && (
                  <div className="flex items-center gap-3 text-zinc-400">
                    <Phone className="w-4 h-4 text-rose-450 shrink-0" />
                    <span className="text-sm font-light">{maskedPhone} <span className="text-xs text-zinc-600">(Masked)</span></span>
                  </div>
                )}
                {provider.email && (
                  <div className="flex items-center gap-3 text-zinc-400">
                    <Mail className="w-4 h-4 text-rose-450 shrink-0" />
                    <span className="text-sm font-light">{maskedEmail} <span className="text-xs text-zinc-600">(Masked)</span></span>
                  </div>
                )}
                {provider.website && (
                  <div className="flex items-center gap-3 text-zinc-400">
                    <Globe className="w-4 h-4 text-rose-450 shrink-0" />
                    <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-sm font-light hover:text-amber-400 transition-colors">
                      Website URL
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* External Trust accounts */}
            {(provider.verification_provider || provider.verification_username || provider.verification_url || provider.review_provider || provider.review_username || provider.review_url) && (
              <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
                <h2 className="text-xl font-serif font-bold text-zinc-100 mb-6">Trust Links</h2>
                <div className="space-y-5 text-sm">
                  {(provider.verification_provider || provider.verification_username || provider.verification_url) && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                      <p className="font-semibold text-zinc-200">Verification Account</p>
                      <p className="mt-1 text-xs text-zinc-500">{provider.verification_provider || "External provider"}</p>
                      {provider.verification_username && <p className="mt-2 text-sm text-amber-450 font-semibold">@{String(provider.verification_username).replace(/^@/, "")}</p>}
                      {provider.verification_url && (
                        <a href={provider.verification_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-xs text-zinc-400 transition-colors hover:text-rose-400 items-center gap-1">
                          Verify profile link <ArrowRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {(provider.review_provider || provider.review_username || provider.review_url) && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                      <p className="font-semibold text-zinc-200">Review Reference</p>
                      <p className="mt-1 text-xs text-zinc-500">{provider.review_provider || "External provider"}</p>
                      {provider.review_username && <p className="mt-2 text-sm text-amber-450 font-semibold">@{String(provider.review_username).replace(/^@/, "")}</p>}
                      {provider.review_url && (
                        <a href={provider.review_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-xs text-zinc-400 transition-colors hover:text-rose-400 items-center gap-1">
                          View external reviews <ArrowRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] leading-4 text-zinc-600 font-light">
                    These external links point to third-party services and are displayed for reference. Verification and reviews on those platforms are managed externally.
                  </p>
                </div>
              </div>
            )}

            {/* Social Media */}
            {(provider.social_media?.instagram || provider.social_media?.twitter) && (
              <div className="bg-zinc-900/40 border border-zinc-900/80 backdrop-blur-md rounded-[32px] p-6 sm:p-8 shadow-xl">
                <h2 className="text-xl font-serif font-bold text-zinc-100 mb-4">Social Media</h2>
                <div className="space-y-3">
                  {provider.social_media.instagram && (
                    <a
                      href={`https://instagram.com/${provider.social_media.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-zinc-450 hover:text-rose-400 transition-colors"
                    >
                      <Instagram className="w-4 h-4 text-rose-450" />
                      <span className="text-sm font-light">@{provider.social_media.instagram}</span>
                    </a>
                  )}
                  {provider.social_media.twitter && (
                    <a
                      href={`https://twitter.com/${provider.social_media.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-zinc-450 hover:text-rose-400 transition-colors"
                    >
                      <Twitter className="w-4 h-4 text-rose-450" />
                      <span className="text-sm font-light">@{provider.social_media.twitter}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
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
  // Direct link or unknown   return as-is, the iframe will try it
  return url;
}
