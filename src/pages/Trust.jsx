// @ts-nocheck
import React from "react";
import { SEO } from "@/components/SEO";

const content = {
  p411: "P411 Verified means we matched this listing to a Preferred411 profile (link on the profile when available). La Boutique VIP is not affiliated with Preferred411. We do not use P411’s official logo without written permission.",
  review: "Review Verified means we matched the listing to a profile on a review site such as The Erotic Review, PrivateDelights, or TheOtherBoard. We store links and aggregate signals only — not full review text.",
  premium: "Featured or premium placement is paid visibility only. It does not grant P411 Verified or Review Verified badges. Badges are not for sale."
};

export default function Trust() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="Trust, Verification & Safety Standards | La Boutique VIP International"
        description="Learn how P411 Verified and Review Verified badges work — and how premium placement differs from earned verification."
        ogTitle="Trust & Verification Standards | La Boutique VIP"
        ogDescription="P411 Verified, Review Verified, and premium placement explained."
      />
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes gradient-border {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes flow-down {
          0% { top: -20px; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-gradient-border {
          background-size: 200% 200%;
          animation: gradient-border 4s ease infinite;
        }
        .animate-flow {
          animation: flow-down 2.5s infinite ease-in-out;
        }
      `}} />

      <section className="relative overflow-hidden border-b border-zinc-900/80 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.12),_transparent_40%),linear-gradient(180deg,#09090b_0%,#121215_100%)]">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <p className="text-xs font-semibold tracking-[0.22em] text-rose-455 uppercase font-sans">Trust standards</p>
          <h1 className="mt-4 text-4xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl leading-tight">Earned verification, not bought badges</h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-zinc-400 font-light sm:text-lg">
            Review-verified listings. P411-verified where applicable. Premium placement for vetted advertisers — badges are not for sale.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20 lg:px-8 relative z-10">
        
        {/* Tier 1: P411 Verified (Hero Card) */}
        <div className="group relative rounded-[32px] p-[2px] overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1">
          {/* Animated gradient border */}
          <div className="absolute inset-0 animate-gradient-border bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600 opacity-70 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Card Content Wrapper */}
          <div className="relative h-full rounded-[30px] bg-zinc-950/95 backdrop-blur-xl p-10 md:p-16 flex flex-col items-center text-center shadow-[inset_0_0_80px_rgba(245,158,11,0.05)] group-hover:shadow-[inset_0_0_120px_rgba(245,158,11,0.1)] transition-all duration-500">
            
            {/* Dot Pattern Background */}
            <div className="absolute inset-0 rounded-[30px] bg-[radial-gradient(circle_at_center,_rgba(251,191,36,0.15)_1px,_transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-500" />
            
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center px-4 py-1.5 mb-6 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-semibold tracking-widest uppercase">
                Top Tier
              </div>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-6 drop-shadow-sm">
                P411 Verified
              </h2>
              <p className="text-zinc-300 text-base md:text-lg font-light leading-relaxed max-w-3xl mx-auto">
                {content.p411}
              </p>
            </div>
          </div>
          
          {/* Outer glow */}
          <div className="absolute -inset-4 bg-amber-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-700 pointer-events-none z-[-1]" />
        </div>

        {/* Hierarchy Indicator */}
        <div className="flex flex-col items-center justify-center h-24 md:h-32 relative">
          <div className="w-[2px] h-full bg-gradient-to-b from-amber-500/50 via-emerald-500/30 to-rose-500/30 relative overflow-hidden rounded-full">
            <div className="absolute left-0 w-full h-12 bg-white/80 animate-flow shadow-[0_0_12px_rgba(255,255,255,0.9)] rounded-full" />
          </div>
        </div>

        {/* Lower Tiers: Review & Premium */}
        <div className="grid gap-8 md:grid-cols-2 relative">
          
          {/* Tier 2: Review Verified */}
          <div className="group relative rounded-[28px] p-[2px] overflow-hidden transition-all duration-500 hover:scale-[1.03] hover:-translate-y-1">
            <div className="absolute inset-0 animate-gradient-border bg-gradient-to-r from-emerald-600 via-teal-400 to-emerald-600 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative h-full rounded-[26px] bg-zinc-950/95 backdrop-blur-xl p-8 md:p-10 shadow-[inset_0_0_60px_rgba(16,185,129,0.05)] group-hover:shadow-[inset_0_0_80px_rgba(16,185,129,0.1)] transition-all duration-500 flex flex-col justify-start">
              
              <div className="absolute inset-0 rounded-[26px] bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.15)_1px,_transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-30 group-hover:opacity-70 transition-opacity duration-500" />
              
              <div className="relative z-10">
                <h3 className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-emerald-500 mb-5">
                  Review Verified
                </h3>
                <p className="text-zinc-400 text-sm md:text-base font-light leading-relaxed">
                  {content.review}
                </p>
              </div>
            </div>

            <div className="absolute -inset-4 bg-emerald-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none z-[-1]" />
          </div>

          {/* Tier 3: Premium placement */}
          <div className="group relative rounded-[28px] p-[2px] overflow-hidden transition-all duration-500 hover:scale-[1.03] hover:-translate-y-1">
            <div className="absolute inset-0 animate-gradient-border bg-gradient-to-r from-rose-600 via-pink-400 to-rose-600 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative h-full rounded-[26px] bg-zinc-950/95 backdrop-blur-xl p-8 md:p-10 shadow-[inset_0_0_60px_rgba(244,63,94,0.05)] group-hover:shadow-[inset_0_0_80px_rgba(244,63,94,0.1)] transition-all duration-500 flex flex-col justify-start">
              
              <div className="absolute inset-0 rounded-[26px] bg-[radial-gradient(circle_at_center,_rgba(244,63,94,0.15)_1px,_transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-30 group-hover:opacity-70 transition-opacity duration-500" />
              
              <div className="relative z-10">
                <h3 className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-200 to-rose-500 mb-5">
                  Premium Placement
                </h3>
                <p className="text-zinc-400 text-sm md:text-base font-light leading-relaxed">
                  {content.premium}
                </p>
              </div>
            </div>

            <div className="absolute -inset-4 bg-rose-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none z-[-1]" />
          </div>

        </div>

      </section>
    </div>
  );
}
