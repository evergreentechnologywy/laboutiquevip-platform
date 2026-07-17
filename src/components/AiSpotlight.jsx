// @ts-nocheck
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bot, MapPin, Search, Sparkles, Wand2 } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import AdvertisingCopilot from "@/components/AdvertisingCopilot";

const discoveryChips = [
  { label: "Miami tonight", q: "", location: "Miami" },
  { label: "Los Angeles verified", q: "", location: "Los Angeles", verified: true },
  { label: "Premium New York", q: "", location: "New York", premium: true },
  { label: "Under $500/hr", q: "", location: "", maxPrice: 500 },
];

/**
 * First-class AI entry on public pages — discovery + advertising in one surface.
 */
export function AiSpotlight({ variant = "full", onOpenCopilot }) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [intent, setIntent] = React.useState("");

  const runDiscovery = (chip) => {
    const params = new URLSearchParams();
    if (chip?.q) params.set("q", chip.q);
    if (chip?.location) params.set("location", chip.location);
    if (chip?.verified) params.set("verified", "1");
    if (chip?.premium) params.set("premium", "1");
    if (chip?.maxPrice) params.set("maxPrice", String(chip.maxPrice));
    if (!chip && intent.trim()) {
      // free text: treat as location if short, else search q
      const text = intent.trim();
      if (/^[A-Za-z\s.'-]{2,40}$/.test(text) && text.split(/\s+/).length <= 3) {
        params.set("location", text);
      } else {
        params.set("q", text);
      }
    }
    navigate(createPageUrl(`Browse?${params.toString()}`));
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={() => (onOpenCopilot ? onOpenCopilot() : setOpen(true))}
        className="group flex w-full items-center gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-transparent px-4 py-3 text-left transition hover:border-amber-400/40 hover:from-amber-500/15"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg shadow-rose-500/30">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Ask the AI Concierge</span>
          <span className="block truncate text-xs text-zinc-400">Find listings, compare cities, plan ads</span>
        </span>
        <ArrowRight className="h-4 w-4 text-zinc-500 transition group-hover:text-amber-300 group-hover:translate-x-0.5" />
      </button>
    );
  }

  return (
    <section id="ai-concierge" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/80 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(251,191,36,0.18),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(244,63,94,0.14),transparent_45%)]" />
        <div className="pointer-events-none absolute -right-16 top-10 h-64 w-64 rounded-full bg-rose-500/20 blur-[90px]" />

        <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:p-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">
              <Bot className="h-3.5 w-3.5" />
              AI Concierge
            </div>
            <h2 className="mt-5 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Search smarter.
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-rose-300 to-amber-200">
                Advertise better.
              </span>
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              Tell the concierge a city, style, or rate band — or open the full AI studio for package advice, tour planning, and profile polish.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runDiscovery()}
                  placeholder="e.g. Miami verified, or Las Vegas"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-zinc-950/70 pl-11 pr-4 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-amber-400/50"
                  aria-label="AI discovery intent"
                />
              </div>
              <Button
                onClick={() => runDiscovery()}
                className="h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600 px-6 font-semibold text-white border-0 shadow-xl shadow-rose-500/25"
              >
                <Search className="mr-2 h-4 w-4" />
                Find listings
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {discoveryChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => runDiscovery(chip)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-amber-400/30 hover:text-white"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                type="button"
                onClick={() => (onOpenCopilot ? onOpenCopilot() : setOpen((v) => !v))}
                className="h-12 rounded-full border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
                variant="outline"
              >
                <Wand2 className="mr-2 h-4 w-4 text-amber-300" />
                Open AI studio
              </Button>
              <Link
                to={createPageUrl("ProviderSignup")}
                className="text-sm font-medium text-zinc-400 underline-offset-4 hover:text-amber-300 hover:underline"
              >
                I want to advertise →
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/60 p-1 shadow-inner backdrop-blur-xl">
            {(open || variant === "embedded") && (
              <AdvertisingCopilot surface="guest" compact className="!border-0 !bg-transparent !shadow-none" />
            )}
            {!open && variant !== "embedded" && (
              <div className="flex h-full min-h-[320px] flex-col justify-between rounded-[1.75rem] bg-gradient-to-b from-white/[0.04] to-transparent p-6 sm:p-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">What AI can do</p>
                  <ul className="mt-5 space-y-4 text-sm text-zinc-300">
                    <li className="flex gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      Guide discovery by city, trust signals, and rate band
                    </li>
                    <li className="flex gap-3">
                      <Bot className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                      Coach advertisers on packages, photos, and tour cities
                    </li>
                    <li className="flex gap-3">
                      <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                      Draft practical next steps — never silent auto-publish
                    </li>
                  </ul>
                </div>
                <Button
                  onClick={() => setOpen(true)}
                  className="mt-8 h-12 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-rose-500 font-semibold text-white border-0"
                >
                  Chat with AI Concierge
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AiSpotlight;
