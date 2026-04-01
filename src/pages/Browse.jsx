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
import { Search, MapPin, Star, Shield, Crown, Filter, X, ArrowRight, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { searchProviders } from "@/api/providerSearch";
import { getProviderRatingMeta } from "@/lib/providerPresentation";

function groupProvidersByCity(items) {
  return items.reduce((acc, provider) => {
    const key = `${provider.location_city || "Unknown"}, ${provider.location_state || "Unknown"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(provider);
    return acc;
  }, {});
}

const trustNotes = [
  "Verification badges appear after external identity checks and internal approval.",
  "Reviews only appear after moderation and may be limited while rollout continues.",
  "Rates and contact methods are supplied by advertisers and can change after publication.",
];

export default function Browse() {
  const urlParams = new URLSearchParams(window.location.search);
  const [searchQuery, setSearchQuery] = React.useState(urlParams.get("q") || "");
  const [location, setLocation] = React.useState(urlParams.get("location") || "");
  const [priceRange, setPriceRange] = React.useState([0, 2000]);
  const [sortBy, setSortBy] = React.useState("newest");
  const [selectedFilters, setSelectedFilters] = React.useState({ verified: false, premium: false });
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, location, sortBy, selectedFilters.verified, selectedFilters.premium, priceRange[0], priceRange[1]]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["provider-search", searchQuery, location, sortBy, selectedFilters, priceRange, page],
    queryFn: () => searchProviders({
      q: searchQuery,
      location,
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
  const isStateSearch = !!location && providers.some((provider) => provider.location_state?.toLowerCase() === location.toLowerCase()) && new Set(providers.map((provider) => provider.location_city)).size > 1;
  const groupedProviders = groupProvidersByCity(providers);

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
      <section className="border-b border-stone-200/80 bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.08),_transparent_45%),linear-gradient(180deg,#fafaf9_0%,#f7f4ef_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">Browse the directory</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">Refined discovery with clearer trust signals</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              Explore live listings, transparent rate ranges, and profile details presented with a more measured trust layer.
            </p>
          </div>

          <div className="mt-10 rounded-[28px] border border-stone-200 bg-white/95 p-5 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.28)] backdrop-blur sm:p-6">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_0.8fr]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <Input
                  placeholder="Search by name or service"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 rounded-2xl border-stone-200 bg-stone-50 pl-11 text-stone-900 placeholder:text-stone-400"
                />
              </div>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <Input
                  placeholder="City or state"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-12 rounded-2xl border-stone-200 bg-stone-50 pl-11 text-stone-900 placeholder:text-stone-400"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-12 rounded-2xl border-stone-200 bg-stone-50 text-stone-900">
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
                <Button variant="outline" size="sm" onClick={() => toggleFilter("verified")} className={selectedFilters.verified ? "rounded-full border-stone-900 bg-stone-900 text-stone-50 hover:bg-stone-800" : "rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}>
                  <Shield className="mr-1 h-3.5 w-3.5" />
                  Verified only
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleFilter("premium")} className={selectedFilters.premium ? "rounded-full border-stone-900 bg-stone-900 text-stone-50 hover:bg-stone-800" : "rounded-full border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}>
                  <Crown className="mr-1 h-3.5 w-3.5" />
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
                <Slider value={priceRange} onValueChange={setPriceRange} max={2000} step={50} className="[&_[role=slider]]:border-stone-700 [&_[role=slider]]:bg-stone-900" />
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
        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">Results</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">Browse live advertiser profiles</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              {isLoading ? "Loading results..." : `${total} listing${total === 1 ? "" : "s"} found`}{isFetching && !isLoading ? " · refreshing" : ""}
            </p>
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

function ProviderCard({ provider }) {
  const ratingMeta = getProviderRatingMeta(provider);

  return (
    <Link to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="group block">
      <article className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_18px_45px_-28px_rgba(28,25,23,0.24)] transition duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_24px_55px_-28px_rgba(28,25,23,0.34)]">
        <div className="relative aspect-[4/5] overflow-hidden bg-stone-100">
          {provider.photos?.[0] ? (
            <img
              src={provider.photos[0]}
              alt={provider.display_name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-stone-300">
              <Crown className="h-14 w-14" />
            </div>
          )}
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
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
            <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-600">{provider.tagline}</p>
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
