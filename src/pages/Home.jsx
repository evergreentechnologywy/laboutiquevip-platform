// @ts-nocheck
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Star, Shield, Crown, ArrowRight, BadgeCheck, Gem, MessageCircleMore, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { searchProviders } from "@/api/providerSearch";
import { ProviderListingCard } from "@/components/ProviderListingCard";
import { SEO } from "@/components/SEO";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import { motion, AnimatePresence } from "framer-motion";
import { dedupeProvidersForDisplay } from "@/lib/providerPresentation";

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
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

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
      const withPhotos = dedupeProvidersForDisplay(
        (data.items || []).filter(p => p.photos && p.photos.length > 0),
      );
      if (withPhotos.length >= 3) return withPhotos;
      const fallback = await searchProviders({ limit: 12, sort: "newest" });
      return dedupeProvidersForDisplay(
        (fallback.items || []).filter(p => p.photos && p.photos.length > 0),
      );
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
      <section className="relative overflow-hidden border-b border-white/5 bg-zinc-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-rose-500/5 to-transparent opacity-80 pointer-events-none" />
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-rose-500/15 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-28 sm:py-40 lg:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold tracking-[0.25em] text-zinc-300 uppercase shadow-xl backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Curated listings
              </span>
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 30 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="mt-8 text-5xl font-serif font-bold tracking-tight text-white sm:text-7xl lg:text-[5rem] leading-[1.1]"
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
              className="mx-auto mt-8 max-w-2xl text-lg sm:text-xl leading-relaxed text-zinc-400 font-light"
            >
              Browse polished listings, transparent rates, and direct enquiry options in a trusted premium environment.
            </motion.p>

            {/* Spotlight Search */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
              className="mx-auto mt-14 max-w-4xl rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/10 p-4 shadow-2xl relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-rose-500/10 rounded-[2.5rem] blur-xl opacity-50 -z-10" />
              
              <div className="grid gap-3 md:grid-cols-[1.4fr_1.1fr_auto]">
                <div className="relative group">
                  <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-400 transition-colors" aria-hidden="true" />
                  <Input
                    placeholder="Search by name or service..."
                    aria-label="Search by name or service"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    className="h-16 rounded-[1.5rem] border-transparent bg-white/5 pl-14 text-lg text-white placeholder:text-zinc-500 focus:border-amber-500/50 focus:bg-white/10 transition-all duration-300"
                  />
                </div>
                <div className="relative group">
                  <MapPin className="absolute left-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-400 transition-colors" aria-hidden="true" />
                  <CityAutocomplete
                    value={locationQuery}
                    onChange={setLocationQuery}
                    onEnter={handleSearch}
                    className="h-16 w-full rounded-[1.5rem] border-transparent bg-white/5 pl-14 pr-4 text-lg text-white placeholder:text-zinc-500 focus:border-amber-500/50 focus:bg-white/10 focus:outline-none transition-all duration-300"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  className="h-16 rounded-[1.5rem] bg-gradient-to-r from-amber-500 to-rose-500 px-10 text-lg font-bold text-white shadow-xl shadow-rose-500/20 border-0 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Explore
                </Button>
              </div>
            </motion.div>

            <motion.p 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              transition={{ delay: 0.8, duration: 1 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-zinc-500 font-bold uppercase tracking-[0.25em]"
            >
              <span>Adults only</span>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              <span>Trusted presentation</span>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              <span>Clear profiles</span>
            </motion.p>
          </div>
        </div>
      </section>

      {/* Trust Items Banner */}
      <section className="border-b border-white/5 bg-zinc-950 relative z-20">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <motion.div 
            variants={staggerContainer} 
            initial="hidden" 
            whileInView="show" 
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {trustItems.map((item) => (
              <motion.div key={item.label} variants={fadeUp} className="group flex items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md px-6 py-5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300">
                <item.icon className="h-5 w-5 text-rose-400 group-hover:text-amber-400 group-hover:scale-110 transition-all" />
                <span className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">{item.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Featured Selection */}
      <section className="relative mx-auto max-w-7xl px-6 py-28 lg:px-8">
        <div className="mb-16 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-400">Featured selection</p>
            <h2 className="mt-4 text-4xl font-serif font-bold tracking-tight text-white sm:text-5xl">Verified Profiles</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-400 font-light">
              Explore curated listings presented with clarity, trust, and premium discretion.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <Link to={createPageUrl("Browse")}>
              <Button variant="outline" className="h-14 rounded-full border-white/10 bg-white/5 backdrop-blur-md px-8 text-white font-bold tracking-wide hover:bg-white/10 hover:border-white/20 transition-all duration-300">
                Browse all profiles
                <ArrowRight className="ml-3 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>

        {featuredProviders.length >= 3 ? (
          <motion.div 
            variants={staggerContainer} 
            initial="hidden" 
            whileInView="show" 
            viewport={{ once: true }}
            className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
          >
            {featuredProviders.slice(0, 6).map((provider) => (
              <motion.div key={provider.id} variants={fadeUp}>
                <ProviderListingCard provider={provider} />
              </motion.div>
            ))}
          </motion.div>
        ) : !isLoadingFeatured && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            whileInView={{ opacity: 1, scale: 1 }} 
            viewport={{ once: true }}
            className="rounded-[3rem] border border-white/5 bg-white/[0.02] backdrop-blur-2xl p-20 text-center shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
            <h2 className="text-3xl font-serif font-bold tracking-tight text-white">Curating exceptional profiles</h2>
            <p className="mt-4 text-lg leading-relaxed text-zinc-400 font-light max-w-xl mx-auto">
              Check back soon for new featured listings. 
            </p>
            <div className="mt-10 flex justify-center">
              <Link to={createPageUrl("Browse")}>
                <Button className="rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-10 h-14 text-white font-bold shadow-xl shadow-rose-500/20 border-0">
                  Explore Directory
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </section>

      {/* Why Section */}
      <section className="relative border-y border-white/5 bg-zinc-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] to-transparent pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-28 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-center"
          >
            <h2 className="text-4xl font-serif font-bold tracking-tight text-white sm:text-5xl">Why La Boutique VIP</h2>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 font-light">
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
                  <p className="mt-4 text-base leading-relaxed text-zinc-400 font-light group-hover:text-zinc-300 transition-colors">{item.body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Provider CTA */}
      <section className="mx-auto max-w-7xl px-6 py-32 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          whileInView={{ opacity: 1, scale: 1 }} 
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="rounded-[3rem] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-16 sm:p-24 text-center max-w-5xl mx-auto relative overflow-hidden shadow-2xl border border-white/10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-500/15 via-rose-500/5 to-transparent pointer-events-none z-0"></div>
          <div className="relative z-10">
            <h2 className="text-4xl font-serif font-bold tracking-tight text-white sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-rose-400">
              Are you a provider?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl leading-relaxed text-zinc-300 font-light">
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
