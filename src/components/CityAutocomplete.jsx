import React from "react";
import { createPortal } from "react-dom";

const POPULAR_LOCATIONS = [
  { slug: "miami-fl", displayName: "Miami, FL" },
  { slug: "miami", displayName: "Miami" },
  { slug: "florida", displayName: "Florida" },
  { slug: "dallas-tx", displayName: "Dallas, TX" },
  { slug: "texas", displayName: "Texas" },
  { slug: "atlanta-ga", displayName: "Atlanta, GA" },
  { slug: "las-vegas-nv", displayName: "Las Vegas, NV" },
  { slug: "new-york-ny", displayName: "New York, NY" },
];

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

function dedupeSuggestions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.displayName || item.slug || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchPopularAndStates(query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return POPULAR_LOCATIONS;

  const matches = [];
  for (const [abbrev, name] of US_STATES) {
    const abbrevLower = abbrev.toLowerCase();
    const nameLower = name.toLowerCase();
    if (abbrevLower.startsWith(term) || nameLower.includes(term)) {
      matches.push({ slug: nameLower.replace(/\s+/g, "-"), displayName: name });
    }
  }
  for (const city of POPULAR_LOCATIONS) {
    const label = city.displayName.toLowerCase();
    const slug = city.slug.toLowerCase();
    if (label.includes(term) || slug.includes(term)) {
      matches.push(city);
    }
  }
  return dedupeSuggestions(matches);
}

function getAnchorPosition(anchorRef) {
  if (!anchorRef.current) return null;
  const rect = anchorRef.current.getBoundingClientRect();
  return {
    top: rect.bottom + 4,
    left: rect.left,
    width: rect.width,
  };
}

function useDropdownPosition(anchorRef, isOpen) {
  const [position, setPosition] = React.useState(null);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    const update = () => setPosition(getAnchorPosition(anchorRef));
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, isOpen]);

  if (!isOpen) return null;
  return position || getAnchorPosition(anchorRef);
}

/**
 * Fetches city suggestions from the search API.
 */
export function useCitySuggestions(query, debounceMs = 200) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search/cities?q=${encodeURIComponent(trimmed)}`);
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

function SuggestionDropdown({
  anchorRef,
  dropdownRef,
  isOpen,
  loading,
  suggestions,
  activeIndex,
  onSelect,
  onHover,
  emptyMessage = "No locations found",
}) {
  const position = useDropdownPosition(anchorRef, isOpen);
  const showPanel = isOpen && (loading || suggestions.length > 0 || Boolean(emptyMessage));

  if (!showPanel || !position || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <ul
      ref={dropdownRef}
      role="listbox"
      className="fixed z-[9999] max-h-60 overflow-auto rounded-xl border border-stone-200 bg-white shadow-xl"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
      }}
    >
      {loading && suggestions.length === 0 ? (
        <li className="px-4 py-2.5 text-sm text-stone-400">Searching locations...</li>
      ) : null}
      {suggestions.map((item, idx) => (
        <li
          key={`${item.slug || item.displayName || idx}-${idx}`}
          role="option"
          aria-selected={idx === activeIndex}
          className={`flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
            idx === activeIndex ? "bg-stone-100 text-stone-900" : "text-stone-700 hover:bg-stone-50"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          onMouseEnter={() => onHover(idx)}
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          <span className="flex-1 truncate">{item.displayName || item.slug}</span>
        </li>
      ))}
      {!loading && suggestions.length === 0 ? (
        <li className="px-4 py-2.5 text-sm text-stone-400">{emptyMessage}</li>
      ) : null}
    </ul>,
    document.body,
  );
}

/**
 * Location autocomplete with portal-mounted suggestions.
 */
export function CityAutocomplete({ value, onChange, onEnter, className = "" }) {
  const [inputValue, setInputValue] = React.useState(value || "");
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const { suggestions: fetchedSuggestions, loading } = useCitySuggestions(inputValue);
  const anchorRef = React.useRef(null);
  const dropdownRef = React.useRef(null);

  const suggestions = React.useMemo(() => {
    const staticMatches = matchPopularAndStates(inputValue);
    if (!inputValue.trim()) return POPULAR_LOCATIONS;
    return dedupeSuggestions([...staticMatches, ...fetchedSuggestions]).slice(0, 25);
  }, [inputValue, fetchedSuggestions]);

  React.useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  React.useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (anchorRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const openSuggestions = () => {
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const selectCity = (city) => {
    const displayName = city.displayName || city.slug || "";
    setInputValue(displayName);
    onChange?.(displayName);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      if (isOpen && suggestions.length > 0 && activeIndex >= 0 && activeIndex < suggestions.length) {
        event.preventDefault();
        selectCity(suggestions[activeIndex]);
        return;
      }
      onEnter?.();
      return;
    }

    if (!isOpen || suggestions.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  return (
    <div
      ref={anchorRef}
      className="relative w-full"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input
        type="text"
        placeholder="City or state"
        aria-label="City or state"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        role="combobox"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          onChange?.(event.target.value);
          openSuggestions();
        }}
        onFocus={openSuggestions}
        onClick={openSuggestions}
        onKeyDown={handleKeyDown}
        className={className}
      />
      <SuggestionDropdown
        anchorRef={anchorRef}
        dropdownRef={dropdownRef}
        isOpen={isOpen}
        loading={loading && Boolean(inputValue.trim())}
        suggestions={suggestions}
        activeIndex={activeIndex}
        onSelect={selectCity}
        onHover={setActiveIndex}
        emptyMessage={inputValue.trim() && !loading && suggestions.length === 0 ? "No locations found" : ""}
      />
    </div>
  );
}

export function useNameSuggestions(query, debounceMs = 200) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const trimmed = String(query || "").trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search/providers?q=${encodeURIComponent(trimmed)}&limit=8`);
        const data = await res.json();
        if (!cancelled) {
          const names = (data.items || [])
            .map((item) => item.display_name)
            .filter(Boolean)
            .filter((name, index, all) => all.findIndex((entry) => entry.toLowerCase() === name.toLowerCase()) === index)
            .slice(0, 8)
            .map((displayName) => ({ displayName, slug: displayName.toLowerCase().replace(/\s+/g, "-") }));
          setSuggestions(names);
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

export function NameAutocomplete({ value, onChange, onEnter, className = "", placeholder = "Search by name or service" }) {
  const [inputValue, setInputValue] = React.useState(value || "");
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const { suggestions, loading } = useNameSuggestions(inputValue);
  const anchorRef = React.useRef(null);
  const dropdownRef = React.useRef(null);

  React.useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  React.useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (anchorRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const openSuggestions = () => {
    if (inputValue.trim().length >= 2) {
      setIsOpen(true);
      setActiveIndex(-1);
    }
  };

  const selectName = (item) => {
    const displayName = item.displayName || "";
    setInputValue(displayName);
    onChange?.(displayName);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      if (isOpen && suggestions.length > 0 && activeIndex >= 0 && activeIndex < suggestions.length) {
        event.preventDefault();
        selectName(suggestions[activeIndex]);
        return;
      }
      onEnter?.();
      return;
    }

    if (!isOpen || suggestions.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  return (
    <div
      ref={anchorRef}
      className="relative w-full"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        role="combobox"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          onChange?.(event.target.value);
          if (event.target.value.trim().length >= 2) {
            openSuggestions();
          } else {
            setIsOpen(false);
          }
        }}
        onFocus={openSuggestions}
        onClick={openSuggestions}
        onKeyDown={handleKeyDown}
        className={className}
      />
      <SuggestionDropdown
        anchorRef={anchorRef}
        dropdownRef={dropdownRef}
        isOpen={isOpen}
        loading={loading && inputValue.trim().length >= 2}
        suggestions={suggestions}
        activeIndex={activeIndex}
        onSelect={selectName}
        onHover={setActiveIndex}
        emptyMessage={inputValue.trim().length >= 2 && !loading && suggestions.length === 0 ? "No matching profiles" : ""}
      />
    </div>
  );
}
