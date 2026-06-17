// @ts-nocheck
import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Star, Shield, Crown, MapPin, Phone, Mail, Globe, Check, Instagram, Twitter, AlertTriangle, MessageSquare, Send, CheckCircle2, Loader2, Video } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { ProfileImage } from "@/components/ProfileImage";
import { getProfilePhotos } from "@/lib/profilePhotos";
import { SEO } from "@/components/SEO";

export default function ViewProfile() {
  const urlParams = new URLSearchParams(window.location.search);
  const providerId = urlParams.get('id');
  const [selectedPhoto, setSelectedPhoto] = React.useState(0);
  const [messageForm, setMessageForm] = React.useState({ name: "", email: "", message: "" });
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const { data: provider, isLoading } = useQuery({
    queryKey: ['provider', providerId],
    queryFn: async () => {
      const providers = await base44.entities.Provider.filter({ id: providerId });
      if (providers.length === 0) return null;

      const currentProvider = providers[0];
      const viewCount = (currentProvider.views_count || 0) + 1;

      // Public viewers may not be authenticated, so a failed analytics update
      // must not block rendering the actual profile.
      try {
        await base44.entities.Provider.update(providerId, { views_count: viewCount });
      } catch {
        return currentProvider;
      }

      return { ...currentProvider, views_count: viewCount };
    },
    enabled: !!providerId,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', providerId],
    queryFn: () => base44.entities.Review.filter({ provider_id: providerId, status: 'approved' }, '-created_date'),
    enabled: !!providerId,
  });

  const ratingMeta = getProviderRatingMeta(provider, reviews.length);
  const galleryPhotos = React.useMemo(
    () => getProfilePhotos(provider?.photos, provider),
    [provider],
  );

  React.useEffect(() => {
    setSelectedPhoto(0);
  }, [provider?.id, galleryPhotos.length]);

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
      <div className="min-h-screen bg-stone-50 p-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
            <Skeleton className="aspect-[4/5] w-full rounded-[28px]" />
            <div className="space-y-6">
              <Skeleton className="h-16 w-2/3" />
              <Skeleton className="h-40" />
              <Skeleton className="h-60" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-stone-900 mb-2">Profile not found</h2>
          <p className="text-stone-500">This provider profile doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const maskedPhone = provider.phone ? provider.phone.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2") : "";
  const maskedEmail = provider.email ? provider.email.replace(/(.{3}).*(@.*)/, "$1***$2") : "";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <SEO
        title={`${provider.display_name} | ${provider.location_city} | La Boutique VIP`}
        description={provider.tagline || `View profile of ${provider.display_name} in ${provider.location_city}`}
        ogTitle={`${provider.display_name} | La Boutique VIP`}
        ogDescription={provider.tagline}
        ogImage={galleryPhotos[0]}
        noindex={true}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)] lg:items-start">
          {/* Photo-first gallery column */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.28)]">
              <div className="relative aspect-[4/5]">
                <ProfileImage
                  src={galleryPhotos[selectedPhoto]}
                  alt={provider.display_name}
                  className="h-full w-full"
                  priority
                  objectPosition="center 12%"
                />
              </div>
            </div>

            {galleryPhotos.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {galleryPhotos.map((photo, index) => (
                  <button
                    key={`${photo}-${index}`}
                    type="button"
                    onClick={() => setSelectedPhoto(index)}
                    className={`flex-shrink-0 overflow-hidden rounded-2xl border-2 transition-all ${
                      selectedPhoto === index
                        ? "border-stone-900 ring-2 ring-stone-200"
                        : "border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    <ProfileImage
                      src={photo}
                      alt={`${provider.display_name} photo ${index + 1}`}
                      className="h-24 w-24 sm:h-28 sm:w-28"
                      objectPosition="center 15%"
                    />
                  </button>
                ))}
              </div>
            )}

            {provider.video_url && (
              <div className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.18)]">
                <div className="mb-3 flex items-center gap-2">
                  <Video className="h-5 w-5 text-stone-600" />
                  <h2 className="text-lg font-semibold text-stone-900">Video</h2>
                </div>
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-stone-100">
                  <iframe
                    src={getVideoEmbedUrl(provider.video_url)}
                    title="Provider video"
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
          </aside>

          {/* Profile content */}
          <div className="space-y-8">
            <header className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.18)] sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">{provider.display_name}</h1>
                {provider.is_verified && (
                  <Badge className="rounded-full border border-stone-200 bg-stone-100 text-stone-700 shadow-none">
                    <Shield className="mr-1 h-3 w-3" />
                    Verified
                  </Badge>
                )}
                {provider.is_premium && (
                  <Badge className="rounded-full border-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-none">
                    <Crown className="mr-1 h-3 w-3" />
                    Premium
                  </Badge>
                )}
              </div>
              {provider.tagline ? <p className="mt-3 text-lg text-stone-600">{provider.tagline}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-stone-500">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  <span>{provider.location_city}, {provider.location_state}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>{ratingMeta.value} · {ratingMeta.detail}</span>
                </div>
              </div>
            </header>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
            <Card className="border-amber-200/80 bg-amber-50/70 shadow-none">
              <CardContent className="pt-6 text-sm text-stone-700">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div>
                    <p className="mb-1 font-medium text-stone-900">Verified Profile</p>
                    <p className="leading-6">
                      Verification badges reflect checks completed through external identity providers and internal moderation. Reviews are published only after approval.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* About */}
            <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
              <CardHeader>
                <CardTitle className="text-stone-900">About Me</CardTitle>
              </CardHeader>
              <CardContent className="text-stone-600">
                <p className="whitespace-pre-wrap">{provider.bio || 'No bio available.'}</p>
              </CardContent>
            </Card>

            {/* Details */}
            <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
              <CardHeader>
                <CardTitle className="text-stone-900">Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  {provider.age && (
                    <div>
                      <span className="text-stone-500">Age:</span>
                      <span className="ml-2 text-stone-800">{provider.age}</span>
                    </div>
                  )}
                  {provider.ethnicity && (
                    <div>
                      <span className="text-stone-500">Ethnicity:</span>
                      <span className="ml-2 text-stone-800">{provider.ethnicity}</span>
                    </div>
                  )}
                  {provider.height && (
                    <div>
                      <span className="text-stone-500">Height:</span>
                      <span className="ml-2 text-stone-800">{provider.height}</span>
                    </div>
                  )}
                  {provider.body_type && (
                    <div>
                      <span className="text-stone-500">Body Type:</span>
                      <span className="ml-2 text-stone-800">{provider.body_type}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Services */}
            {provider.services_offered && provider.services_offered.length > 0 && (
              <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
                <CardHeader>
                  <CardTitle className="text-stone-900">Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {provider.services_offered.map((service, index) => (
                      <Badge key={index} variant="outline" className="rounded-full border-stone-300 text-stone-700">
                        <Check className="w-3 h-3 mr-1" />
                        {service}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reviews */}
              <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
                <CardHeader>
                  <CardTitle className="text-stone-900">Reviews ({reviews.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {reviews.length === 0 ? (
                  <div className="py-8 text-center text-stone-500">
                    <p>Be the first to leave a review. Reviews appear after moderation.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="border-b border-stone-200 last:border-0 pb-4 last:pb-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm font-medium text-stone-800">{review.reviewer_name}</span>
                          <span className="text-xs text-stone-500">
                            {format(new Date(review.created_date), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <p className="text-stone-600 text-sm">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
              <CardHeader>
                <CardTitle className="text-stone-900">Rates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {provider.rate_hourly && (
                  <div className="flex justify-between items-center">
                    <span className="text-stone-500">1 Hour</span>
                    <span className="text-2xl font-semibold text-stone-900">${provider.rate_hourly}</span>
                  </div>
                )}
                {provider.rate_two_hours && (
                  <div className="flex justify-between items-center">
                    <span className="text-stone-500">2 Hours</span>
                    <span className="text-2xl font-semibold text-stone-900">${provider.rate_two_hours}</span>
                  </div>
                )}
                {provider.rate_overnight && (
                  <div className="flex justify-between items-center">
                    <span className="text-stone-500">Overnight</span>
                    <span className="text-2xl font-semibold text-stone-900">${provider.rate_overnight}</span>
                  </div>
                )}
                
                <Separator className="bg-stone-200" />
                
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                  This profile is published for advertising visibility. Contact details shown below are the only on-page contact route.
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
              <CardHeader>
                <CardTitle className="text-stone-900">Send an enquiry</CardTitle>
              </CardHeader>
              <CardContent>
                {sent ? (
                  <div className="py-6 text-center text-emerald-600">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-3" />
                    <p className="font-medium">Message sent successfully</p>
                    <p className="text-xs text-stone-500 mt-1">The provider has been notified.</p>
                  </div>
                ) : (
                  <form onSubmit={handleMessageSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="sender-name" className="text-xs text-stone-500">Your Name</Label>
                      <Input 
                        id="sender-name" 
                        value={messageForm.name} 
                        onChange={e => setMessageForm({...messageForm, name: e.target.value})}
                        placeholder="Name" 
                        required 
                        className="h-10 rounded-2xl border-stone-200 bg-stone-50 text-sm text-stone-900" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sender-email" className="text-xs text-stone-500">Email Address</Label>
                      <Input 
                        id="sender-email" 
                        type="email" 
                        value={messageForm.email} 
                        onChange={e => setMessageForm({...messageForm, email: e.target.value})}
                        placeholder="email@example.com" 
                        required 
                        className="h-10 rounded-2xl border-stone-200 bg-stone-50 text-sm text-stone-900" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sender-msg" className="text-xs text-stone-500">Message</Label>
                      <Textarea 
                        id="sender-msg" 
                        value={messageForm.message} 
                        onChange={e => setMessageForm({...messageForm, message: e.target.value})}
                        placeholder="Inquire about availability or services..." 
                        required 
                        rows={4}
                        className="rounded-2xl border-stone-200 bg-stone-50 text-sm text-stone-900" 
                      />
                    </div>
                    <Button 
                      type="submit" 
                      disabled={sending}
                      className="h-10 w-full rounded-2xl bg-stone-900 text-sm font-semibold text-stone-50 hover:bg-stone-800"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-2" /> Send Message</>}
                    </Button>
                    <p className="text-center text-[10px] leading-4 text-stone-500">
                      Enquiries are stored securely and sent directly to the provider. 
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>

            <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
              <CardHeader>
                <CardTitle className="text-stone-900">Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {provider.phone && (
                  <div className="flex items-center gap-2 text-stone-600">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm">{maskedPhone} (Masked for privacy)</span>
                  </div>
                )}
                {provider.email && (
                  <div className="flex items-center gap-2 text-stone-600">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{maskedEmail} (Masked for privacy)</span>
                  </div>
                )}
                {provider.website && (
                  <div className="flex items-center gap-2 text-stone-600">
                    <Globe className="w-4 h-4" />
                    <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:text-stone-900">
                      Website
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {(provider.verification_provider || provider.verification_username || provider.verification_url || provider.review_provider || provider.review_username || provider.review_url) && (
              <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
                <CardHeader>
                  <CardTitle className="text-stone-900">External trust references</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {(provider.verification_provider || provider.verification_username || provider.verification_url) && (
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <p className="font-medium text-stone-900">Verification account</p>
                      <p className="mt-1 text-stone-600">{provider.verification_provider || "External provider"}</p>
                      {provider.verification_username && <p className="mt-2 text-stone-800">@{String(provider.verification_username).replace(/^@/, "")}</p>}
                      {provider.verification_url && (
                        <a href={provider.verification_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-stone-700 transition-colors hover:text-stone-900">
                          View external account
                        </a>
                      )}
                    </div>
                  )}
                  {(provider.review_provider || provider.review_username || provider.review_url) && (
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <p className="font-medium text-stone-900">Review account</p>
                      <p className="mt-1 text-stone-600">{provider.review_provider || "External provider"}</p>
                      {provider.review_username && <p className="mt-2 text-stone-800">@{String(provider.review_username).replace(/^@/, "")}</p>}
                      {provider.review_url && (
                        <a href={provider.review_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-stone-700 transition-colors hover:text-stone-900">
                          View external account
                        </a>
                      )}
                    </div>
                  )}
                  <p className="text-xs leading-6 text-stone-500">
                    These links point to third-party services and are displayed for reference only. Availability, verification status, and review publication on those services are handled externally.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Social Media */}
            {(provider.social_media?.instagram || provider.social_media?.twitter) && (
              <Card className="border-stone-200 bg-white shadow-[0_24px_80px_-36px_rgba(28,25,23,0.12)]">
                <CardHeader>
                  <CardTitle className="text-stone-900">Social Media</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {provider.social_media.instagram && (
                    <a
                      href={`https://instagram.com/${provider.social_media.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-stone-600 transition-colors hover:text-stone-900"
                    >
                      <Instagram className="w-4 h-4" />
                      <span className="text-sm">@{provider.social_media.instagram}</span>
                    </a>
                  )}
                  {provider.social_media.twitter && (
                    <a
                      href={`https://twitter.com/${provider.social_media.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-stone-600 transition-colors hover:text-stone-900"
                    >
                      <Twitter className="w-4 h-4" />
                      <span className="text-sm">@{provider.social_media.twitter}</span>
                    </a>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
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
  // Direct link or unknown — return as-is, the iframe will try it
  return url;
}
