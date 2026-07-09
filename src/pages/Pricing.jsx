// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { adPackages, formatPackagePrice, getPackageProductSku } from "@/lib/adPackages";
import { useAuth } from "@/lib/AuthContext";
import { Check, Crown, LogIn, CreditCard } from "lucide-react";
import { SEO } from "@/components/SEO";

export default function Pricing() {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="Listing Packages & Provider Pricing | La Boutique VIP International"
        description="Choose the visibility package that fits your goals. Transparent listing plans for verified providers with premium placement options."
        ogTitle="Provider Pricing Plans | La Boutique VIP"
        ogDescription="Straightforward listing packages and premium placement options for verified providers."
      />
      <section className="relative overflow-hidden border-b border-zinc-900/80 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.12),_transparent_40%),linear-gradient(180deg,#09090b_0%,#121215_100%)]">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.22em] text-rose-400 uppercase">Provider pricing</p>
            <h1 className="mt-4 text-4xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl leading-tight">Straightforward visibility packages</h1>
            <p className="mt-5 text-base leading-7 text-zinc-400 font-light sm:text-lg">
              Choose the package that fits your visibility goals. Placement and activation depend on verification status, moderation checks, and active directory standards.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {adPackages.map((pkg) => (
            <article
              key={pkg.id}
              className={`flex flex-col rounded-[32px] border p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 ${
                pkg.premium
                  ? "border-amber-500/30 bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-100 glow-gold"
                  : "border-zinc-900 bg-zinc-900/20 text-zinc-100"
              }`}
            >
              <div className="flex items-center gap-3">
                {pkg.premium ? <Crown className="h-5 w-5 text-amber-400" /> : <div className="h-2.5 w-2.5 rounded-full bg-zinc-600" />}
                <h2 className="text-xl font-semibold tracking-tight">{pkg.label}</h2>
              </div>

              <div className="mt-5 flex items-baseline">
                <span className="text-3xl font-serif font-bold tracking-tight text-zinc-100">
                  {formatPackagePrice(pkg, "weekly").split(" ")[0]}
                </span>
                <span className="ml-1 text-xs text-zinc-400">/ weekly</span>
              </div>

              <ul className="mt-6 flex-1 space-y-3.5 text-sm leading-6 text-zinc-400">
                {pkg.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-amber-500" />
                    <span className="font-light">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {pkg.id === "none" ? (
                  <Link to={createPageUrl("ProviderSignup")}>
                    <Button className="w-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 h-11 border-0 shadow-md">
                      Get started free
                    </Button>
                  </Link>
                ) : isLoadingAuth ? (
                  <Button disabled className="w-full rounded-full h-11 border-zinc-800 bg-zinc-900 text-zinc-500 opacity-60 cursor-not-allowed">
                    <CreditCard className="mr-2 h-4 w-4 animate-pulse" /> Loading...
                  </Button>
                ) : isAuthenticated ? (
                  <Link to={`/providerdashboard?tab=ads`}>
                    <Button className="w-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 h-11 border-0 shadow-md">
                      <CreditCard className="mr-2 h-4 w-4" /> Buy Now
                    </Button>
                  </Link>
                ) : (
                  <Link to={`/register?next=${encodeURIComponent("/pricing")}`}>
                    <Button variant="outline" className="w-full rounded-full border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white h-11">
                      <LogIn className="mr-2 h-4 w-4" /> Sign in to purchase
                    </Button>
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-[32px] border border-zinc-900 bg-zinc-900/10 p-8 text-sm leading-7 text-zinc-400 shadow-xl font-light">
          <p>
            Package pricing reflects advertising visibility only. Identity checks, review publication, and public profile eligibility are handled separately through external service providers and internal moderation.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={createPageUrl("ProviderSignup")}>
              <Button className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-8 h-12 shadow-lg border-0 glow-rose">Start provider signup</Button>
            </Link>
            <Link to={createPageUrl("Trust")}>
              <Button variant="outline" className="rounded-full border-zinc-800 bg-zinc-950 px-8 h-12 text-zinc-300 hover:bg-zinc-900 hover:text-white">Read trust standards</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}