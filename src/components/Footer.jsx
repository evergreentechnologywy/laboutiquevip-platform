import React from "react";
import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { createPageUrl } from "@/utils";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-stone-200 bg-white text-stone-600 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* Col 1: Logo + tagline */}
          <div className="space-y-6">
            <Link to={createPageUrl("Home")} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-900 text-stone-50">
                <Crown className="h-5 w-5" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-base font-semibold tracking-tight text-stone-900">La Boutique VIP</span>
                <span className="text-xs text-stone-500 italic">International</span>
              </div>
            </Link>
            <p className="text-sm leading-7">
              A curated, discreet directory for verified profiles. We prioritize transparency, trust, and premium presentation.
            </p>
          </div>

          {/* Col 2: Quick Links */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-900">Directory</h3>
            <ul className="space-y-4">
              <li><Link to={createPageUrl("Browse")} className="text-sm hover:text-stone-900 transition-colors">Browse</Link></li>
              <li><Link to={createPageUrl("Pricing")} className="text-sm hover:text-stone-900 transition-colors">Pricing</Link></li>
              <li><Link to={createPageUrl("Trust")} className="text-sm hover:text-stone-900 transition-colors">Trust</Link></li>
            </ul>
          </div>

          {/* Col 3: Support & Legal */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-900">Support</h3>
            <ul className="space-y-4">
              <li><Link to={createPageUrl("Contact")} className="text-sm hover:text-stone-900 transition-colors">Contact</Link></li>
              <li><Link to={createPageUrl("FAQ")} className="text-sm hover:text-stone-900 transition-colors">FAQ</Link></li>
              <li><Link to={createPageUrl("Terms")} className="text-sm hover:text-stone-900 transition-colors">Terms</Link></li>
              <li><Link to={createPageUrl("Privacy")} className="text-sm hover:text-stone-900 transition-colors">Privacy</Link></li>
            </ul>
          </div>

          {/* Col 4: Disclaimer + Copyright */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-stone-700">
              18+ Adults Only
            </div>
            <p className="text-xs leading-5">
              &copy; {currentYear} La Boutique VIP International. All rights reserved. Use with discretion and always review our trust and safety guidelines.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
