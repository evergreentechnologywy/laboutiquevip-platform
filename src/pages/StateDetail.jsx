// @ts-nocheck
import React from "react";
import { Link, useParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MapPin, ChevronRight, BadgeCheck, ArrowRight } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { fetchBrowseState } from "@/api/browse";
import { getStateBySlug } from "@/lib/usStates";

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } },
};

export default function StateDetail() {
  const { stateSlug } = useParams();
  const staticState = getStateBySlug(stateSlug);

  const { data, isLoading } = useQuery({
    queryKey: ["browse-state", stateSlug],
    queryFn: () => fetchBrowseState(stateSlug),
    enabled: Boolean(stateSlug),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const stateName = data?.state || staticState?.name || "";
  const cities = Array.isArray(data?.cities) ? data.cities : [];
  const providerCount = data?.providerCount != null ? Number(data.providerCount) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-rose-500/35 selection:text-white">
      <SEO
        title={stateName ? `${stateName} Providers & Cities | La Boutique VIP International` : "Browse State | La Boutique VIP International"}
        description={
          stateName
            ? `Explore verified profiles across ${stateName}. Browse cities with provider counts and direct links into the directory.`
            : "Explore verified profiles by state and city."
        }
        ogTitle={stateName ? `${stateName} | La Boutique VIP` : "Browse State | La Boutique VIP"}
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
              <BreadcrumbLink asChild>
                <Link to="/states" className="hover:text-amber-400 transition-colors">All States</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-zinc-300 font-medium">{stateName || stateSlug}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-rose-500/5 to-transparent opacity-80 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-400">
              {staticState?.region ? `${staticState.region} · ` : ""}State
            </p>
            <h1 className="mt-3 text-3xl font-serif font-semibold tracking-tight text-white sm:text-5xl leading-[1.1]">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-rose-400">
                {stateName || "Unknown state"}
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-zinc-400 font-light">
              {providerCount != null
                ? `${providerCount} provider${providerCount === 1 ? "" : "s"} across ${cities.length} cit${cities.length === 1 ? "y" : "ies"}.`
                : "Pick a city to jump into the live directory."}
            </p>
            <div className="mt-8">
              <Link to={`${createPageUrl("Browse")}?location=${encodeURIComponent(stateName)}`}>
                <Button className="h-12 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-8 text-sm font-bold text-white shadow-xl shadow-rose-500/20 border-0 hover:scale-[1.02] active:scale-95 transition-all">
                  View all {stateName} listings
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[1.5rem] border border-white/5 bg-white/[0.03]" />
            ))}
          </div>
        ) : cities.length > 0 ? (
          <>
            <div className="mb-8 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-serif font-bold text-white">Cities in {stateName}</h2>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                {cities.length} cit{cities.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {cities.map((city) => (
                <motion.div key={city.slug || city.city} variants={fadeUp}>
                  <Link
                    to={`${createPageUrl("Browse")}?location=${encodeURIComponent(city.city)}`}
                    className="group flex items-center justify-between gap-3 rounded-[1.5rem] border border-white/5 bg-white/[0.03] backdrop-blur-md px-6 py-5 transition-all duration-300 hover:border-amber-500/30 hover:bg-white/[0.06] hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-rose-500/15 border border-white/10 text-amber-400 group-hover:scale-110 transition-transform duration-300">
                        <MapPin className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-zinc-100 group-hover:text-amber-200 transition-colors">
                          {city.city}
                        </p>
                        <p className="flex items-center gap-2 text-xs text-zinc-500">
                          <span>{Number(city.providerCount || 0)} provider{Number(city.providerCount || 0) === 1 ? "" : "s"}</span>
                          {Number(city.verifiedCount || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-400/90">
                              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                              {city.verifiedCount} verified
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] backdrop-blur-2xl px-6 py-16 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
            <h2 className="relative z-10 text-2xl font-serif font-bold text-white">
              {stateName ? `Exploring ${stateName}` : "State not found"}
            </h2>
            <p className="relative z-10 mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
              {stateName
                ? "City-level counts are rolling out. Jump into the live directory to browse this state now."
                : "We couldn't find that state. Head back to the full directory to pick another."}
            </p>
            <div className="relative z-10 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {stateName && (
                <Link to={`${createPageUrl("Browse")}?location=${encodeURIComponent(stateName)}`}>
                  <Button className="h-12 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-8 text-sm font-bold text-white border-0">
                    Browse {stateName}
                  </Button>
                </Link>
              )}
              <Link to="/states">
                <Button variant="outline" className="h-12 rounded-full border-white/10 bg-white/[0.03] px-8 text-sm text-zinc-200 hover:bg-white/[0.07]">
                  All states
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </section>
    </div>
  );
}
