import React from "react";

/**
 * Fetches city suggestions from the search API.
 * Debounces input and returns matching cities.
 */
export function useCitySuggestions(query, debounceMs = 200) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search/cities?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!cancelled) {
          setSuggestions(data.items || []);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, debounceMs]);

  return { suggestions, loading };
}

/**
 * Renders a city autocomplete input with dropdown suggestions.
 */
export function CityAutocomplete({ value, onChange, onEnter, className = "" }) {
  const [inputValue, setInputValue] = React.useState(value || "");
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const { suggestions, loading } = useCitySuggestions(inputValue);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  // Sync external value changes
  React.useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectCity = (city) => {
    const displayName = city.displayName || city.slug || "";
    setInputValue(displayName);
    onChange?.(displayName);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (isOpen && suggestions.length > 0 && activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        selectCity(suggestions[activeIndex]);
        return;
      }
      onEnter?.();
      return;
    }

    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const hasSuggestions = suggestions.length > 0;

  return (
    <div ref={inputRef} className="relative">
      <input
        type="text"
        placeholder="City or state"
        aria-label="City or state"
        aria-autocomplete="list"
        aria-expanded={isOpen && hasSuggestions}
        role="combobox"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange?.(e.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => inputValue.trim().length > 0 && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {isOpen && hasSuggestions && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-xl border border-stone-200 bg-white shadow-lg"
        >
          {suggestions.map((city, idx) => (
            <li
              key={city.slug || idx}
              role="option"
              aria-selected={idx === activeIndex}
              className={`flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                idx === activeIndex
                  ? "bg-stone-100 text-stone-900"
                  : "text-stone-700 hover:bg-stone-50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectCity(city);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="flex-1 truncate">{city.displayName}</span>
            </li>
          ))}
          {loading && (
            <li className="px-4 py-2.5 text-sm text-stone-400">Searching...</li>
          )}
        </ul>
      )}
    </div>
  );
}
