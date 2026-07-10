import React from "react";
import { User, ImageOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Generate responsive image URL variants from R2 public base.
 * Appends query params for width + format if the URL is an R2 photo.
 */
function responsiveSrc(src, width) {
  if (!src) return null;
  // Convert r2-photo URLs to Cloudflare Image Resizing variants
  if (src.includes("/api/r2-photo/")) {
    // Cloudflare Image Resizing via /cdn-cgi/image/
    const base = src.replace("/api/r2-photo/", "/cdn-cgi/image/");
    return `${base}?width=${width}&format=webp&fit=cover&quality=85`;
  }
  return src;
}

function srcSet(src, widths = [150, 400, 800, 1200]) {
  if (!src) return undefined;
  // Only generate srcset for R2 photos (not external URLs)
  if (!src.includes("/api/r2-photo/")) return undefined;
  return widths
    .map((w) => `${responsiveSrc(src, w)} ${w}w`)
    .join(", ");
}

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
  const imgRef = React.useRef(null);
  const observerRef = React.useRef(null);

  React.useEffect(() => {
    setError(false);
    setLoaded(false);
  }, [src]);

  // Intersection Observer for true lazy loading
  React.useEffect(() => {
    if (priority || !imgRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const img = imgRef.current;
          if (img && img.dataset.src) {
            img.src = img.dataset.src;
            if (img.dataset.srcset) img.srcset = img.dataset.srcset;
            img.removeAttribute("data-src");
            img.removeAttribute("data-srcset");
          }
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(imgRef.current);
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [src, priority]);

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

  const isR2 = src.includes("/api/r2-photo/");
  const srcSetVal = srcSet(src);
  const effectiveSrc = priority ? src : undefined;
  const effectiveSrcSet = priority ? srcSetVal : undefined;

  return (
    <div className={`relative overflow-hidden bg-zinc-900 ${className}`}>
      {/* Skeleton / Blur Placeholder */}
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
        ref={imgRef}
        src={effectiveSrc}
        srcSet={effectiveSrcSet}
        data-src={!priority ? src : undefined}
        data-srcset={!priority ? srcSetVal : undefined}
        alt={alt || ""}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        sizes={
          isR2
            ? "(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px"
            : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        }
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