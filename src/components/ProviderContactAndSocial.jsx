import React from "react";
import {
  ExternalLink,
  Globe,
  Mail,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react";
import { getProviderImportantLinks } from "@/lib/providerImportantLinks";

const ICONS = {
  text: MessageCircle,
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  telegram: Send,
  website: Globe,
  listing: Globe,
  default: ExternalLink,
};

function LinkRow({ href, label, display, tone = "zinc" }) {
  const toneMap = {
    zinc: "hover:border-white/20 hover:bg-white/[0.04] text-zinc-200",
    rose: "hover:border-rose-500/40 hover:bg-rose-500/10 text-rose-100",
    sky: "hover:border-sky-500/40 hover:bg-sky-500/10 text-sky-100",
    emerald: "hover:border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-100",
    violet: "hover:border-violet-500/40 hover:bg-violet-500/10 text-violet-100",
    amber: "hover:border-amber-500/40 hover:bg-amber-500/10 text-amber-100",
  };
  const Icon = ICONS[label.toLowerCase()] || ICONS.default;
  return (
    <a
      href={href}
      target={href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("sms:") ? undefined : "_blank"}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className={`flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-black/35 border border-white/5 transition-all group ${toneMap[tone] || toneMap.zinc}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white group-hover:text-inherit">{label}</span>
        {display ? (
          <span className="block text-xs text-zinc-500 truncate mt-0.5">{display}</span>
        ) : null}
      </span>
      <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-current shrink-0" />
    </a>
  );
}

/**
 * Only important, working contact + destination links.
 */
export function ProviderContactAndSocial({ provider }) {
  const links = getProviderImportantLinks(provider);
  if (!links.hasAny) return null;

  const boardTone = { p411: "sky", ter: "emerald", pd: "violet", tob: "amber" };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-white font-serif text-lg mb-3">Contact</h3>
        {links.contact.length === 0 && !links.website && !links.listing ? (
          <p className="text-sm text-zinc-500">No public contact methods listed.</p>
        ) : (
          <div className="space-y-2">
            {links.contact.map((item) => (
              <LinkRow
                key={item.key}
                href={item.href}
                label={item.label}
                display={item.display}
                tone="rose"
              />
            ))}
            {links.website && (
              <LinkRow href={links.website} label="Website" display={links.website.replace(/^https?:\/\//, "")} tone="zinc" />
            )}
            {links.listing && (
              <LinkRow href={links.listing.href} label={links.listing.label} display={links.listing.href.replace(/^https?:\/\//, "").slice(0, 48)} tone="zinc" />
            )}
          </div>
        )}
      </div>

      {links.social.length > 0 && (
        <div>
          <h3 className="text-white font-serif text-lg mb-3">Social</h3>
          <div className="space-y-2">
            {links.social.map((item) => (
              <LinkRow key={item.key} href={item.href} label={item.label} display={item.display} />
            ))}
          </div>
        </div>
      )}

      {links.boards.length > 0 && (
        <div>
          <h3 className="text-white font-serif text-lg mb-3">Reviews & boards</h3>
          <div className="space-y-2">
            {links.boards.map((item) => (
              <LinkRow
                key={item.key}
                href={item.href}
                label={item.label}
                tone={boardTone[item.key] || "zinc"}
              />
            ))}
          </div>
          <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
            Board links open the provider&apos;s matched profile only — never a blank search page.
          </p>
        </div>
      )}
    </div>
  );
}
