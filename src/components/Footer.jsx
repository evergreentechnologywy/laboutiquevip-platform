import React from "react";
import { Link } from "react-router-dom";
import { Crown, ShieldCheck, MapPin, Smartphone, Globe, CreditCard, Server, Camera, Stethoscope, ShoppingBag } from "lucide-react";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import {
  bookingAffiliateUrl,
  nordVpnAffiliateUrl,
  textVerifiedAffiliateUrl,
  stripeAffiliateUrl,
  knownHostAffiliateUrl,
  onlyFansAffiliateUrl,
  stdCheckAffiliateUrl,
  expressVpnAffiliateUrl,
  adamEveAffiliateUrl,
  namecheapAffiliateUrl,
} from "@/lib/affiliateLinks";

const hubCities = [
  ["Miami", "FL"], ["New York", "NY"], ["Los Angeles", "CA"],
  ["Las Vegas", "NV"], ["Chicago", "IL"], ["Houston", "TX"],
  ["Atlanta", "GA"], ["Dallas", "TX"], ["Phoenix", "AZ"],
  ["Orlando", "FL"], ["San Francisco", "CA"], ["Seattle", "WA"],
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  const privacyLinks = [
    { key: "nordvpn", href: nordVpnAffiliateUrl(), icon: ShieldCheck, label: "NordVPN — anonymous browsing" },
    { key: "expressvpn", href: expressVpnAffiliateUrl(), icon: Globe, label: "ExpressVPN — premium privacy" },
    { key: "textverified", href: textVerifiedAffiliateUrl(), icon: Smartphone, label: "Second phone number" },
  ];

  const businessLinks = [
    { key: "onlyfans", href: onlyFansAffiliateUrl(), icon: Camera, label: "OnlyFans — content platform" },
    { key: "stripe", href: stripeAffiliateUrl(), icon: CreditCard, label: "Stripe — payment processing" },
    { key: "knownhost", href: knownHostAffiliateUrl(), icon: Server, label: "KnownHost — web hosting" },
    { key: "namecheap", href: namecheapAffiliateUrl(), icon: Globe, label: "Namecheap — domains" },
  ];

  const wellnessLinks = [
    { key: "stdcheck", href: stdCheckAffiliateUrl(), icon: Stethoscope, label: "STDCheck — discreet testing" },
    { key: "adameve", href: adamEveAffiliateUrl(), icon: ShoppingBag, label: "Adam & Eve — adult shop" },
  ];

  const travelLinks = [
    { key: "booking", href: bookingAffiliateUrl(), icon: MapPin, label: "Booking.com — hotels" },
  ];

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <footer className="relative bg-zinc-950 border-t border-white/5 text-zinc-400 overflow-hidden pb-[env(safe-area-inset-bottom)]" role="contentinfo">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-zinc-950 pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-t from-rose-500/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <motion.div 
          initial="hidden" 
          whileInView="show" 
          viewport={{ once: true, margin: "-50px" }}
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
          className="grid gap-10 sm:gap-14 md:gap-16 sm:grid-cols-2 xl:grid-cols-6"
        >
          {/* Col 1: Brand */}
          <motion.div variants={fadeUp} className="space-y-8 xl:col-span-2 sm:col-span-2">
            <Link to={createPageUrl("Home")} className="inline-flex items-center gap-4 group">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-lg shadow-rose-500/20 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                <Crown className="h-6 w-6" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xl font-serif font-bold text-white tracking-wide">La Boutique VIP</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mt-1 group-hover:text-amber-400 transition-colors">International</span>
              </div>
            </Link>
            <p className="text-sm leading-relaxed text-zinc-400 font-light max-w-sm">
              A curated, discreet directory for verified profiles. We prioritize transparency, trust, and premium presentation.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              18+ Adults Only
            </div>
          </motion.div>

          {/* Col 2: Directory */}
          <motion.div variants={fadeUp} className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white">Directory</h3>
            <ul className="space-y-4">
              {["Browse", "Pricing", "Trust"].map(item => (
                <li key={item}>
                  <Link to={createPageUrl(item)} className="text-sm text-zinc-400 font-light hover:text-amber-400 transition-colors duration-300 inline-block hover:translate-x-1 transform">{item}</Link>
                </li>
              ))}
            </ul>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white pt-4">Support</h3>
            <ul className="space-y-4">
              {["Contact", "FAQ", "Terms", "Privacy", "DMCA"].map(item => (
                <li key={item}>
                  <Link to={createPageUrl(item)} className="text-sm text-zinc-400 font-light hover:text-amber-400 transition-colors duration-300 inline-block hover:translate-x-1 transform">{item}</Link>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Col 3: Privacy & Safety */}
          <motion.div variants={fadeUp} className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white">Privacy</h3>
            <div className="space-y-4">
              {privacyLinks.map(({ key, href, icon: Icon, label }) => (
                <a key={key} href={href} target="_blank" rel="nofollow sponsored"
                  className="group flex items-center gap-3 min-h-[44px] py-2 text-sm text-zinc-400 font-light hover:text-white transition-colors duration-300">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                    <Icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-white transition-colors" />
                  </div>
                  <span className="group-hover:translate-x-1 transition-transform duration-300 line-clamp-1">{label}</span>
                </a>
              ))}
            </div>
          </motion.div>

          {/* Col 4: Business */}
          <motion.div variants={fadeUp} className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white">Business</h3>
            <div className="space-y-4">
              {businessLinks.map(({ key, href, icon: Icon, label }) => (
                <a key={key} href={href} target="_blank" rel="nofollow sponsored"
                  className="group flex items-center gap-3 min-h-[44px] py-2 text-sm text-zinc-400 font-light hover:text-white transition-colors duration-300">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                    <Icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-white transition-colors" />
                  </div>
                  <span className="group-hover:translate-x-1 transition-transform duration-300 line-clamp-1">{label}</span>
                </a>
              ))}
            </div>
          </motion.div>

          {/* Col 5: Travel + Wellness */}
          <motion.div variants={fadeUp} className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white">Travel</h3>
            <div className="space-y-4">
              {travelLinks.map(({ key, href, icon: Icon, label }) => (
                <a key={key} href={href} target="_blank" rel="nofollow sponsored"
                  className="group flex items-center gap-3 min-h-[44px] py-2 text-sm text-zinc-400 font-light hover:text-white transition-colors duration-300">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                    <Icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-white transition-colors" />
                  </div>
                  <span className="group-hover:translate-x-1 transition-transform duration-300 line-clamp-1">{label}</span>
                </a>
              ))}
            </div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white pt-4">Wellness</h3>
            <div className="space-y-4">
              {wellnessLinks.map(({ key, href, icon: Icon, label }) => (
                <a key={key} href={href} target="_blank" rel="nofollow sponsored"
                  className="group flex items-center gap-3 min-h-[44px] py-2 text-sm text-zinc-400 font-light hover:text-white transition-colors duration-300">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                    <Icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-white transition-colors" />
                  </div>
                  <span className="group-hover:translate-x-1 transition-transform duration-300 line-clamp-1">{label}</span>
                </a>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Disclaimer */}
        <motion.div 
          initial={{ opacity: 0 }} 
          whileInView={{ opacity: 1 }} 
          viewport={{ once: true }} 
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <p className="text-xs leading-5 text-zinc-500 font-light max-w-2xl text-center md:text-left">
            Some outbound links may be affiliate links. We may earn a commission at no extra cost to you.
          </p>
          <p className="text-xs text-zinc-500 font-medium">
            © {currentYear} La Boutique VIP International. All rights reserved.
          </p>
        </motion.div>

        {/* City hubs */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          whileInView={{ opacity: 1, y: 0 }} 
          viewport={{ once: true }} 
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-8 pt-8 border-t border-white/5"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-4 sm:gap-y-3">
            <MapPin className="h-4 w-4 text-zinc-700 shrink-0 hidden sm:block" />
            {hubCities.map(([city, state]) => (
              <Link
                key={city}
                to={`${createPageUrl("Browse")}?location=${encodeURIComponent(city)}`}
                className="inline-flex items-center min-h-[36px] px-2 rounded-lg text-xs font-bold uppercase tracking-wider text-zinc-600 hover:text-amber-400 hover:bg-white/5 transition-all duration-300"
              >
                {city}, {state}
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </footer>
  );
}