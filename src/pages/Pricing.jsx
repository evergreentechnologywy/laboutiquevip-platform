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
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <SEO
        title="Listing Packages & Provider Pricing | La Boutique VIP International"
        description="Choose the visibility package that fits your goals. Transparent listing plans for verified providers with premium placement options."
        ogTitle="Provider Pricing Plans | La Boutique VIP"
        ogDescription="Straightforward listing packages and premium placement options for verified providers."
      />
      <section className="border-b border-stone-200/80 bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.08),_transparent_45%),linear-gradient(180deg,#fafaf9_0%,#f7f4ef_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">Provider pricing</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Straightforward listing packages</h1>
            <p className="mt-5 text-base leading-7 text-stone-600 sm:text-lg">
              Choose the package that fits your visibility goals. Placement and activation still depend on verification status, moderation, and the current payments rollout.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {adPackages.map((pkg) => (
            <article key={pkg.id} className={`flex flex-col rounded-[28px] border p-8 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.18)] ${pkg.premium ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-200 bg-white text-stone-900"}`}>
              <div className="flex items-center gap-3">
                {pkg.premium ? <Crown className="h-5 w-5 text-amber-300" /> : <div className="h-2.5 w-2.5 rounded-full bg-stone-400" />}
                <h2 className="text-xl font-semibold">{pkg.label}</h2>
              </div>
              <p className={`mt-4 text-sm ${pkg.premium ? "text-stone-300" : "text-stone-500"}`}>{formatPackagePrice(pkg, "weekly")}</p>
              <ul className={`mt-6 flex-1 space-y-3 text-sm leading-6 ${pkg.premium ? "text-stone-200" : "text-stone-600"}`}>
                {pkg.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-1 h-4 w-4 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {pkg.id === "none" ? (
                  <Link to={createPageUrl("ProviderSignup")}>
                    <Button className={`w-full rounded-full px-6 ${pkg.premium ? "bg-white text-stone-900 hover:bg-stone-200" : "bg-stone-900 text-stone-50 hover:bg-stone-800"}`}>
                      Get started free
                    </Button>
                  </Link>
                ) : isLoadingAuth ? (
                  <Button disabled className="w-full rounded-full px-6 opacity-60 cursor-not-allowed">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Loading...
                  </Button>
                ) : isAuthenticated ? (
                  <Link to={`/providerdashboard?tab=ads`}>
                    <Button className={`w-full rounded-full px-6 ${pkg.premium ? "bg-white text-stone-900 hover:bg-stone-200" : "bg-stone-900 text-stone-50 hover:bg-stone-800"}`}>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Buy Now — {formatPackagePrice(pkg, "weekly")}
                    </Button>
                  </Link>
                ) : (
                  <Link to={`/login?next=${encodeURIComponent("/pricing")}`}>
                    <Button variant="outline" className="w-full rounded-full border-stone-300 bg-white px-6 text-stone-700 hover:bg-stone-50">
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign in to purchase
                    </Button>
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-[28px] border border-stone-200 bg-white p-8 text-sm leading-7 text-stone-600 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.18)]">
          <p>
            Package pricing reflects advertising visibility only. Identity checks, review publication, and public profile eligibility are handled separately through external service providers and internal moderation.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={createPageUrl("ProviderSignup")}>
              <Button className="rounded-full bg-stone-900 px-6 text-stone-50 hover:bg-stone-800">Start provider signup</Button>
            </Link>
            <Link to={createPageUrl("Trust")}>
              <Button variant="outline" className="rounded-full border-stone-300 bg-white px-6 text-stone-700 hover:bg-stone-50">Read trust standards</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
