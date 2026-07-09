import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Globe, Mail, MessageSquare, Phone } from "lucide-react";
import {
  getContactActions,
  getVisibleSocialLinks,
} from "@/lib/socialLinks";

function isImportedCatalogProvider(provider) {
  const source = String(provider?.verification_provider ?? "").toLowerCase();
  return source === "eros" || source === "tryst";
}

function formatPhoneDisplay(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function maskPhone(phone) {
  return phone ? phone.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2") : "";
}

function maskEmail(email) {
  return email ? email.replace(/(.{3}).*(@.*)/, "$1***$2") : "";
}

export function ProviderContactAndSocial({ provider }) {
  const imported = isImportedCatalogProvider(provider);
  const contactActions = getContactActions(provider);
  const socialLinks = getVisibleSocialLinks(provider);
  const website =
    provider?.social_media?.website ||
    provider?.website ||
    null;

  const extraLinks = Array.isArray(provider?.social_media?.extra_links)
    ? provider.social_media.extra_links.filter(Boolean)
    : [];

  const hasContact =
    provider?.phone ||
    provider?.email ||
    website ||
    contactActions.length > 0;
  const hasSocial = socialLinks.length > 0 || extraLinks.length > 0;

  if (!hasContact && !hasSocial) return null;

  return (
    <>
      {hasContact && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {provider.phone && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Phone className="w-4 h-4 shrink-0" />
                {imported ? (
                  <a
                    href={contactActions.find((a) => a.key === "text")?.href ?? contactActions.find((a) => a.key === "call")?.href}
                    className="text-base font-semibold text-rose-300 hover:text-rose-200 transition-colors"
                  >
                    {formatPhoneDisplay(provider.phone)}
                  </a>
                ) : (
                  <span className="text-sm">{maskPhone(provider.phone)}</span>
                )}
              </div>
            )}
            {provider.email && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Mail className="w-4 h-4 shrink-0" />
                {imported ? (
                  <a
                    href={contactActions.find((a) => a.key === "email")?.href}
                    className="text-sm hover:text-rose-400 transition-colors break-all"
                  >
                    {provider.email}
                  </a>
                ) : (
                  <span className="text-sm">{maskEmail(provider.email)}</span>
                )}
              </div>
            )}
            {website && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Globe className="w-4 h-4 shrink-0" />
                <a
                  href={website.startsWith("http") ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:text-rose-400 transition-colors break-all"
                >
                  Website
                </a>
              </div>
            )}
            {contactActions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {contactActions.map((action) => (
                  <a
                    key={action.key}
                    href={action.href}
                    target={action.key === "email" ? undefined : "_blank"}
                    rel={action.key === "email" ? undefined : "noopener noreferrer"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-rose-500/50 hover:text-rose-300"
                  >
                    {action.key === "text" ? (
                      <MessageSquare className="h-3.5 w-3.5" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    {action.label}
                  </a>
                ))}
              </div>
            )}
            {!imported && (provider.phone || provider.email) && (
              <p className="text-[10px] leading-4 text-zinc-500">
                Direct contact details are partially masked on La Boutique VIP listings. Use the action buttons above when available.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {hasSocial && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100">Social & links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {socialLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-rose-500/40 hover:text-rose-300"
              >
                <span>{link.label}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
            ))}
            {extraLinks.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-rose-500/40 hover:text-rose-300"
              >
                <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

export { SOCIAL_LINK_FIELDS, DIRECTORY_LINK_FIELDS };
