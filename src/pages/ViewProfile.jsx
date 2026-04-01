// @ts-nocheck
import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Star, Shield, Crown, MapPin, Phone, Mail, Globe, Check, Instagram, Twitter, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { getProviderRatingMeta } from "@/lib/providerPresentation";

export default function ViewProfile() {
  const urlParams = new URLSearchParams(window.location.search);
  const providerId = urlParams.get('id');
  const [selectedPhoto, setSelectedPhoto] = React.useState(0);

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-zinc-300 mb-2">Profile not found</h2>
          <p className="text-zinc-500">This provider profile doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Photo Gallery */}
        <div className="mb-8">
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-zinc-900 mb-4">
            {provider.photos && provider.photos.length > 0 ? (
              <img
                src={provider.photos[selectedPhoto]}
                alt={provider.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Crown className="w-24 h-24 text-zinc-700" />
              </div>
            )}
          </div>
          
          {provider.photos && provider.photos.length > 1 && (
            <div className="flex gap-4 overflow-x-auto">
              {provider.photos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedPhoto(index)}
                  className={`flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 transition-all ${
                    selectedPhoto === index ? 'border-rose-500' : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-4xl font-bold text-zinc-100">{provider.display_name}</h1>
                    {provider.is_verified && (
                      <Badge className="bg-rose-500/20 border-rose-500 text-rose-400">
                        <Shield className="w-3 h-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                    {provider.is_premium && (
                      <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 border-0">
                        <Crown className="w-3 h-3 mr-1" />
                        Premium
                      </Badge>
                    )}
                  </div>
                  <p className="text-xl text-zinc-400 mb-2">{provider.tagline}</p>
                  <div className="flex items-center gap-4 text-zinc-500">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      <span>{provider.location_city}, {provider.location_state}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span>{ratingMeta.value} · {ratingMeta.detail}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardContent className="pt-6 text-sm text-zinc-300">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-100 mb-1">Advertising and verification notice</p>
                    <p className="leading-6">
                      Verification badges reflect checks completed through external identity providers and internal moderation. Reviews are published only after approval, and linked third-party accounts remain subject to those providers&apos; own policies and availability.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* About */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">About Me</CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400">
                <p className="whitespace-pre-wrap">{provider.bio || 'No bio available.'}</p>
              </CardContent>
            </Card>

            {/* Details */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  {provider.age && (
                    <div>
                      <span className="text-zinc-500">Age:</span>
                      <span className="ml-2 text-zinc-300">{provider.age}</span>
                    </div>
                  )}
                  {provider.ethnicity && (
                    <div>
                      <span className="text-zinc-500">Ethnicity:</span>
                      <span className="ml-2 text-zinc-300">{provider.ethnicity}</span>
                    </div>
                  )}
                  {provider.height && (
                    <div>
                      <span className="text-zinc-500">Height:</span>
                      <span className="ml-2 text-zinc-300">{provider.height}</span>
                    </div>
                  )}
                  {provider.body_type && (
                    <div>
                      <span className="text-zinc-500">Body Type:</span>
                      <span className="ml-2 text-zinc-300">{provider.body_type}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Services */}
            {provider.services_offered && provider.services_offered.length > 0 && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-zinc-100">Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {provider.services_offered.map((service, index) => (
                      <Badge key={index} variant="outline" className="border-zinc-700 text-zinc-300">
                        <Check className="w-3 h-3 mr-1" />
                        {service}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reviews */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-zinc-100">Reviews ({reviews.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {reviews.length === 0 ? (
                  <div className="py-8 text-center text-zinc-500">
                    <p>No approved reviews are live yet.</p>
                    <p className="mt-2 text-sm text-zinc-600">Reviews appear after moderation and may remain limited while rollout continues.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="border-b border-zinc-800 last:border-0 pb-4 last:pb-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm font-medium text-zinc-300">{review.reviewer_name}</span>
                          <span className="text-xs text-zinc-500">
                            {format(new Date(review.created_date), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <p className="text-zinc-400 text-sm">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Rates */}
            <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Rates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {provider.rate_hourly && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">1 Hour</span>
                    <span className="text-2xl font-bold text-rose-400">${provider.rate_hourly}</span>
                  </div>
                )}
                {provider.rate_two_hours && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">2 Hours</span>
                    <span className="text-2xl font-bold text-rose-400">${provider.rate_two_hours}</span>
                  </div>
                )}
                {provider.rate_overnight && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Overnight</span>
                    <span className="text-2xl font-bold text-rose-400">${provider.rate_overnight}</span>
                  </div>
                )}
                
                <Separator className="bg-zinc-800" />
                
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
                  This profile is published for advertising visibility. Contact details shown below are the only on-page contact route.
                </div>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {provider.phone && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm">{provider.phone}</span>
                  </div>
                )}
                {provider.email && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{provider.email}</span>
                  </div>
                )}
                {provider.website && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Globe className="w-4 h-4" />
                    <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-rose-400 transition-colors">
                      Website
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {(provider.verification_provider || provider.verification_username || provider.verification_url || provider.review_provider || provider.review_username || provider.review_url) && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-zinc-100">External trust references</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {(provider.verification_provider || provider.verification_username || provider.verification_url) && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                      <p className="font-medium text-zinc-100">Verification account</p>
                      <p className="mt-1 text-zinc-400">{provider.verification_provider || "External provider"}</p>
                      {provider.verification_username && <p className="mt-2 text-zinc-300">@{String(provider.verification_username).replace(/^@/, "")}</p>}
                      {provider.verification_url && (
                        <a href={provider.verification_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-zinc-300 transition-colors hover:text-rose-400">
                          View external account
                        </a>
                      )}
                    </div>
                  )}
                  {(provider.review_provider || provider.review_username || provider.review_url) && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                      <p className="font-medium text-zinc-100">Review account</p>
                      <p className="mt-1 text-zinc-400">{provider.review_provider || "External provider"}</p>
                      {provider.review_username && <p className="mt-2 text-zinc-300">@{String(provider.review_username).replace(/^@/, "")}</p>}
                      {provider.review_url && (
                        <a href={provider.review_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-zinc-300 transition-colors hover:text-rose-400">
                          View external account
                        </a>
                      )}
                    </div>
                  )}
                  <p className="text-xs leading-6 text-zinc-500">
                    These links point to third-party services and are displayed for reference only. Availability, verification status, and review publication on those services are handled externally.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Social Media */}
            {(provider.social_media?.instagram || provider.social_media?.twitter) && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-zinc-100">Social Media</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {provider.social_media.instagram && (
                    <a
                      href={`https://instagram.com/${provider.social_media.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-zinc-400 hover:text-rose-400 transition-colors"
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
                      className="flex items-center gap-2 text-zinc-400 hover:text-rose-400 transition-colors"
                    >
                      <Twitter className="w-4 h-4" />
                      <span className="text-sm">@{provider.social_media.twitter}</span>
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stats */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-zinc-100 mb-1">{provider.views_count || 0}</div>
                  <div className="text-sm text-zinc-500">Profile Views</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
