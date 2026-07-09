import React from "react";
import { Link } from "react-router-dom";
import { Crown, ShieldCheck, MapPin, Smartphone } from "lucide-react";
import { createPageUrl } from "@/utils";
import {
  bookingAffiliateUrl,
  nordVpnAffiliateUrl,
  textVerifiedAffiliateUrl,
} from "@/lib/affiliateLinks";

const hubCities = [
  ["Miami", "FL"], ["New York", "NY"], ["Los Angeles", "CA"],
  ["Las Vegas", "NV"], ["Chicago", "IL"], ["Houston", "TX"],
  ["Atlanta", "GA"], ["Dallas", "TX"], ["Phoenix", "AZ"],
  ["Orlando", "FL"], ["San Francisco", "CA"], ["Seattle", "WA"],
];

export function Footer() {
  const currentYear = new Date().getFullYear();
  const recommendedLinks = [
    { key: "nordvpn", href: nordVpnAffiliateUrl(), icon: ShieldCheck, label: "NordVPN — browse securely" },
    { key: "booking", href: bookingAffiliateUrl(), icon: MapPin, label: "Hotels nearby — Booking.com" },
    { key: "textverified", href: textVerifiedAffiliateUrl(), icon: Smartphone, label: "Second phone number" },
  ];

  return (
    <footer className="bg-zinc-950 border-t border-zinc-900 text-zinc-400">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">

          {/* Col 1: Brand */}
          <div className="space-y-6">
            <Link to={createPageUrl("Home")} className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-white">
                <Crown className="h-5 w-5" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-base font-serif font-bold text-zinc-100">La Boutique VIP</span>
                <span className="text-xs text-zinc-500">International</span>
              </div>
            </Link>
            <p className="text-sm leading-6 text-zinc-500">
              A curated, discreet directory for verified profiles. We prioritize transparency, trust, and premium presentation.
            </p>
          </div>

          {/* Col 2: Directory */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">Directory</h3>
            <ul className="space-y-4">
              <li><Link to={createPageUrl("Browse")} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Browse</Link></li>
              <li><Link to={createPageUrl("Pricing")} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Pricing</Link></li>
              <li><Link to={createPageUrl("Trust")} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Trust</Link></li>
            </ul>
          </div>

          {/* Col 3: Support */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">Support</h3>
            <ul className="space-y-4">
              <li><Link to={createPageUrl("Contact")} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Contact</Link></li>
              <li><Link to={createPageUrl("FAQ")} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">FAQ</Link></li>
              <li><Link to={createPageUrl("Terms")} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Terms</Link></li>
              <li><Link to={createPageUrl("Privacy")} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Privacy</Link></li>
            </ul>
          </div>

          {/* Col 4: Affiliate + Legal */}
          <div className="space-y-6">
            {recommendedLinks.map(({ key, href, icon: Icon, label }) => (
              <a key={key} href={href} target="_blank" rel="nofollow sponsored"
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                <Icon className="h-4 w-4 text-zinc-600 shrink-0" /> {label}
              </a>
            ))}
            <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              18+ Adults Only
            </div>
            <p className="text-xs leading-5 text-zinc-600">
              Some outbound links may be affiliate links. We may earn a commission at no extra cost to you.
            </p>
            <p className="text-xs text-zinc-600">
              © {currentYear} La Boutique VIP International. All rights reserved.
            </p>
          </div>

        </div>

        {/* City hubs */}
        <div className="mt-12 pt-8 border-t border-zinc-900">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <MapPin className="h-3.5 w-3.5 text-zinc-700 shrink-0" />
            {hubCities.map(([city, state]) => (
              <Link
                key={city}
                to={`${createPageUrl("Browse")}?location=${encodeURIComponent(city)}`}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {city}, {state}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}