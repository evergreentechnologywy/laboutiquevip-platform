// @ts-nocheck
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Star, Shield, Crown, ArrowRight, BadgeCheck, Gem, MessageCircleMore } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { searchProviders } from "@/api/providerSearch";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { ProfileImage } from "@/components/ProfileImage";
import { SEO } from "@/components/SEO";
import { CityAutocomplete, NameAutocomplete } from "@/components/CityAutocomplete";
import { getProfilePhotos } from "@/lib/profilePhotos";

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
        limit: 12,
        sort: "rating",
      });
      return (data.items || [])
        .map((provider) => ({ ...provider, photos: getProfilePhotos(provider.photos, provider) }))
        .filter((provider) => provider.photos.length > 0);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.append("q", searchQuery);
    if (locationQuery) params.append("location", locationQuery);
    navigate(createPageUrl(`Browse?${params.toString()}`));
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <SEO
        title="La Boutique VIP International | Curated, Discreet Directory of Verified Profiles"
        description="Discover verified profiles with discretion and clarity. Browse polished listings, transparent rates, and direct enquiry options in a trusted premium environment."
        ogTitle="La Boutique VIP International"
        ogDescription="Curated, Discreet Directory of Verified Profiles"
        ogUrl="https://www.laboutiquevip.net"
      />
      <section className="relative overflow-visible border-b border-stone-200/80 bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.08),_transparent_45%),linear-gradient(180deg,#fafaf9_0%,#f7f4ef_100%)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-300 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-medium tracking-[0.22em] text-stone-500 uppercase">
              Curated listings · Verified profiles · Discreet enquiries
            </p>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-stone-900 sm:text-6xl lg:text-7xl">
              Discover verified profiles with discretion and clarity
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-stone-600 sm:text-xl">
              Browse polished listings, transparent rates, and direct enquiry options in a trusted premium environment.
            </p>

            <div className="mx-auto mt-10 max-w-5xl rounded-[24px] border border-stone-200 bg-white/95 p-4 shadow-[0_24px_80px_-32px_rgba(28,25,23,0.28)] backdrop-blur">
              <div className="grid gap-3 md:grid-cols-[1.35fr_1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                  <NameAutocomplete
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onEnter={handleSearch}
                    className="h-14 w-full rounded-2xl border border-stone-200 bg-stone-50/80 pl-12 pr-4 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                  <CityAutocomplete
                    value={locationQuery}
                    onChange={setLocationQuery}
                    onEnter={handleSearch}
                    className="h-14 w-full rounded-2xl border border-stone-200 bg-stone-50/80 pl-12 pr-4 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  className="h-14 rounded-2xl bg-stone-900 px-8 text-base font-medium text-stone-50 shadow-sm transition hover:bg-stone-800"
                >
                  Search
                </Button>
              </div>
            </div>

            <p className="mt-5 text-sm text-stone-500">
              Adults only · Trusted presentation · Clear profile information
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {trustItems.map((item) => (
            <div key={item.label} className="flex items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm font-medium text-stone-700">
              <item.icon className="h-4 w-4 text-stone-500" />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {featuredProviders.length >= 3 ? (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">Featured selection</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Verified Profiles</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
                Explore curated listings presented with clarity, trust, and premium discretion.
              </p>
            </div>
            <Link to={createPageUrl("Browse")}>
              <Button variant="outline" className="h-11 rounded-full border-stone-300 bg-white px-5 text-stone-700 hover:border-stone-400 hover:bg-stone-50">
                Browse all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProviders.slice(0, 6).map((provider) => (
              <Link key={provider.id} to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="group block">
                <article className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_18px_45px_-28px_rgba(28,25,23,0.24)] transition duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_24px_55px_-28px_rgba(28,25,23,0.34)]">
                  <div className="aspect-[4/5] overflow-hidden bg-stone-100">
                    <ProfileImage
                      src={provider.photos?.[0]}
                      alt={provider.display_name}
                      className="h-full w-full transition duration-500 group-hover:scale-[1.03]"
                      objectPosition="center 18%"
                    />
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-stone-900 transition group-hover:text-stone-700">
                          {provider.display_name}
                        </h3>
                        <p className="mt-1 text-sm text-stone-500">
                          {provider.location_city}, {provider.location_state}
                        </p>
                      </div>
                      {provider.is_verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-stone-50">
                          <Shield className="h-3.5 w-3.5" />
                          Verified
                        </span>
                      )}
                    </div>

                    {provider.tagline && (
                      <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-600">{provider.tagline}</p>
                    )}

                    <div className="mt-6 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-stone-600">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {(() => {
                          const ratingMeta = getProviderRatingMeta(provider);
                          return (
                            <>
                              <span className="font-medium text-stone-700">{ratingMeta.value}</span>
                              <span className="text-stone-400">{ratingMeta.detail}</span>
                            </>
                          );
                        })()}
                      </div>
                      {provider.rate_hourly && (
                        <span className="font-medium text-stone-900">${provider.rate_hourly}/hr</span>
                      )}
                    </div>

                    <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-stone-900">
                      View Profile
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>
      ) : !isLoadingFeatured && (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-stone-900">Curating exceptional profiles</h2>
            <p className="mt-4 text-lg leading-8 text-stone-600">
              Check back soon for new featured listings. 
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link to={createPageUrl("Browse")}>
                <Button className="rounded-full bg-stone-900 px-8 h-12 text-stone-50">
                  Browse all profiles
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-b border-stone-200 bg-stone-100/70">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Why La Boutique VIP</h2>
            <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
              A more refined way to discover trusted profiles with clarity, discretion, and premium presentation.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {whyItems.map((item) => (
              <div key={item.title} className="rounded-[24px] border border-stone-200 bg-white p-8 shadow-[0_14px_35px_-28px_rgba(28,25,23,0.25)]">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-stone-50">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold text-stone-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-stone-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-stone-200 bg-stone-900 px-8 py-16 text-center shadow-[0_30px_80px_-38px_rgba(28,25,23,0.45)] sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tight text-stone-50 sm:text-5xl">Are you a provider?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-stone-300">
            Join La Boutique VIP International and present your profile in a more polished, trusted, and premium environment.
          </p>
          <Button
            onClick={() => navigate(createPageUrl("ProviderSignup"))}
            className="mt-8 h-14 rounded-full bg-stone-50 px-8 text-base font-medium text-stone-900 transition hover:bg-white"
          >
            Get Started
          </Button>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 border-b border-stone-200 pb-8 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-900 text-stone-50">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-stone-900">La Boutique VIP International</p>
                  <p className="text-sm text-stone-500">Curated, discreet discovery</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-sm text-stone-600">
              <Link to={createPageUrl("Home")} className="hover:text-stone-900">Home</Link>
              <Link to={createPageUrl("Browse")} className="hover:text-stone-900">Browse</Link>
              <Link to={createPageUrl("Pricing")} className="hover:text-stone-900">Pricing</Link>
              <Link to={createPageUrl("Trust")} className="hover:text-stone-900">Trust</Link>
              <button onClick={() => base44.auth.redirectToLogin()} className="hover:text-stone-900">Sign In</button>
            </div>
          </div>

          <div className="pt-6 text-sm leading-7 text-stone-500">
            <p>
              This platform is intended only for adults 18+. Verification and review workflows rely on external service providers plus internal moderation before anything is shown publicly.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
