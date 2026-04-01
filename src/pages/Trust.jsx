// @ts-nocheck
import React from "react";

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
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <section className="border-b border-stone-200/80 bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.08),_transparent_45%),linear-gradient(180deg,#fafaf9_0%,#f7f4ef_100%)]">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">Trust standards</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">How trust signals are handled on La Boutique VIP</h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg">
            Public trust signals are intentionally conservative. Verification and review workflows rely on third-party providers plus internal moderation before anything is shown publicly.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          {sections.map((section) => (
            <article key={section.title} className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-[0_24px_80px_-36px_rgba(28,25,23,0.18)]">
              <h2 className="text-xl font-semibold text-stone-900">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-stone-600">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[28px] border border-stone-200 bg-stone-100/70 p-8 text-sm leading-7 text-stone-600">
          <p>
            External verification and review account links shown on advertiser profiles are provided for reference. They point to third-party services and remain subject to those providers' availability, moderation, and account policies.
          </p>
        </div>
      </section>
    </div>
  );
}
