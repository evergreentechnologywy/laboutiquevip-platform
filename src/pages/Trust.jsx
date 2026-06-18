// @ts-nocheck
import React from "react";
import { SEO } from "@/components/SEO";

const sections = [
  {
    title: "Verification",
    body: "Verified badges are shown only after identity checks complete through external service providers and the listing is approved for public display.",
  },
  {
    title: "Reviews",
    body: "Reviews are reviewed before publication. Approval checks focus on authenticity, relevance, and policy compliance, and some listings may have limited or no live reviews while the process matures.",
  },
  {
    title: "Profile details",
    body: "Rates, contact methods, availability, and linked external accounts are advertiser-supplied details. They can change after publication and should be confirmed directly with the provider.",
  },
];

export default function Trust() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <SEO
        title="Trust, Verification & Safety Standards | La Boutique VIP International"
        description="Learn how we handle trust signals, provider verification, and moderated reviews to maintain a transparent and discreet premium environment."
        ogTitle="Trust & Verification Standards | La Boutique VIP"
        ogDescription="How trust signals, verification, and reviews are handled on our platform."
      />
      <section className="relative overflow-hidden border-b border-zinc-900/80 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.12),_transparent_40%),linear-gradient(180deg,#09090b_0%,#121215_100%)]">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <p className="text-xs font-semibold tracking-[0.22em] text-rose-455 uppercase font-sans">Trust standards</p>
          <h1 className="mt-4 text-4xl font-serif font-bold tracking-tight text-zinc-100 sm:text-5xl leading-tight">Trust signals on La Boutique VIP</h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-zinc-400 font-light sm:text-lg">
            Public trust signals are intentionally conservative. Verification and review workflows rely on third-party providers plus internal moderation before anything is shown publicly.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 lg:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          {sections.map((section) => (
            <article key={section.title} className="rounded-[32px] border border-zinc-905 bg-zinc-900/20 p-8 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-800">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-100">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-zinc-400 font-light">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[32px] border border-zinc-900 bg-zinc-900/10 p-8 text-sm leading-7 text-zinc-450 font-light">
          <p>
            External verification and review account links shown on advertiser profiles are provided for reference. They point to third-party services and remain subject to those providers' availability, moderation, and account policies.
          </p>
        </div>
      </section>
    </div>
  );
}
