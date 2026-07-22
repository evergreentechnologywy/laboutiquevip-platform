// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MapPin, ChevronRight, List, LayoutGrid } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SEO } from "@/components/SEO";
import { fetchBrowseStates } from "@/api/browse";
import { US_STATES, groupStatesByRegion } from "@/lib/usStates";

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } },
};

export default function BrowseStates() {
  const [view, setView] = React.useState("regions"); // "regions" | "list"

  const { data, isLoading } = useQuery({
    queryKey: ["browse-states"],
    queryFn: fetchBrowseStates,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Graceful degrade: without the API, show the static 50-state directory
  // (counts hidden) so the page is still fully navigable.
  const hasLiveData = Array.isArray(data?.states) && data.states.length > 0;
  const states = hasLiveData ? data.states : US_STATES;
  const regionGroups = React.useMemo(() => groupStatesByRegion(states), [states]);

  const alphabetical = React.useMemo(
    () => [...states].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [states],
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="Browse All 50 States | La Boutique VIP International"
        description="Explore verified profiles across every US state, grouped by region. Pick a state to see its cities and providers."
        ogTitle="Browse States | La Boutique VIP"
        ogDescription="Verified profiles across all 50 states, grouped by region."
      />

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumb className="py-2">
          <BreadcrumbList className="text-zinc-500">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={createPageUrl("Home")} className="hover:text-amber-400 transition-colors">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-zinc-300 font-medium">All States</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-rose-500/5 to-transparent opacity-80 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-400">Directory</p>
            <h1 className="mt-3 text-3xl font-serif font-semibold tracking-tight text-white sm:text-5xl leading-[1.1]">
              Browse by{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-rose-400">state</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-zinc-400 font-light">
              {hasLiveData && data?.totalProviders != null
                ? `${data.totalProviders} provider${data.totalProviders === 1 ? "" : "s"} across ${data.totalCities ?? "—"} cities and all 50 states.`
                : "Verified profiles across all 50 states. Choose a state to explore its cities."}
            </p>
          </motion.div>

          {/* View toggle */}
          <div className="mt-8 flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1 w-fit" role="tablist" aria-label="View mode">
            {[
              { key: "regions", label: "By region", icon: LayoutGrid },
              { key: "list", label: "Full list", icon: List },
            ].map((tab) => {
              const active = view === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold tracking-wide transition-all duration-300 ${
                    active
                      ? "bg-gradient-to-r from-amber-500/25 to-rose-500/20 text-amber-200 ring-1 ring-amber-500/30"
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[1.5rem] border border-white/5 bg-white/[0.03]" />
            ))}
          </div>
        ) : view === "regions" ? (
          <div className="space-y-14">
            {regionGroups.map(({ region, states: regionStates }) => (
              <motion.div
                key={region}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5 }}
              >
                <div className="mb-6 flex items-center justify-between gap-4 border-b border-white/5 pb-4">
                  <h2 className="text-2xl font-serif font-bold text-white">{region}</h2>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                    {regionStates.length} state{regionStates.length === 1 ? "" : "s"}
                  </span>
                </div>
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {regionStates.map((state) => (
                    <motion.div key={state.slug} variants={fadeUp}>
                      <StateCard state={state} showCounts={hasLiveData} />
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {alphabetical.map((state) => (
              <motion.div key={state.slug} variants={fadeUp}>
                <StateCard state={state} showCounts={hasLiveData} compact />
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}

function StateCard({ state, showCounts, compact = false }) {
  const providerCount = Number(state.providerCount || 0);
  const cityCount = Number(state.cityCount || 0);
  return (
    <Link
      to={`/states/${state.slug}`}
      className={`group flex items-center justify-between gap-3 rounded-[1.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-md transition-all duration-300 hover:border-amber-500/30 hover:bg-white/[0.06] hover:-translate-y-0.5 ${compact ? "px-5 py-4" : "px-6 py-5"}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-rose-500/15 border border-white/10 text-amber-400 group-hover:scale-110 transition-transform duration-300">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-zinc-100 group-hover:text-amber-200 transition-colors">
            {state.name}
          </p>
          {showCounts && (
            <p className="text-xs text-zinc-500">
              {providerCount} provider{providerCount === 1 ? "" : "s"}
              {cityCount > 0 ? ` · ${cityCount} cit${cityCount === 1 ? "y" : "ies"}` : ""}
            </p>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
    </Link>
  );
}
