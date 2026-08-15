// @ts-nocheck
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  MapPin,
  Star,
  Shield,
  Crown,
  ArrowRight,
  BadgeCheck,
  Gem,
  MessageCircleMore,
  Sparkles,
  Phone,
  User,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { searchProviders } from "@/api/providerSearch";
import { fetchSiteStats, fetchBrowseStates } from "@/api/browse";
import { ProviderListingCard } from "@/components/ProviderListingCard";
import { SEO } from "@/components/SEO";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import { motion } from "framer-motion";
import { dedupeProvidersForDisplay } from "@/lib/providerPresentation";
import { AiSpotlight } from "@/components/AiSpotlight";
import { groupStatesByRegion, US_STATES } from "@/lib/usStates";

const SEARCH_TABS = [
  { key: "name", label: "Name", icon: User, placeholder: "Search by name or service..." },
  { key: "phone", label: "Phone", icon: Phone, placeholder: "Search by phone number..." },
  { key: "location", label: "Location", icon: MapPin, placeholder: "City or state..." },
];

const FALLBACK_TOP_CITIES = [
  { city: "New York", state: "NY", providerCount: null },
  { city: "Miami", state: "FL", providerCount: null },
  { city: "Los Angeles", state: "CA", providerCount: null },
  { city: "Las Vegas", state: "NV", providerCount: null },
  { city: "Chicago", state: "IL", providerCount: null },
  { city: "Houston", state: "TX", providerCount: null },
  { city: "Atlanta", state: "GA", providerCount: null },
  { city: "Dallas", state: "TX", providerCount: null },
];

const trustItems = [
  { label: "Verified Profiles", icon: BadgeCheck },
  { label: "Transparent Rates", icon: Gem },
  { label: "Discreet Contact", icon: MessageCircleMore },
  { label: "Approved Reviews", icon: Star },
];

const whyItems = [
  {
    title: "Verified Authenticity",
    body: "Verification status is shown after checks handled through external identity providers and internal moderation.",
    icon: Shield,
  },
  {
    title: "Curated Premium",
    body: "Discover listings designed to feel polished, transparent, and effortlessly easy to explore.",
    icon: Crown,
  },
  {
    title: "Trust-led Discovery",
    body: "Clear profile information and approved feedback help support more confident browsing as live data matures.",
    icon: Star,
  },
];

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

function formatStat(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k+` : `${n}+`;
}

export default function Home() {
  const navigate = useNavigate();
  const [searchMode, setSearchMode] = React.useState("name");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [locationQuery, setLocationQuery] = React.useState("");

  const { data: siteStats } = useQuery({
    queryKey: ["site-stats"],
    queryFn: fetchSiteStats,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: browseData } = useQuery({
    queryKey: ["browse-states"],
    queryFn: fetchBrowseStates,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: featuredProviders = [], isLoading: isLoadingFeatured } = useQuery({
    queryKey: ["featured-providers"],
    queryFn: async () => {
      const data = await searchProviders({
        premium: true,
        verified: true,
        limit: 12,
      });
      const withPhotos = dedupeProvidersForDisplay(
        (data.items || []).filter((p) => p.photos && p.photos.length > 0),
      );
      if (withPhotos.length >= 3) return withPhotos;
      const fallback = await searchProviders({ limit: 12, sort: "newest" });
      return dedupeProvidersForDisplay(
        (fallback.items || []).filter((p) => p.photos && p.photos.length > 0),
      );
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Live top cities from /api/v1/stats; curated fallback until counts land.
  const topCities = React.useMemo(() => {
    const live = Array.isArray(siteStats?.topCities) ? siteStats.topCities : [];
    if (live.length >= 4) {
      return live.slice(0, 8).map((row) => ({
        city: row.city,
        state: row.state,
        slug: row.slug,
        providerCount: row.providerCount ?? null,
      }));
    }
    return FALLBACK_TOP_CITIES;
  }, [siteStats]);

  const regionTeaser = React.useMemo(() => {
    // browse/states returns { regions:[{region,states:[{name,slug,code,providerCount}]}] }
    const liveStates = Array.isArray(browseData?.regions)
      ? browseData.regions.flatMap((region) =>
          (region.states || []).map((state) => ({
            name: state.name,
            slug: state.slug,
            abbrev: state.code,
            providerCount: state.providerCount,
          })),
        )
      : Array.isArray(browseData?.states)
        ? browseData.states
        : null;
    const grouped = groupStatesByRegion(liveStates || US_STATES);
    return grouped.map(({ region, states: regionStates }) => ({
      region,
      stateCount: regionStates.length,
      providerCount: regionStates.reduce((sum, s) => sum + Number(s.providerCount || 0), 0),
      hasLiveCounts: regionStates.some((s) => Number(s.providerCount) > 0),
    }));
  }, [browseData]);

  const statsBar = React.useMemo(() => {
    const providers = formatStat(
      siteStats?.providers ?? browseData?.totals?.providers ?? browseData?.totalProviders,
    );
    const cities = formatStat(
      siteStats?.cities ?? browseData?.totals?.cities ?? browseData?.totalCities,
    );
    const photos = formatStat(siteStats?.photos);
    const states = formatStat(siteStats?.states ?? browseData?.totals?.states) || "50";
    return [
      { label: "Providers", value: providers },
      { label: "States", value: states },
      { label: "Cities", value: cities },
      { label: "Photos", value: photos },
    ].filter((s) => s.value);
  }, [siteStats, browseData]);

  const activeTab = SEARCH_TABS.find((t) => t.key === searchMode) || SEARCH_TABS[0];

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchMode === "location") {
      if (locationQuery.trim()) params.set("location", locationQuery.trim());
    } else if (searchQuery.trim()) {
      // Name and phone both flow through the directory's full-text query —
      // the search API matches display names and phone digits.
      params.set("q", searchQuery.trim());
    }
    const qs = params.toString();
    navigate(createPageUrl(qs ? `Browse?${qs}` : "Browse"));
  };

  const switchTab = (key) => {
    setSearchMode(key);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-rose-500/35 selection:text-white pb-20 md:pb-0">
      <SEO
        title="La Boutique VIP International | Curated, Discreet Directory of Verified Profiles"
        description="Discover verified profiles with discretion and clarity. Browse polished listings, transparent rates, and direct enquiry options in a trusted premium environment."
        ogTitle="La Boutique VIP International"
        ogDescription="Curated, Discreet Directory of Verified Profiles"
        ogUrl="https://www.laboutiquevip.net"
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-rose-500/5 to-transparent opacity-80 pointer-events-none" />
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-rose-500/15 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-5xl text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold tracking-[0.25em] text-zinc-300 uppercase shadow-xl backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Curated · Verified · Discreet
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="mt-7 text-4xl font-serif font-semibold tracking-tight text-white sm:mt-8 sm:text-6xl lg:text-[4.75rem] leading-[1.08]"
            >
              Discover verified profiles with <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-rose-300 to-amber-200 bg-[length:200%_auto] animate-gradient">
                discretion & clarity
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="mx-auto mt-8 max-w-2xl text-lg sm:text-xl leading-relaxed text-zinc-300 font-normal"
            >
              Browse polished listings, transparent rates, and direct enquiry options in a trusted premium environment.
            </motion.p>

            {/* Tabbed Search */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
              className="mx-auto mt-14 max-w-3xl rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/10 p-4 sm:p-5 shadow-2xl relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-rose-500/10 rounded-[2rem] blur-xl opacity-50 -z-10" />

              {/* Tabs */}
              <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1 w-fit mx-auto" role="tablist" aria-label="Search mode">
                {SEARCH_TABS.map((tab) => {
                  const active = tab.key === searchMode;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => switchTab(tab.key)}
                      className={`inline-flex items-center gap-2 rounded-full px-4 sm:px-5 py-2 text-[13px] font-semibold tracking-wide transition-all duration-300 ${
                        active
                          ? "bg-gradient-to-r from-amber-500/25 to-rose-500/20 text-amber-200 ring-1 ring-amber-500/30 shadow-inner"
                          : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Input row */}
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="relative group">
                  <activeTab.icon
                    className="absolute left-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-400 transition-colors"
                    aria-hidden="true"
                  />
                  {searchMode === "location" ? (
                    <CityAutocomplete
                      value={locationQuery}
                      onChange={setLocationQuery}
                      onEnter={handleSearch}
                      className="h-14 md:h-16 w-full rounded-[1.5rem] border-transparent bg-white/5 pl-14 pr-4 text-base md:text-lg text-white placeholder:text-zinc-500 focus:border-amber-500/50 focus:bg-white/10 focus:outline-none transition-all duration-300"
                    />
                  ) : (
                    <Input
                      placeholder={activeTab.placeholder}
                      aria-label={activeTab.placeholder}
                      inputMode={searchMode === "phone" ? "tel" : "text"}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="h-14 md:h-16 rounded-[1.5rem] border-transparent bg-white/5 pl-14 text-base md:text-lg text-white placeholder:text-zinc-500 focus:border-amber-500/50 focus:bg-white/10 transition-all duration-300"
                    />
                  )}
                </div>
                <Button
                  onClick={handleSearch}
                  className="h-14 md:h-16 w-full sm:w-auto rounded-[1.5rem] bg-gradient-to-r from-amber-500 to-rose-500 px-10 text-base md:text-lg font-bold text-white shadow-xl shadow-rose-500/20 border-0 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <Search className="mr-2 h-5 w-5" aria-hidden="true" />
                  Search
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="mt-8 flex flex-col items-center gap-5"
            >
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link to="/states">
                  <Button variant="outline" className="h-12 rounded-full border-white/10 bg-white/[0.03] px-6 text-sm font-semibold text-zinc-200 hover:bg-white/[0.07] hover:text-white">
                    Browse by state
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to={createPageUrl("Trust")} className="text-sm font-medium text-zinc-500 underline-offset-4 hover:text-amber-300 hover:underline">
                  How trust works
                </Link>
              </div>
              <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                <span>Adults only</span>
                <span className="h-1 w-1 rounded-full bg-zinc-700" />
                <span>Discreet</span>
                <span className="h-1 w-1 rounded-full bg-zinc-700" />
                <span>Clear profiles</span>
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-zinc-950/90 backdrop-blur-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button onClick={handleSearch} className="lbv-cta h-12 w-full border-0">
          <Search className="mr-2 h-4 w-4" />
          Search profiles
        </Button>
      </div>

      {/* Stats Bar */}
      {statsBar.length > 0 && (
        <section className="border-b border-white/5 bg-zinc-950 relative z-20">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-50px" }}
              className={`grid gap-4 ${statsBar.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`}
            >
              {statsBar.map((stat) => (
                <motion.div key={stat.label} variants={fadeUp} className="text-center rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-md px-4 py-6">
                  <p className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-rose-300">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-500">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* Top Cities */}
      <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-400">Top cities</p>
            <h2 className="mt-3 text-3xl font-serif font-bold tracking-tight text-white sm:text-4xl">Where to explore first</h2>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <Link to="/states" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-amber-300 transition-colors">
              All 50 states
              <ChevronRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {topCities.map((item) => (
            <motion.div key={`${item.city}-${item.state}`} variants={fadeUp}>
              <Link
                to={`${createPageUrl("Browse")}?location=${encodeURIComponent(item.city)}`}
                className="group flex items-center justify-between gap-3 rounded-[1.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-md px-5 py-5 transition-all duration-300 hover:border-amber-500/30 hover:bg-white/[0.06] hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-rose-500/15 border border-white/10 text-amber-400 group-hover:scale-110 transition-transform duration-300">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm sm:text-base font-semibold text-zinc-100 group-hover:text-amber-200 transition-colors">
                      {item.city}{item.state ? <span className="text-zinc-500 font-normal">, {item.state}</span> : null}
                    </p>
                    {item.providerCount != null && (
                      <p className="text-xs text-zinc-500">{item.providerCount} provider{item.providerCount === 1 ? "" : "s"}</p>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Trust Items Banner */}
      <section className="border-y border-white/5 bg-zinc-950 relative z-20">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {trustItems.map((item) => (
              <motion.div key={item.label} variants={fadeUp} className="group flex items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.04] backdrop-blur-md px-5 py-5 hover:bg-white/[0.07] hover:border-white/10 transition-all duration-300">
                <item.icon className="h-5 w-5 text-rose-400 group-hover:text-amber-400 group-hover:scale-110 transition-all" />
                <span className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">{item.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Featured Selection */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <div className="mb-16 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-400">Featured selection</p>
            <h2 className="mt-4 text-4xl font-serif font-bold tracking-tight text-white sm:text-5xl">Verified Profiles</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-300 font-normal">
              Explore curated listings presented with clarity, trust, and premium discretion.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <Link to={createPageUrl("Browse")}>
              <Button variant="outline" className="h-12 rounded-full border-white/10 bg-white/5 backdrop-blur-md px-7 text-sm text-white font-semibold tracking-wide hover:bg-white/10 hover:border-white/20 transition-all duration-300">
                Browse all profiles
                <ArrowRight className="ml-3 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>

        {isLoadingFeatured ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-[2rem] border border-white/5 bg-zinc-900/40">
                <div className="aspect-[4/5] animate-pulse bg-zinc-800/60" />
                <div className="space-y-3 p-6">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-800/80" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-800/50" />
                </div>
              </div>
            ))}
          </div>
        ) : featuredProviders.length >= 3 ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8"
          >
            {featuredProviders.slice(0, 9).map((provider) => (
              <motion.div key={provider.id} variants={fadeUp}>
                <ProviderListingCard provider={provider} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="rounded-[3rem] border border-white/5 bg-white/[0.02] backdrop-blur-2xl p-20 text-center shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
            <h2 className="text-3xl font-serif font-bold tracking-tight text-white">Curating exceptional profiles</h2>
            <p className="mt-4 text-lg leading-relaxed text-zinc-300 font-normal max-w-xl mx-auto">
              Check back soon for new featured listings.
            </p>
            <div className="mt-10 flex justify-center">
              <Link to={createPageUrl("Browse")}>
                <Button className="lbv-cta h-12 border-0">
                  Explore Directory
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </section>

      <AiSpotlight />

      {/* Browse by Region */}
      <section className="relative border-y border-white/5 bg-zinc-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] to-transparent pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-center"
          >
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-400">Nationwide coverage</p>
            <h2 className="mt-4 text-4xl font-serif font-bold tracking-tight text-white sm:text-5xl">Browse by region</h2>
            <p className="mt-6 text-lg leading-relaxed text-zinc-300 font-normal">
              Every state, organized the way you travel. Pick a region to explore its states and cities.
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-5"
          >
            {regionTeaser.map((region) => (
              <motion.div key={region.region} variants={fadeUp}>
                <Link
                  to="/states"
                  className="group flex h-full flex-col rounded-[2rem] border border-white/5 bg-white/[0.02] backdrop-blur-2xl p-7 transition-all duration-500 hover:border-amber-500/30 hover:bg-white/[0.05] hover:-translate-y-1"
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-rose-400 transition-all duration-500 group-hover:scale-110 group-hover:bg-rose-500/10 group-hover:text-amber-400">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-xl font-serif font-bold text-white group-hover:text-amber-200 transition-colors">{region.region}</h3>
                  <p className="mt-2 text-sm text-zinc-500">
                    {region.stateCount} state{region.stateCount === 1 ? "" : "s"}
                    {region.hasLiveCounts && region.providerCount > 0
                      ? ` · ${region.providerCount} provider${region.providerCount === 1 ? "" : "s"}`
                      : ""}
                  </p>
                  <span className="mt-auto pt-6 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600 group-hover:text-amber-400 transition-colors">
                    Explore
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why Section */}
      <section className="relative bg-zinc-950 overflow-hidden">
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-center"
          >
            <h2 className="text-4xl font-serif font-bold tracking-tight text-white sm:text-5xl">Why La Boutique VIP</h2>
            <p className="mt-6 text-lg leading-relaxed text-zinc-300 font-normal">
              A more refined way to discover trusted profiles with clarity, discretion, and premium presentation.
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mt-20 grid gap-8 lg:grid-cols-3"
          >
            {whyItems.map((item) => (
              <motion.div key={item.title} variants={fadeUp} className="group relative rounded-[2.5rem] border border-white/5 bg-white/[0.02] backdrop-blur-2xl p-10 hover:bg-white/[0.04] transition-all duration-500">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[2.5rem]" />
                <div className="relative z-10">
                  <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-white shadow-xl transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-rose-500/10">
                    <item.icon className="h-8 w-8 text-rose-400 group-hover:text-amber-400 transition-colors" />
                  </div>
                  <h3 className="text-2xl font-serif font-bold text-white group-hover:text-amber-300 transition-colors">{item.title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-zinc-300 font-normal">{item.body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Provider CTA */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="rounded-[3rem] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-16 sm:p-24 text-center max-w-5xl mx-auto relative overflow-hidden shadow-2xl border border-white/10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-500/15 via-rose-500/5 to-transparent pointer-events-none z-0"></div>
          <div className="relative z-10">
            <h2 className="text-4xl font-serif font-bold tracking-tight sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-rose-400">
              Are you a provider?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl leading-relaxed text-zinc-300 font-normal">
              Join La Boutique VIP International and present your profile in a more polished, trusted, and premium environment.
            </p>
            <Button
              onClick={() => navigate(createPageUrl("ProviderSignup"))}
              className="mt-12 h-16 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-14 text-lg font-bold text-white shadow-2xl shadow-rose-500/30 border-0 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Get Started
            </Button>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
