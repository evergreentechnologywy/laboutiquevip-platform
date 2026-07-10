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
import { motion, AnimatePresence } from "framer-motion";

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
  const debouncedPriceRange = useDebounce(priceRange, 400);
  const [sortBy, setSortBy] = React.useState("newest");
  const [selectedFilters, setSelectedFilters] = React.useState({ verified: false, premium: false });
  const [page, setPage] = React.useState(1);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, location, sortBy, selectedFilters.verified, selectedFilters.premium, priceRange[0], priceRange[1]]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["provider-search", debouncedSearchQuery, debouncedLocation, sortBy, selectedFilters, debouncedPriceRange, page],
    queryFn: () => searchProviders({
      q: debouncedSearchQuery,
      location: debouncedLocation,
      verified: selectedFilters.verified,
      premium: selectedFilters.premium,
      minPrice: debouncedPriceRange[0],
      maxPrice: debouncedPriceRange[1],
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

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="Browse Verified Profiles & Listings | La Boutique VIP International"
        description="Explore verified profiles and listings with transparent rates, moderated reviews, and discreet discovery. Filter by verification status and premium features."
        ogTitle="Browse Verified Profiles | La Boutique VIP"
        ogDescription="Discreet directory of verified listings and premium profiles."
      />
      <div className="mx-auto max-w-7xl px-6 pt-6 pb-2 lg:px-8 relative z-10">
        <Breadcrumb className="py-2">
          <BreadcrumbList className="text-zinc-500">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={createPageUrl("Home")} className="hover:text-amber-400 transition-colors">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {location ? (
                <BreadcrumbLink asChild>
                  <Link to={createPageUrl("Browse")} className="hover:text-amber-400 transition-colors">Browse</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="text-zinc-300 font-medium">Browse</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {location ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-zinc-300 font-medium">{location}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <section className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
        {/* Animated Background Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-rose-500/5 to-zinc-950/0 opacity-80 pointer-events-none" />
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-rose-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] lg:items-end">
            <motion.div 
              initial={{ opacity: 0, x: -20 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="max-w-3xl"
            >
              <p className="text-xs font-semibold tracking-[0.25em] text-rose-400 uppercase">Browse the directory</p>
              <h1 className="mt-4 text-4xl font-serif font-bold tracking-tight text-white sm:text-6xl leading-tight">
                Refined discovery with <br className="hidden sm:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-rose-400">stronger trust</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 font-light sm:text-lg">
                Explore live listings with transparent rate ranges, moderated reviews, and a calmer path to finding the right match.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
              className="grid gap-4 rounded-[2rem] bg-white/5 backdrop-blur-2xl border border-white/10 p-5 sm:grid-cols-3 shadow-2xl"
            >
              <StatCard label="Live listings" value={isLoading ? <span aria-hidden="true" className="animate-pulse">...</span> : `${total}`} helper="Approved & active" />
              <StatCard label="Trust layer" value="Checked" helper="Verification disclosure" />
              <StatCard label="Best use" value="Browse wide" helper="Then narrow down" />
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="mt-10 rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/10 p-6 shadow-2xl relative overflow-hidden"
          >
            {/* Subtle inner glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-rose-500/5 to-amber-500/5 pointer-events-none" />
            
            <div className="relative grid gap-5 xl:grid-cols-[1.2fr_1.4fr_0.8fr]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                <Input
                  placeholder="Search by name or service"
                  aria-label="Search by name or service"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-14 rounded-2xl border-white/10 bg-zinc-950/50 backdrop-blur-xl pl-12 text-lg text-white placeholder:text-zinc-500 focus:border-amber-500 focus:ring-amber-500/20 transition-all duration-300"
                />
              </div>
              <div className="hidden md:block">
                <LocationPicker value={location} onChange={setLocation} />
              </div>
              <div className="flex gap-3">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="md:hidden h-14 flex-1 rounded-2xl border-white/10 bg-zinc-950/50 text-zinc-200 hover:bg-zinc-900 hover:text-white backdrop-blur-xl"
                    >
                      <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[2rem] border-white/10 bg-zinc-950/90 backdrop-blur-3xl text-zinc-100">
                    <SheetHeader>
                      <SheetTitle className="text-zinc-100 font-serif text-2xl">Filters</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-8 pb-6">
                      <div>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Location</p>
                        <LocationPicker value={location} onChange={setLocation} />
                      </div>
                      <div>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Trust</p>
                        <div className="flex flex-wrap gap-2">
                          <FilterChips selectedFilters={selectedFilters} toggleFilter={toggleFilter} />
                        </div>
                      </div>
                      <RateSlider priceRange={priceRange} setPriceRange={setPriceRange} maxAllowedPrice={maxAllowedPrice} />
                      <div className="flex gap-3 pt-4">
                        <Button variant="ghost" onClick={clearFilters} className="h-14 flex-1 rounded-2xl text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
                          <X className="mr-2 h-4 w-4" aria-hidden="true" />
                          Clear all
                        </Button>
                        <Button onClick={() => setFiltersOpen(false)} className="h-14 flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-semibold border-0 hover:opacity-95 shadow-lg shadow-rose-500/20">
                          Show results
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-14 flex-1 rounded-2xl border-white/10 bg-zinc-950/50 text-zinc-200 focus:border-amber-500 focus:ring-amber-500/20 backdrop-blur-xl transition-all duration-300" aria-label="Sort results by">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 text-zinc-100 rounded-xl">
                    <SelectItem value="newest" className="focus:bg-white/5">Newest</SelectItem>
                    <SelectItem value="rating" className="focus:bg-white/5">Highest rated</SelectItem>
                    <SelectItem value="price_low" className="focus:bg-white/5">Price: low to high</SelectItem>
                    <SelectItem value="price_high" className="focus:bg-white/5">Price: high to low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 hidden flex-col gap-5 border-t border-white/5 pt-6 md:flex xl:flex-row xl:items-end xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-zinc-500 font-medium tracking-wide">
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </div>
                <FilterChips selectedFilters={selectedFilters} toggleFilter={toggleFilter} />
                <AnimatePresence>
                  {hasActiveFilters && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="rounded-full text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors">
                        <X className="mr-1 h-3.5 w-3.5" />
                        Clear all
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="w-full xl:max-w-md">
                <RateSlider priceRange={priceRange} setPriceRange={setPriceRange} maxAllowedPrice={maxAllowedPrice} />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-8 grid gap-4 lg:grid-cols-3"
          >
            {trustNotes.map((note, idx) => (
              <div key={idx} className="rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md px-5 py-4 text-xs leading-relaxed text-zinc-400 font-light hover:bg-white/[0.04] transition-colors duration-300">
                {note}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 py-12 lg:py-20 z-10">
        <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Results</p>
            <h2 className="mt-3 text-3xl font-serif font-bold tracking-tight text-white sm:text-4xl">Live directory listings</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400 flex items-center gap-3">
              {isLoading ? "Curating results..." : `${total} listing${total === 1 ? "" : "s"} found`}
              {isFetching && !isLoading && (
                <span className="flex items-center gap-1.5 text-amber-400/80">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  refreshing
                </span>
              )}
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
                <Badge key={`${group.city}-${group.state}`} className="rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-4 py-1.5 text-zinc-300 font-medium shadow-sm">
                  {group.city} <span className="ml-2 text-zinc-500">{group.count}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {touringProviders.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 rounded-[2.5rem] border border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-rose-950/20 backdrop-blur-2xl p-8 shadow-[0_32px_100px_-40px_rgba(244,63,94,0.2)]"
          >
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Touring soon</p>
                <h3 className="mt-2 text-3xl font-serif font-bold text-white">Advertisers with scheduled dates</h3>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-zinc-400 font-light">Touring profiles can show upcoming city stops so clients can plan ahead.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {touringProviders.map((provider) => {
                const nextStop = provider.tour_plan.cities[0];
                return (
                  <Link key={`tour-${provider.id}`} to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="group rounded-[1.5rem] border border-white/5 bg-zinc-950/60 backdrop-blur-xl p-5 transition-all duration-300 hover:border-rose-500/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-rose-500/10">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-lg font-bold text-white group-hover:text-rose-300 transition-colors">{provider.display_name}</p>
                        <p className="mt-1 text-sm text-zinc-400">{nextStop.city}{nextStop.region ? `, ${nextStop.region}` : ""}</p>
                      </div>
                      <Badge className="rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">Touring</Badge>
                    </div>
                    <p className="mt-4 text-sm font-semibold tracking-wide text-amber-400 bg-amber-500/10 inline-block px-3 py-1 rounded-lg">{nextStop.startsAt} — {nextStop.endsAt}</p>
                    {provider.ad_headline ? <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-zinc-500 font-light group-hover:text-zinc-400 transition-colors">{provider.ad_headline}</p> : null}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}

        {hasLowResults && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-12 grid gap-6 rounded-[2.5rem] border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-8 shadow-2xl lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-center"
          >
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300 border border-white/10">
                <CheckCircle2 className="h-4 w-4 text-rose-400" />
                Limited but qualified
              </div>
              <h3 className="mt-5 text-3xl font-serif font-bold text-white leading-tight">A narrower result set can still be useful</h3>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400 font-light">
                You are seeing a smaller pool for this search. That usually means the active inventory is concentrated, not broken. Broaden city/state filters to compare more profiles, or review trust standards before deciding.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Link to={createPageUrl("Trust")}>
                <div className="rounded-[1.5rem] border border-white/5 bg-zinc-950/50 p-5 transition-all duration-300 hover:border-white/20 hover:-translate-y-1 hover:bg-white/5">
                  <p className="text-base font-semibold text-white">Verification standards</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500 font-light">Understand badges, moderation, and verification processes.</p>
                </div>
              </Link>
              <Link to={createPageUrl("Pricing")}>
                <div className="rounded-[1.5rem] border border-white/5 bg-zinc-950/50 p-5 transition-all duration-300 hover:border-white/20 hover:-translate-y-1 hover:bg-white/5">
                  <p className="text-base font-semibold text-white">Provider placement</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500 font-light">Looking to appear here? Review advertising and premium packages.</p>
                </div>
              </Link>
            </div>
          </motion.div>
        )}

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-[2rem] border border-white/5 bg-zinc-900/40 backdrop-blur-sm">
                <Skeleton className="aspect-[4/5] w-full bg-white/5" />
                <div className="space-y-4 p-6">
                  <Skeleton className="h-6 w-2/3 bg-white/10" />
                  <Skeleton className="h-4 w-1/2 bg-white/5" />
                  <Skeleton className="h-4 w-full bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[3rem] border border-white/5 bg-white/[0.02] backdrop-blur-2xl px-6 py-20 text-center shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
            <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/5 border border-white/10 shadow-2xl">
              <Sparkles className="h-8 w-8 text-amber-400" />
            </div>
            <h3 className="mt-8 text-3xl font-serif font-bold text-white relative z-10">No matching listings yet</h3>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-400 font-light relative z-10">
              Try broadening your search or explore how verified placement works. New approved listings and reviews appear on a rolling basis.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row relative z-10">
              <Button onClick={clearFilters} className="rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold tracking-wide hover:opacity-95 px-8 h-14 shadow-xl shadow-rose-500/20 border-0">
                Reset filters
              </Button>
              <Link to={createPageUrl("Trust")}>
                <Button variant="outline" className="rounded-2xl border-white/10 bg-zinc-950/50 backdrop-blur-md px-6 h-14 text-zinc-300 hover:bg-white/10 hover:text-white transition-all duration-300">
                  How verification works
                </Button>
              </Link>
            </div>
          </motion.div>
        ) : isStateSearch ? (
          <div className="space-y-16">
            {Object.entries(groupedProviders).map(([cityLabel, cityProviders], idx) => (
              <motion.div 
                key={cityLabel}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
              >
                <div className="mb-6 flex items-center justify-between gap-4 border-b border-white/5 pb-4">
                  <h3 className="text-3xl font-serif font-bold text-white">{cityLabel}</h3>
                  <Badge className="rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-4 py-1.5 text-zinc-400 font-medium shadow-sm">
                    {cityProviders.length} listing{cityProviders.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  {cityProviders.map((provider) => (
                    <motion.div key={provider.id} variants={itemVariants}>
                      <ProviderListingCard provider={provider} />
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {providers.map((provider) => (
              <motion.div key={provider.id} variants={itemVariants}>
                <ProviderListingCard provider={provider} />
              </motion.div>
            ))}
          </motion.div>
        )}

        <div className="mt-20 grid gap-6 lg:grid-cols-3">
          {ctaCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
              >
                <Link to={card.href} className="group block h-full rounded-[2.5rem] border border-white/5 bg-white/[0.02] backdrop-blur-xl p-8 transition-all duration-500 hover:border-white/20 hover:bg-white/[0.04] hover:-translate-y-2 hover:shadow-2xl">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-zinc-400 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 group-hover:bg-rose-500/10">
                    <Icon className="h-6 w-6 text-rose-400" />
                  </div>
                  <h3 className="mt-6 text-xl font-serif font-bold text-white group-hover:text-amber-300 transition-colors duration-300">{card.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400 font-light group-hover:text-zinc-300 transition-colors duration-300">{card.description}</p>
                  <div className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-bold text-zinc-500 group-hover:text-amber-400 transition-colors duration-300">
                    {card.label}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-20 flex items-center justify-center gap-4">
            <Button variant="outline" className="h-14 rounded-full border-white/10 bg-zinc-950/50 backdrop-blur-md px-8 text-zinc-300 hover:bg-white/10 hover:text-white transition-all duration-300" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-sm font-medium text-zinc-400 bg-white/5 px-6 py-3 rounded-full border border-white/5">
              Page <span className="text-white">{page}</span> of <span className="text-white">{totalPages}</span>
            </span>
            <Button variant="outline" className="h-14 rounded-full border-white/10 bg-zinc-950/50 backdrop-blur-md px-8 text-zinc-300 hover:bg-white/10 hover:text-white transition-all duration-300" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
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
    <div className="rounded-3xl border border-white/5 bg-zinc-950/40 p-5 transition-all duration-300 hover:bg-white/[0.04] overflow-hidden min-w-0 flex-shrink-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500 truncate">{label}</p>
      <p className="mt-3 text-base font-serif font-bold tracking-tight text-white truncate">{value}</p>
      <p className="mt-2 text-xs font-medium text-zinc-400 truncate">{helper}</p>
    </div>
  );
}

function FilterChips({ selectedFilters, toggleFilter }) {
  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => toggleFilter("verified")}
        aria-pressed={selectedFilters.verified}
        className={`inline-flex items-center justify-center h-10 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:pointer-events-none disabled:opacity-50 ${selectedFilters.verified
          ? "rounded-full border border-rose-500/40 bg-rose-500/20 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
          : "rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"}`}
      >
        <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
        Verified only
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => toggleFilter("premium")}
        aria-pressed={selectedFilters.premium}
        className={`inline-flex items-center justify-center h-10 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:pointer-events-none disabled:opacity-50 ${selectedFilters.premium
          ? "rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.3)]"
          : "rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"}`}
      >
        <Crown className="mr-2 h-4 w-4" aria-hidden="true" />
        Premium only
      </motion.button>
    </>
  );
}

function RateSlider({ priceRange, setPriceRange, maxAllowedPrice }) {
  return (
    <div className="px-1">
      <div className="mb-4 flex items-center justify-between text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
        <span>Hourly rate</span>
        <span className="text-amber-400 bg-amber-500/10 px-3 py-1 rounded-md border border-amber-500/20">${priceRange[0]} - ${priceRange[1]}</span>
      </div>
      <Slider
        value={priceRange}
        onValueChange={setPriceRange}
        max={maxAllowedPrice}
        step={50}
        aria-label="Hourly rate range"
        className="w-full"
        trackClassName="bg-white/10 h-2 rounded-full overflow-hidden"
        rangeClassName="bg-gradient-to-r from-amber-500 to-rose-500 h-full"
        thumbClassName="h-6 w-6 rounded-full border-4 border-zinc-950 bg-amber-400 shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition-transform hover:scale-110"
      />
    </div>
  );
}
