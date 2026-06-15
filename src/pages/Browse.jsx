// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Star, Shield, Crown, Filter, X, ArrowRight, Sparkles, CheckCircle2, LifeBuoy, Megaphone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { searchProviders } from "@/api/providerSearch";
import { getProviderRatingMeta } from "@/lib/providerPresentation";
import { ProfileImage } from "@/components/ProfileImage";
import { SEO } from "@/components/SEO";
import { CityAutocomplete } from "@/components/CityAutocomplete";

function groupProvidersByCity(items) {
  return items.reduce((acc, provider) => {
    const key = `${provider.location_city || "Unknown"}, ${provider.location_state || "Unknown"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(provider);
    return acc;
  }, {});
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const trustNotes = [
  "Verification badges appear after external identity checks and internal approval.",
  "Reviews only appear after moderation and may be limited while rollout continues.",
  "Rates and contact methods are supplied by advertisers and can change after publication.",
];

const ctaCards = [
  {
    title: "How trust works",
    description: "See what is verified, what is moderated, and where listings may still vary.",
    icon: Shield,
    href: createPageUrl("Trust"),
    label: "Review trust standards",
  },
  {
    title: "Need help choosing?",
    description: "Use broader search terms, adjust your rate band, or check new cities as listings rotate in.",
    icon: LifeBuoy,
    href: createPageUrl("Trust"),
    label: "Browse support guidance",
  },
  {
    title: "Advertise with us",
    description: "For providers ready to appear here, view placement options and premium visibility details.",
    icon: Megaphone,
    href: createPageUrl("Pricing"),
    label: "View advertiser pricing",
  },
];

export default function Browse() {
  const urlParams = new URLSearchParams(window.location.search);
  const [searchQuery, setSearchQuery] = React.useState(urlParams.get("q") || "");
  const [location, setLocation] = React.useState(urlParams.get("location") || urlParams.get("loc") || "");

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const debouncedLocation = useDebounce(location, 300);

  const [priceRange, setPriceRange] = React.useState([0, 2000]);
  const [sortBy, setSortBy] = React.useState("newest");
  const [selectedFilters, setSelectedFilters] = React.useState({ verified: false, premium: false });
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, location, sortBy, selectedFilters.verified, selectedFilters.premium, priceRange[0], priceRange[1]]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["provider-search", debouncedSearchQuery, debouncedLocation, sortBy, selectedFilters, priceRange, page],
    queryFn: () => searchProviders({
      q: debouncedSearchQuery,
      location: debouncedLocation,
      verified: selectedFilters.verified,
      premium: selectedFilters.premium,
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      sort: sortBy,
      page,
      limit: 60,
    }),
  });

  const providers = data?.items || [];
  const cityGroups = data?.cityGroups || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const maxAllowedPrice = data?.maxRate || 2000;
  const isStateSearch = !!location && providers.some((provider) => provider.location_state?.toLowerCase() === location.toLowerCase()) && new Set(providers.map((provider) => provider.location_city)).size > 1;
  const groupedProviders = groupProvidersByCity(providers);
  const hasActiveFilters = Boolean(searchQuery || location || selectedFilters.verified || selectedFilters.premium || priceRange[0] > 0 || priceRange[1] < 2000);
  const hasLowResults = !isLoading && providers.length > 0 && providers.length <= 3;
  const touringProviders = providers.filter((provider) => provider.tour_plan?.cities?.length > 0).slice(0, 6);

  const toggleFilter = (filter) => {
    setSelectedFilters((prev) => ({ ...prev, [filter]: !prev[filter] }));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setLocation("");
    setPriceRange([0, 2000]);
    setSelectedFilters({ verified: false, premium: false });
    setSortBy("newest");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <SEO
        title="Browse Verified Profiles & Listings | La Boutique VIP International"
        description="Explore verified profiles and listings with transparent rates, moderated reviews, and discreet discovery. Filter by verification status and premium features."
        ogTitle="Browse Verified Profiles | La Boutique VIP"
        ogDescription="Discreet directory of verified listings and premium profiles."
      />
      <section className="border-b border-stone-200/80 bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.08),_transparent_45%),linear-gradient(180deg,#fafaf9_0%,#f7f4ef_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">Browse the directory</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">Refined discovery with stronger trust and clearer next steps</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
                Explore live listings with transparent rate ranges, moderated reviews, and a calmer path to finding the right match.
              </p>
            </div>

            <div className="grid gap-3 rounded-[28px] border border-stone-200 bg-white/90 p-5 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.22)] backdrop-blur sm:grid-cols-3">
              <StatCard label="Live listings" value={isLoading ? <span aria-hidden="true">...</span> : `${total}`} helper="Approved and currently searchable" />
              <StatCard label="Trust layer" value="Checked" helper="Verification + moderation disclosures" />
              <StatCard label="Best use" value="Browse wide" helper="Then narrow once you see supply" />
            </div>
          </div>

          <div className="mt-10 rounded-[28px] border border-stone-200 bg-white/95 p-5 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.28)] backdrop-blur sm:p-6">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_0.8fr]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                <Input
                  placeholder="Search by name or service"
                  aria-label="Search by name or service"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 rounded-2xl border-stone-200 bg-stone-50 pl-11 text-stone-900 placeholder:text-stone-400"
                />
              </div>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                <CityAutocomplete
                  value={location}
                  onChange={setLocation}
                  className="h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 pl-11 pr-4 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-12 rounded-2xl border-stone-200 bg-stone-50 text-stone-900" aria-label="Sort results by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="rating">Highest rated</SelectItem>
                  <SelectItem value="price_low">Price: low to high</SelectItem>
                  <SelectItem value="price_high">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-stone-200 pt-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => toggleFilter("verified")} 
                  aria-pressed={selectedFilters.verified}
                  className={selectedFilters.verified ? "rounded-full border-stone-900 bg-stone-900 text-stone-50 hover:bg-stone-800" : "rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}
                >
                  <Shield className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Verified only
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => toggleFilter("premium")} 
                  aria-pressed={selectedFilters.premium}
                  className={selectedFilters.premium ? "rounded-full border-stone-900 bg-stone-900 text-stone-50 hover:bg-stone-800" : "rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}
                >
                  <Crown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Premium only
                </Button>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear all
                </Button>
              </div>

              <div className="w-full max-w-sm">
                <div className="mb-2 flex items-center justify-between text-sm text-stone-500">
                  <span>Hourly rate</span>
                  <span className="font-medium text-stone-700">${priceRange[0]} - ${priceRange[1]}</span>
                </div>
                <Slider value={priceRange} onValueChange={setPriceRange} max={maxAllowedPrice} step={50} className="[&_[role=slider]]:border-stone-700 [&_[role=slider]]:bg-stone-900" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {trustNotes.map((note) => (
              <div key={note} className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-4 text-sm leading-6 text-stone-600">
                {note}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">Results</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">Browse live advertiser profiles</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              {isLoading ? "Loading results..." : `${total} listing${total === 1 ? "" : "s"} found`}{isFetching && !isLoading ? " · refreshing" : ""}
            </p>
            {hasActiveFilters && !isLoading && (
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Showing {total} results. Try widening your search for more.
              </p>
            )}
          </div>

          {isStateSearch && cityGroups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cityGroups.map((group) => (
                <Badge key={`${group.city}-${group.state}`} className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-stone-600 shadow-none">
                  {group.city} ({group.count})
                </Badge>
              ))}
            </div>
          )}
        </div>

        {touringProviders.length > 0 && (
          <div className="mb-10 rounded-[28px] border border-rose-100 bg-rose-50/70 p-5 shadow-[0_24px_80px_-40px_rgba(190,18,60,0.24)]">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-rose-600">Touring soon</p>
                <h3 className="mt-2 text-2xl font-semibold text-stone-900">Advertisers with scheduled city dates</h3>
              </div>
              <p className="max-w-xl text-sm leading-6 text-stone-600">Tour Pro profiles can show upcoming city stops so clients can plan ahead.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {touringProviders.map((provider) => {
                const nextStop = provider.tour_plan.cities[0];
                return (
                  <Link key={`tour-${provider.id}`} to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="rounded-2xl border border-rose-100 bg-white p-4 transition hover:border-rose-200 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-stone-900">{provider.display_name}</p>
                        <p className="mt-1 text-sm text-stone-500">{nextStop.city}{nextStop.region ? `, ${nextStop.region}` : ""}</p>
                      </div>
                      <Badge className="rounded-full bg-rose-100 text-rose-700 shadow-none">Touring</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-stone-700">{nextStop.startsAt} to {nextStop.endsAt}</p>
                    {provider.ad_headline ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{provider.ad_headline}</p> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {hasLowResults && (
          <div className="mb-8 grid gap-4 rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.18)] lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-stone-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Limited but qualified results
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-stone-900">A narrower result set can still be useful</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
                You are seeing a smaller pool for this search. That usually means the active inventory is concentrated, not broken. Broaden city/state filters to compare more profiles, or review trust standards before deciding.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to={createPageUrl("Trust")}>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-stone-300 hover:bg-white">
                  <p className="text-sm font-medium text-stone-900">Verification standards</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">Understand badges, moderation, and where claims may still vary.</p>
                </div>
              </Link>
              <Link to={createPageUrl("Pricing")}>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-stone-300 hover:bg-white">
                  <p className="text-sm font-medium text-stone-900">Provider placement</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">Looking to appear here? Review advertising and premium visibility options.</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-[24px] border border-stone-200 bg-white">
                <Skeleton className="aspect-[4/5] w-full" />
                <div className="space-y-3 p-6">
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-[28px] border border-stone-200 bg-white px-6 py-14 text-center shadow-[0_24px_80px_-36px_rgba(28,25,23,0.18)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-stone-500">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="mt-6 text-2xl font-semibold text-stone-900">No matching listings yet</h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-stone-600">
              Try broadening your search or explore how verified placement works. New approved listings and reviews appear on a rolling basis as external provider checks and moderation complete.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button onClick={clearFilters} className="rounded-full bg-stone-900 px-6 text-stone-50 hover:bg-stone-800">
                Reset filters
              </Button>
              <Link to={createPageUrl("Trust")}>
                <Button variant="outline" className="rounded-full border-stone-300 bg-white px-6 text-stone-700 hover:bg-stone-50">
                  How verification works
                </Button>
              </Link>
              <Link to={createPageUrl("Pricing")}>
                <Button variant="outline" className="rounded-full border-stone-300 bg-white px-6 text-stone-700 hover:bg-stone-50">
                  Advertise on La Boutique VIP
                </Button>
              </Link>
            </div>
          </div>
        ) : isStateSearch ? (
          <div className="space-y-10">
            {Object.entries(groupedProviders).map(([cityLabel, cityProviders]) => (
              <div key={cityLabel}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-2xl font-semibold text-stone-900">{cityLabel}</h3>
                  <Badge className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-stone-600 shadow-none">
                    {cityProviders.length} listing{cityProviders.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {cityProviders.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
          </div>
        )}

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {ctaCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.title} to={card.href} className="group rounded-[24px] border border-stone-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(28,25,23,0.18)] transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_24px_50px_-30px_rgba(28,25,23,0.24)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-stone-900">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{card.description}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-stone-900">
                  {card.label}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button variant="outline" className="rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-sm text-stone-500">Page {page} of {totalPages}</span>
            <Button variant="outline" className="rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-50" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">{value}</p>
      <p className="mt-2 text-sm leading-6 text-stone-500">{helper}</p>
    </div>
  );
}

function ProviderCard({ provider }) {
  const ratingMeta = getProviderRatingMeta(provider);

  return (
    <Link to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="group block">
      <article className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_18px_45px_-28px_rgba(28,25,23,0.24)] transition duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_24px_55px_-28px_rgba(28,25,23,0.34)]">
        <div className="relative aspect-[4/5] overflow-hidden bg-stone-100">
          <ProfileImage
            src={provider.photos?.[0]}
            alt={provider.display_name}
            className="h-full w-full transition duration-500 group-hover:scale-105"
          />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            {/* Logic for "Just joined" - assuming is_new or based on created_date */}
            {(provider.is_new || (new Date() - new Date(provider.created_date) < 7 * 24 * 60 * 60 * 1000)) && (
              <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-600 shadow-none border border-blue-100">
                Just joined
              </Badge>
            )}
            {provider.is_verified && (
              <Badge className="rounded-full bg-stone-900 px-3 py-1 text-stone-50 shadow-none">
                <Shield className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            )}
            {provider.is_premium && (
              <Badge className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 shadow-none">
                <Crown className="mr-1 h-3 w-3" />
                Premium
              </Badge>
            )}
            {provider.tour_plan?.cities?.length > 0 && (
              <Badge className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 shadow-none border border-rose-100">
                <MapPin className="mr-1 h-3 w-3" />
                Touring
              </Badge>
            )}
          </div>
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
            {provider.rate_hourly && (
              <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-900">
                ${provider.rate_hourly}/hr
              </span>
            )}
          </div>

          {provider.tagline && (
            <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-600">{provider.ad_headline || provider.tagline}</p>
          )}

          {provider.tour_plan?.cities?.length > 0 && (
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-rose-600">
              Next: {provider.tour_plan.cities[0].city} · {provider.tour_plan.cities[0].startsAt}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-stone-600">
              <Star className={`h-4 w-4 ${ratingMeta.hasReviews ? "fill-amber-400 text-amber-400" : "text-stone-300"}`} />
              <span className="font-medium text-stone-700">{ratingMeta.value}</span>
              <span className="text-stone-400">{ratingMeta.detail}</span>
            </div>
            <span className="inline-flex items-center gap-2 font-medium text-stone-900">
              View profile
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
