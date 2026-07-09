// @ts-nocheck
import React from "react";
import { Link, useParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, Shield, Crown, Filter, X, ArrowRight, Sparkles, CheckCircle2, LifeBuoy, Megaphone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { searchProviders } from "@/api/providerSearch";
import { ProviderListingCard } from "@/components/ProviderListingCard";
import { SEO } from "@/components/SEO";
import { LocationPicker } from "@/components/LocationPicker";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
  "P411 Verified and Review Verified badges are earned from external signals — not sold with placement.",
  "Imported listings require a P411 or review-site match before they appear in browse.",
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

function citySlugToReadable(slug) {
  if (!slug) return "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Browse() {
  const urlParams = new URLSearchParams(window.location.search);
  const { citySlug } = useParams();
  const initialLocation =
    urlParams.get("location") ||
    urlParams.get("loc") ||
    (citySlug ? citySlugToReadable(citySlug) : "");
  const [searchQuery, setSearchQuery] = React.useState(urlParams.get("q") || "");
  const [location, setLocation] = React.useState(initialLocation);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const debouncedLocation = useDebounce(location, 300);

  const [priceRange, setPriceRange] = React.useState([0, 2000]);
  const [sortBy, setSortBy] = React.useState("newest");
  const [selectedFilters, setSelectedFilters] = React.useState({ verified: false, premium: false });
  const [page, setPage] = React.useState(1);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

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

  const activeFilterCount =
    (location ? 1 : 0) +
    (selectedFilters.verified ? 1 : 0) +
    (selectedFilters.premium ? 1 : 0) +
    (priceRange[0] > 0 || priceRange[1] < 2000 ? 1 : 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="Browse Verified Profiles & Listings | La Boutique VIP International"
        description="Explore verified profiles and listings with transparent rates, moderated reviews, and discreet discovery. Filter by verification status and premium features."
        ogTitle="Browse Verified Profiles | La Boutique VIP"
        ogDescription="Discreet directory of verified listings and premium profiles."
      />
      <div className="mx-auto max-w-7xl px-6 pt-6 pb-2 lg:px-8">
        <Breadcrumb className="py-2">
          <BreadcrumbList className="text-muted-foreground">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={createPageUrl("Home")}>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {location ? (
                <BreadcrumbLink asChild>
                  <Link to={createPageUrl("Browse")}>Browse</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>Browse</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {location ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{location}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <section className="relative overflow-hidden border-b border-zinc-900/80 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.12),_transparent_40%),linear-gradient(180deg,#09090b_0%,#121215_100%)]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold tracking-[0.22em] text-rose-400 uppercase">Browse the directory</p>
              <h1 className="mt-4 text-4xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl leading-tight">
                Refined discovery with stronger trust & clearer paths
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 font-light sm:text-lg">
                Explore live listings with transparent rate ranges, moderated reviews, and a calmer path to finding the right match.
              </p>
            </div>

            <div className="grid gap-3 rounded-[32px] glass-panel p-5 sm:grid-cols-3">
              <StatCard label="Live listings" value={isLoading ? <span aria-hidden="true">...</span> : `${total}`} helper="Approved and active" />
              <StatCard label="Trust layer" value="Checked" helper="Verification disclosure" />
              <StatCard label="Best use" value="Browse wide" helper="Then narrow by criteria" />
            </div>
          </div>

          <div className="mt-10 rounded-[32px] glass-panel glow-gold p-5 sm:p-6">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr_0.75fr]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                <Input
                  placeholder="Search by name or service"
                  aria-label="Search by name or service"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 rounded-2xl border-zinc-850 bg-zinc-950/70 pl-11 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:ring-amber-500/20"
                />
              </div>
              <div className="hidden md:block">
                <LocationPicker value={location} onChange={setLocation} />
              </div>
              <div className="flex gap-3">
                {/* Mobile: full filters live in a drawer so listings stay above the fold */}
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="md:hidden h-12 flex-1 rounded-2xl border-zinc-800 bg-zinc-950/70 text-zinc-200 hover:bg-zinc-900 hover:text-white"
                    >
                      <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-zinc-800 bg-zinc-950 text-zinc-100">
                    <SheetHeader>
                      <SheetTitle className="text-zinc-100">Filters</SheetTitle>
                    </SheetHeader>
                    <div className="mt-5 space-y-6 pb-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Location</p>
                        <LocationPicker value={location} onChange={setLocation} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Trust</p>
                        <FilterChips selectedFilters={selectedFilters} toggleFilter={toggleFilter} />
                      </div>
                      <RateSlider priceRange={priceRange} setPriceRange={setPriceRange} maxAllowedPrice={maxAllowedPrice} />
                      <div className="flex gap-3 pt-1">
                        <Button variant="ghost" onClick={clearFilters} className="h-11 flex-1 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200">
                          <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Clear all
                        </Button>
                        <Button onClick={() => setFiltersOpen(false)} className="h-11 flex-1 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold border-0 hover:opacity-95">
                          Show results
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-12 flex-1 rounded-2xl border-zinc-850 bg-zinc-950/70 text-zinc-100 focus:border-amber-500 focus:ring-amber-500/20" aria-label="Sort results by">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="rating">Highest rated</SelectItem>
                    <SelectItem value="price_low">Price: low to high</SelectItem>
                    <SelectItem value="price_high">Price: high to low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-5 hidden flex-col gap-4 border-t border-zinc-800 pt-5 md:flex xl:flex-row xl:items-end xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </div>
                <FilterChips selectedFilters={selectedFilters} toggleFilter={toggleFilter} />
                <Button variant="ghost" size="sm" onClick={clearFilters} className="rounded-full text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200">
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear all
                </Button>
              </div>

              <div className="w-full xl:max-w-sm">
                <RateSlider priceRange={priceRange} setPriceRange={setPriceRange} maxAllowedPrice={maxAllowedPrice} />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {trustNotes.map((note) => (
              <div key={note} className="rounded-2xl border border-zinc-900 bg-zinc-900/20 px-4 py-4 text-xs leading-5 text-zinc-400 font-light">
                {note}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-450">Results</p>
            <h2 className="mt-3 text-3xl font-serif font-bold tracking-tight text-zinc-100">Live directory listings</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              {isLoading ? "Loading results..." : `${total} listing${total === 1 ? "" : "s"} found`}{isFetching && !isLoading ? "   refreshing" : ""}
            </p>
            {hasActiveFilters && !isLoading && (
              <p className="mt-2 text-sm leading-6 text-zinc-500 font-light">
                Showing {total} results. Try widening your criteria to discover more.
              </p>
            )}
          </div>

          {isStateSearch && cityGroups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cityGroups.map((group) => (
                <Badge key={`${group.city}-${group.state}`} className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1 text-zinc-400 shadow-none">
                  {group.city} ({group.count})
                </Badge>
              ))}
            </div>
          )}
        </div>

        {touringProviders.length > 0 && (
          <div className="mb-10 rounded-[32px] border border-rose-950/30 bg-rose-950/10 p-5 shadow-[0_24px_80px_-40px_rgba(244,63,94,0.3)]">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-400">Touring soon</p>
                <h3 className="mt-2 text-2xl font-serif font-bold text-zinc-100">Advertisers with scheduled city dates</h3>
              </div>
              <p className="max-w-xl text-sm leading-6 text-zinc-400 font-light">Touring profiles can show upcoming city stops so clients can plan ahead.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {touringProviders.map((provider) => {
                const nextStop = provider.tour_plan.cities[0];
                return (
                  <Link key={`tour-${provider.id}`} to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 transition hover:border-rose-500/30 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-100 group-hover:text-amber-400">{provider.display_name}</p>
                        <p className="mt-1 text-sm text-zinc-500">{nextStop.city}{nextStop.region ? `, ${nextStop.region}` : ""}</p>
                      </div>
                      <Badge className="rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">Touring</Badge>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-amber-400">{nextStop.startsAt} to {nextStop.endsAt}</p>
                    {provider.ad_headline ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400 font-light">{provider.ad_headline}</p> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {hasLowResults && (
          <div className="mb-8 grid gap-4 rounded-[32px] border border-zinc-800 bg-zinc-900/20 p-5 shadow-2xl lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400 border border-zinc-800">
                <CheckCircle2 className="h-3.5 w-3.5 text-rose-400" />
                Limited but qualified results
              </div>
              <h3 className="mt-4 text-2xl font-serif font-bold text-zinc-100">A narrower result set can still be useful</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 font-light">
                You are seeing a smaller pool for this search. That usually means the active inventory is concentrated, not broken. Broaden city/state filters to compare more profiles, or review trust standards before deciding.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to={createPageUrl("Trust")}>
                <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 transition hover:border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-100">Verification standards</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400 font-light">Understand badges, moderation, and verification processes.</p>
                </div>
              </Link>
              <Link to={createPageUrl("Pricing")}>
                <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 transition hover:border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-100">Provider placement</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-450 font-light">Looking to appear here? Review advertising and premium packages.</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-[28px] border border-zinc-900 bg-zinc-900/20">
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
          <div className="rounded-[32px] border border-zinc-900 bg-zinc-900/20 px-6 py-14 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-500 border border-zinc-800">
              <Sparkles className="h-7 w-7 text-amber-400" />
            </div>
            <h3 className="mt-6 text-2xl font-serif font-bold text-zinc-100">No matching listings yet</h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-zinc-400 font-light">
              Try broadening your search or explore how verified placement works. New approved listings and reviews appear on a rolling basis.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button onClick={clearFilters} className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-8 h-12 shadow-lg border-0 glow-rose">
                Reset filters
              </Button>
              <Link to={createPageUrl("Trust")}>
                <Button variant="outline" className="rounded-full border-zinc-800 bg-zinc-950 px-6 h-12 text-zinc-300 hover:bg-zinc-900 hover:text-white">
                  How verification works
                </Button>
              </Link>
              <Link to={createPageUrl("Pricing")}>
                <Button variant="outline" className="rounded-full border-zinc-800 bg-zinc-950 px-6 h-12 text-zinc-300 hover:bg-zinc-900 hover:text-white">
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
                  <h3 className="text-2xl font-serif font-bold text-zinc-100">{cityLabel}</h3>
                  <Badge className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1 text-zinc-400 shadow-none">
                    {cityProviders.length} listing{cityProviders.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {cityProviders.map((provider) => <ProviderListingCard key={provider.id} provider={provider} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => <ProviderListingCard key={provider.id} provider={provider} />)}
          </div>
        )}

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {ctaCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.title} to={card.href} className="group rounded-[32px] glass-panel glass-panel-hover p-5 hover-lift">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-400">
                  <Icon className="h-5 w-5 text-rose-450" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-zinc-100 group-hover:text-amber-400">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400 font-light">{card.description}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-zinc-350 group-hover:text-amber-400 transition-colors">
                  {card.label}
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button variant="outline" className="rounded-full border-zinc-800 bg-zinc-950 text-zinc-350 hover:bg-zinc-900 hover:text-white" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
            <Button variant="outline" className="rounded-full border-zinc-800 bg-zinc-950 text-zinc-350 hover:bg-zinc-900 hover:text-white" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
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
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/50 px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-serif font-bold tracking-tight text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{helper}</p>
    </div>
  );
}

function FilterChips({ selectedFilters, toggleFilter }) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => toggleFilter("verified")}
        aria-pressed={selectedFilters.verified}
        className={`min-h-11 sm:min-h-0 ${selectedFilters.verified
          ? "rounded-full border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 shadow-sm"
          : "rounded-full border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
      >
        <Shield className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Verified only
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => toggleFilter("premium")}
        aria-pressed={selectedFilters.premium}
        className={`min-h-11 sm:min-h-0 ${selectedFilters.premium
          ? "rounded-full border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 shadow-sm"
          : "rounded-full border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}
      >
        <Crown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Premium only
      </Button>
    </>
  );
}

function RateSlider({ priceRange, setPriceRange, maxAllowedPrice }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 uppercase tracking-wider">
        <span>Hourly rate</span>
        <span className="font-semibold text-amber-400">${priceRange[0]} - ${priceRange[1]}</span>
      </div>
      <Slider
        value={priceRange}
        onValueChange={setPriceRange}
        max={maxAllowedPrice}
        step={50}
        aria-label="Hourly rate range"
        trackClassName="bg-zinc-800"
        rangeClassName="bg-gradient-to-r from-amber-500 to-amber-400"
        thumbClassName="border-amber-500/60 bg-zinc-900"
      />
    </div>
  );
}
