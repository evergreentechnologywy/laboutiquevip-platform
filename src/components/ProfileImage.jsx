import React from "react";
import { ImageOff } from "lucide-react";

/**
 * Profile photos from R2 / CDN proxies.
 * - `fit="cover"` for cards/thumbs
 * - `fit="contain"` for hero gallery so full body isn't butchered
 */
export function ProfileImage({
  src,
  fallbacks = [],
  alt,
  className = "",
  priority = false,
  objectPosition = "center center",
  fit = "cover",
  blurDataURL,
}) {
  const candidates = React.useMemo(() => {
    const list = [src, ...(Array.isArray(fallbacks) ? fallbacks : [])]
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    return [...new Set(list)];
  }, [src, fallbacks]);

  const [index, setIndex] = React.useState(0);
  const [error, setError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const current = candidates[index] || null;

  React.useEffect(() => {
    setIndex(0);
    setError(false);
    setLoaded(false);
  }, [candidates.join("|")]);

  const initials = alt
    ? alt
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : "";

  if (!current || error) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-900 border border-white/5 relative overflow-hidden ${className}`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />
        {initials ? (
          <span className="text-4xl font-serif font-bold text-zinc-600 tracking-wider relative z-10">{initials}</span>
        ) : (
          <ImageOff className="h-10 w-10 text-zinc-700 relative z-10" strokeWidth={1.5} />
        )}
      </div>
    );
  }

  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  return (
    <div className={`relative overflow-hidden bg-zinc-950 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 z-10">
          {blurDataURL ? (
            <div
              className="w-full h-full bg-cover bg-center"
              style={{ backgroundImage: `url(${blurDataURL})`, filter: "blur(12px)" }}
            />
          ) : (
            <div className="w-full h-full bg-zinc-900 animate-pulse" />
          )}
        </div>
      )}

      <img
        key={current}
        src={current}
        alt={alt || ""}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 70vw, 50vw"
        className={`absolute inset-0 h-full w-full ${fitClass} transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ objectPosition }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (index + 1 < candidates.length) {
            setLoaded(false);
            setIndex((i) => i + 1);
            return;
          }
          setError(true);
          setLoaded(true);
        }}
      />
    </div>
  );
}
