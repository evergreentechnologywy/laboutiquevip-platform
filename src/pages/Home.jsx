// @ts-nocheck
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Star, Shield, Crown, ArrowRight, BadgeCheck, Gem, MessageCircleMore, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { searchProviders } from "@/api/providerSearch";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { getPrimaryProfilePhoto } from "@/lib/profilePhotos";
import { ProfileImage } from "@/components/ProfileImage";
import { SEO } from "@/components/SEO";
import { CityAutocomplete } from "@/components/CityAutocomplete";

const trustItems = [
  { label: "Verified Profiles", icon: BadgeCheck },
  { label: "Transparent Rates", icon: Gem },
  { label: "Discreet Contact", icon: MessageCircleMore },
  { label: "Approved Reviews", icon: Star },
];

const whyItems = [
  {
    title: "Verified authenticity",
    body: "Verification status is shown after checks handled through external identity providers and internal moderation.",
    icon: Shield,
  },
  {
    title: "Curated premium experience",
    body: "Discover listings designed to feel polished, transparent, and easy to explore.",
    icon: Crown,
  },
  {
    title: "Trust-led discovery",
    body: "Clear profile information and approved feedback help support more confident browsing as live data matures.",
    icon: Star,
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [locationQuery, setLocationQuery] = React.useState("");

  const { data: featuredProviders = [], isLoading: isLoadingFeatured } = useQuery({
    queryKey: ["featured-providers"],
    queryFn: async () => {
      const data = await searchProviders({
        premium: true,
        verified: true,
        limit: 12,
      });
      // Filter out those without photos as per requirement "real photos"
      return (data.items || []).filter(p => p.photos && p.photos.length > 0);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.append("q", searchQuery);
    if (locationQuery) params.append("location", locationQuery);
    window.location.href = createPageUrl(`Browse?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="La Boutique VIP International | Curated, Discreet Directory of Verified Profiles"
        description="Discover verified profiles with discretion and clarity. Browse polished listings, transparent rates, and direct enquiry options in a trusted premium environment."
        ogTitle="La Boutique VIP International"
        ogDescription="Curated, Discreet Directory of Verified Profiles"
        ogUrl="https://www.laboutiquevip.net"
      />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-900/80 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.12),_transparent_40%),radial-gradient(circle_at_bottom,_rgba(245,158,11,0.06),_transparent_40%),linear-gradient(180deg,#09090b_0%,#121215_100%)]">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold tracking-[0.25em] text-rose-400 uppercase">
              Curated listings   Discreet enquiries
            </p>
            <h1 className="mt-8 text-4xl font-serif font-bold tracking-tight text-zinc-100 sm:text-7xl leading-tight">
              Discover verified profiles with discretion & clarity
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-8 text-zinc-400 font-light">
              Browse polished listings, transparent rates, and direct enquiry options in a trusted premium environment.
            </p>

            <div className="mx-auto mt-12 max-w-4xl rounded-[32px] border border-zinc-800 bg-zinc-900/60 p-4 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] backdrop-blur-md glow-gold">
              <div className="grid gap-3 md:grid-cols-[1.35fr_1fr_auto]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                  <Input
                    placeholder="Search by name or service"
                    aria-label="Search by name or service"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    className="h-14 rounded-2xl border-zinc-850 bg-zinc-950/70 pl-12 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:ring-amber-500/20"
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                  <CityAutocomplete
                    value={locationQuery}
                    onChange={setLocationQuery}
                    onEnter={handleSearch}
                    className="h-14 w-full rounded-2xl border border-zinc-850 bg-zinc-950/70 pl-12 pr-4 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  className="h-14 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 px-8 text-base font-semibold text-white shadow-lg transition hover:opacity-95 border-0 glow-rose"
                >
                  Search
                </Button>
              </div>
            </div>

            <p className="mt-6 text-xs text-zinc-500 uppercase tracking-widest font-medium">
              Adults only   Trusted presentation   Clear profile information
            </p>
          </div>
        </div>
      </section>

      {/* Trust Items Banner */}
      <section className="border-b border-zinc-900 bg-zinc-950">
        <div className="mx-auto grid max-w-7xl gap-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item.label} className="flex items-center justify-center gap-3 rounded-2xl border border-zinc-900 bg-zinc-900/25 px-4 py-4 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition">
              <item.icon className="h-4 w-4 text-rose-400" />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Selection */}
      {featuredProviders.length >= 3 ? (
        <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Featured selection</p>
              <h2 className="mt-3 text-3xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl">Verified Profiles</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 font-light">
                Explore curated listings presented with clarity, trust, and premium discretion.
              </p>
            </div>
            <Link to={createPageUrl("Browse")}>
              <Button variant="outline" className="h-11 rounded-full border-zinc-800 bg-zinc-950 px-6 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white transition duration-350">
                Browse all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProviders.slice(0, 6).map((provider) => (
              <Link key={provider.id} to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="group block">
                <article className="overflow-hidden rounded-[28px] border border-zinc-900 bg-zinc-900/20 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.8)] transition duration-300 hover:-translate-y-1 hover:border-rose-500/30 hover:shadow-[0_24px_50px_-20px_rgba(244,63,94,0.15)]">
                  <div className="aspect-[4/5] overflow-hidden bg-zinc-950 relative">
                    <ProfileImage
                      src={getPrimaryProfilePhoto(provider)}
                      alt={provider.display_name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-80" />
                  </div>

                  <div className="p-6 relative">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-zinc-100 transition group-hover:text-amber-400">
                          {provider.display_name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-zinc-500">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{provider.location_city}, {provider.location_state}</span>
                        </div>
                      </div>
                      {provider.is_verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-400 shadow-sm">
                          <Shield className="h-3.5 w-3.5" />
                          Verified
                        </span>
                      )}
                    </div>

                    {provider.tagline && (
                      <p className="mt-4 line-clamp-2 text-sm leading-6 text-zinc-400 font-light">{provider.tagline}</p>
                    )}

                    <div className="mt-6 flex items-center justify-between text-sm border-t border-zinc-900 pt-4">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {(() => {
                          const ratingMeta = getProviderRatingMeta(provider);
                          return (
                            <>
                              <span className="font-semibold text-zinc-300">{ratingMeta.value}</span>
                              <span className="text-zinc-500">{ratingMeta.detail}</span>
                            </>
                          );
                        })()}
                      </div>
                      {provider.rate_hourly && (
                        <span className="font-semibold text-zinc-100">${provider.rate_hourly}/hr</span>
                      )}
                    </div>

                    <div className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-zinc-300 group-hover:text-amber-400 transition-colors">
                      View Profile
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>
      ) : !isLoadingFeatured && (
        <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-serif font-bold tracking-tight text-zinc-100">Curating exceptional profiles</h2>
            <p className="mt-4 text-base leading-7 text-zinc-400">
              Check back soon for new featured listings. 
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link to={createPageUrl("Browse")}>
                <Button className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-8 h-12 text-white border-0 shadow-lg glow-rose">
                  Browse all profiles
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Why Section */}
      <section className="border-t border-b border-zinc-900 bg-zinc-900/10">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl">Why La Boutique VIP</h2>
            <p className="mt-4 text-base leading-7 text-zinc-400 font-light sm:text-lg">
              A more refined way to discover trusted profiles with clarity, discretion, and premium presentation.
            </p>
          </div>

          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {whyItems.map((item) => (
              <div key={item.title} className="rounded-[28px] border border-zinc-900 bg-zinc-900/20 p-8 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.8)] hover:border-zinc-800/80 transition duration-300">
                <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-md glow-rose">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-serif font-bold text-zinc-100">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-zinc-400 font-light">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Provider CTA */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="rounded-[40px] border border-zinc-900 bg-gradient-to-br from-zinc-900/80 to-zinc-950 shadow-2xl p-12 text-center glow-rose max-w-5xl mx-auto">
          <h2 className="text-3xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl">Are you a provider?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-8 text-zinc-400 font-light">
            Join La Boutique VIP International and present your profile in a more polished, trusted, and premium environment.
          </p>
          <Button
            onClick={() => navigate(createPageUrl("ProviderSignup"))}
            className="mt-8 h-14 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-10 text-base font-semibold text-white transition hover:opacity-95 shadow-lg border-0"
          >
            Get Started
          </Button>
        </div>
      </section>
    </div>
  );
}
