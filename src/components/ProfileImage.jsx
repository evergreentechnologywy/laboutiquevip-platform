import React from "react";
import { User } from "lucide-react";

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
        className={`flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-400 ${className}`}
      >
        {initials ? (
          <span className="text-2xl font-semibold tracking-wide">{initials}</span>
        ) : (
          <User className="h-12 w-12 opacity-40" />
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
      {/* Low-quality blur placeholder */}
      {blurDataURL && !loaded && (
        <div
          className="absolute inset-0 bg-cover bg-center scale-110 transition-opacity duration-500"
          style={{
            backgroundImage: `url(${blurDataURL})`,
            opacity: loaded ? 0 : 1,
            filter: "blur(20px)",
          }}
        />
      )}
      {/* Pulse skeleton fallback */}
      {!blurDataURL && !loaded && (
        <div className="absolute inset-0 animate-pulse bg-zinc-800" />
      )}
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
        className={`h-full w-full object-cover transition duration-700 ${
          loaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
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