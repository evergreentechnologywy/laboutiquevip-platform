import React from "react";
import { ImageOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Profile photos are served from Cloudflare R2 via /api/r2-photo/...
 * Do NOT rewrite to /cdn-cgi/image/ — Cloudflare Image Resizing is not enabled.
 */
export function ProfileImage({
  src,
  alt,
  className = "",
  priority = false,
  objectPosition = "center top",
  blurDataURL,
}) {
  const [error, setError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setError(false);
    setLoaded(false);
  }, [src]);

  const initials = alt
    ? alt
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : "";

  if (!src || error) {
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

  return (
    <div className={`relative overflow-hidden bg-zinc-900 ${className}`}>
      <AnimatePresence>
        {!loaded && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 z-10"
          >
            {blurDataURL ? (
              <div
                className="w-full h-full bg-cover bg-center scale-110"
                style={{ backgroundImage: `url(${blurDataURL})`, filter: "blur(20px)" }}
              />
            ) : (
              <div className="w-full h-full relative overflow-hidden bg-zinc-900">
                <div className="absolute inset-0 bg-zinc-800/50 animate-pulse" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <img
        src={src}
        alt={alt || ""}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className={`h-full w-full object-cover transform transition-all duration-[1000ms] ease-[0.16,1,0.3,1] ${
          loaded ? "opacity-100 scale-100 filter-none" : "opacity-0 scale-110 blur-sm"
        }`}
        style={{ objectPosition, contentVisibility: "auto" }}
        onLoad={() => setLoaded(true)}
        onError={(event) => {
          event.currentTarget.onerror = null;
          setError(true);
          setLoaded(true);
        }}
      />
    </div>
  );
}
