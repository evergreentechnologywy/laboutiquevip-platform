import React from "react";
import { User } from "lucide-react";

export function ProfileImage({ src, alt, className = "" }) {
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const initials = alt ? alt.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : "";

  if (!src || error) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900 text-white ${className}`}>
        {initials ? (
          <span className="text-2xl font-bold">{initials}</span>
        ) : (
          <User className="h-12 w-12 opacity-40" />
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {loading && (
        <div className="absolute inset-0 animate-pulse bg-stone-200" />
      )}
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover transition duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setLoading(false)}
        onError={(e) => {
          e.target.onerror = null;
          setError(true);
        }}
      />
    </div>
  );
}
