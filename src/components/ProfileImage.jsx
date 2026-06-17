import React from "react";
import { User } from "lucide-react";

export function ProfileImage({
  src,
  alt,
  className = "",
  priority = false,
  objectPosition = "center top",
}) {
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(src));

  React.useEffect(() => {
    setError(false);
    setLoading(Boolean(src));
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
      <div className={`flex items-center justify-center bg-gradient-to-br from-stone-200 to-stone-300 text-stone-600 ${className}`}>
        {initials ? (
          <span className="text-2xl font-semibold tracking-wide">{initials}</span>
        ) : (
          <User className="h-12 w-12 opacity-40" />
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-stone-100 ${className}`}>
      {loading ? <div className="absolute inset-0 animate-pulse bg-stone-200" /> : null}
      <img
        src={src}
        alt={alt || ""}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className={`h-full w-full object-cover transition duration-500 ${loading ? "opacity-0" : "opacity-100"}`}
        style={{ objectPosition }}
        onLoad={() => setLoading(false)}
        onError={(event) => {
          event.currentTarget.onerror = null;
          setError(true);
          setLoading(false);
        }}
      />
    </div>
  );
}
