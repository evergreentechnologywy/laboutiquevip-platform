import React from "react";
import { ExternalLink } from "lucide-react";

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/gi;

function trimTrailingPunctuation(url) {
  const match = url.match(/[.,;:!?]+$/);
  if (!match) return { url, trailing: "" };
  return { url: url.slice(0, -match[0].length), trailing: match[0] };
}

/**
 * Render plain text (bio, tagline) with bare URLs upgraded to styled external
 * links (icon + rel="noopener noreferrer"). Returns the original value when
 * no URL is present.
 */
export function renderTextWithLinks(text) {
  if (!text || typeof text !== "string" || !URL_PATTERN.test(text)) return text;
  URL_PATTERN.lastIndex = 0;

  const parts = text.split(URL_PATTERN);
  return parts.map((part, index) => {
    if (!part) return null;
    URL_PATTERN.lastIndex = 0;
    if (!URL_PATTERN.test(part)) return <React.Fragment key={index}>{part}</React.Fragment>;

    const { url, trailing } = trimTrailingPunctuation(part);
    const href = url.startsWith("http") ? url : `https://${url}`;
    return (
      <React.Fragment key={index}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-amber-400 underline underline-offset-4 transition-colors hover:text-amber-300 break-all"
        >
          {url.replace(/^https?:\/\//, "")}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </a>
        {trailing}
      </React.Fragment>
    );
  });
}
