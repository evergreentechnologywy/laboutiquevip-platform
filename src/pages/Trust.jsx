// @ts-nocheck
import React from "react";
import { SEO } from "@/components/SEO";

const sections = [
  {
    title: "P411 Verified",
    body: "P411 Verified means we matched this listing to a Preferred411 profile (link on the profile when available). La Boutique VIP is not affiliated with Preferred411. We do not use P411’s official logo without written permission.",
  },
  {
    title: "Review Verified",
    body: "Review Verified means we matched the listing to a profile on a review site such as The Erotic Review, PrivateDelights, or TheOtherBoard. We store links and aggregate signals only — not full review text.",
  },
  {
    title: "Evergreen Elite",
    body: "Agency roster models on our Evergreen Elite program are curated directly by La Boutique VIP. They are exempt from scrape import gates and carry a separate badge from P411/Review Verified.",
  },
  {
    title: "Premium placement",
    body: "Featured or premium placement is paid visibility only. It does not grant P411 Verified or Review Verified badges. Badges are not for sale.",
  },
];

export default function Trust() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="Trust, Verification & Safety Standards | La Boutique VIP International"
        description="Learn how P411 Verified, Review Verified, and Evergreen Elite badges work — and how premium placement differs from earned verification."
        ogTitle="Trust & Verification Standards | La Boutique VIP"
        ogDescription="P411 Verified, Review Verified, Evergreen Elite, and premium placement explained."
      />
      <section className="relative overflow-hidden border-b border-zinc-900/80 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.12),_transparent_40%),linear-gradient(180deg,#09090b_0%,#121215_100%)]">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <p className="text-xs font-semibold tracking-[0.22em] text-rose-455 uppercase font-sans">Trust standards</p>
          <h1 className="mt-4 text-4xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl leading-tight">Earned verification, not bought badges</h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-zinc-400 font-light sm:text-lg">
            Review-verified listings. P411-verified where applicable. Premium placement for vetted advertisers — badges are not for sale.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {sections.map((section) => (
            <article key={section.title} className="rounded-[32px] border border-zinc-905 bg-zinc-900/20 p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-800">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-100">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-zinc-400 font-light">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[32px] border border-zinc-900 bg-zinc-900/10 p-8 text-sm leading-7 text-zinc-400 font-light">
          <p>
            Imported catalog listings require a P411 or review-site match before they appear in public browse. External links point to third-party services and remain subject to those providers&apos; policies.
          </p>
        </div>
      </section>
    </div>
  );
}
