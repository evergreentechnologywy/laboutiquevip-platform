import React from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchSearchLocations } from "@/api/providerSearch";

const ALL_STATES_VALUE = "__all_states__";
const ALL_CITIES_VALUE = "__all_cities__";

function parseLocationValue(value) {
  const text = String(value || "").trim();
  if (!text) return { stateCode: "", cityName: "", stateOnly: false };
  const combo = text.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (combo) {
    return { cityName: combo[1].trim(), stateCode: combo[2].toUpperCase(), stateOnly: false };
  }
  return { cityName: "", stateCode: "", stateOnly: true, stateName: text };
}

function buildLocationValue({ stateCode, stateName, cityName }) {
  if (cityName && stateCode) return `${cityName}, ${stateCode}`;
  if (stateName) return stateName;
  if (stateCode) return stateCode;
  return "";
}

export function LocationPicker({ value, onChange, className = "" }) {
  const parsed = React.useMemo(() => parseLocationValue(value), [value]);
  const [selectedState, setSelectedState] = React.useState(parsed.stateCode || parsed.stateName || "");
  const [selectedCity, setSelectedCity] = React.useState(parsed.cityName || "");

  const { data, isLoading } = useQuery({
    queryKey: ["search-locations"],
    queryFn: fetchSearchLocations,
    staleTime: 60_000,
  });

  const states = data?.states ?? [];

  React.useEffect(() => {
    const next = parseLocationValue(value);
    setSelectedState(next.stateCode || next.stateName || "");
    setSelectedCity(next.cityName || "");
  }, [value]);

  const activeState = states.find(
    (state) => state.code === selectedState || state.name.toLowerCase() === String(selectedState).toLowerCase(),
  );
  const cities = activeState?.cities ?? [];

  const handleStateChange = (nextState) => {
    if (nextState === ALL_STATES_VALUE) {
      setSelectedState("");
      setSelectedCity("");
      onChange("");
      return;
    }
    const stateRow = states.find((s) => s.code === nextState);
    setSelectedState(nextState);
    setSelectedCity("");
    onChange(buildLocationValue({ stateCode: nextState, stateName: stateRow?.name }));
  };

  const handleCityChange = (citySlug) => {
    if (citySlug === ALL_CITIES_VALUE) {
      setSelectedCity("");
      onChange(buildLocationValue({ stateCode: activeState?.code ?? selectedState, stateName: activeState?.name }));
      return;
    }
    const cityRow = cities.find((c) => c.slug === citySlug);
    if (!cityRow || !activeState) return;
    setSelectedCity(cityRow.name);
    onChange(buildLocationValue({ stateCode: activeState.code, cityName: cityRow.name }));
  };

  const stateSelectValue = selectedState || ALL_STATES_VALUE;
  const citySelectValue = selectedCity
    ? cities.find((c) => c.name.toLowerCase() === selectedCity.toLowerCase())?.slug ?? ALL_CITIES_VALUE
    : ALL_CITIES_VALUE;

  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <Select value={stateSelectValue} onValueChange={handleStateChange} disabled={isLoading}>
          <SelectTrigger
            className="h-12 rounded-2xl border-zinc-850 bg-zinc-950/70 pl-11 text-zinc-100 focus:border-amber-500 focus:ring-amber-500/20"
            aria-label="Select state"
          >
            <SelectValue placeholder={isLoading ? "Loading states..." : "All states"} />
          </SelectTrigger>
          <SelectContent className="max-h-72 bg-zinc-900 border-zinc-800 text-zinc-100">
            <SelectItem value={ALL_STATES_VALUE}>All states</SelectItem>
            {states.map((state) => (
              <SelectItem key={state.code} value={state.code}>
                {state.name} ({state.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Select
        value={citySelectValue}
        onValueChange={handleCityChange}
        disabled={isLoading || !activeState}
      >
        <SelectTrigger
          className="h-12 rounded-2xl border-zinc-850 bg-zinc-950/70 text-zinc-100 focus:border-amber-500 focus:ring-amber-500/20"
          aria-label="Select city"
        >
          <SelectValue placeholder={activeState ? "All cities in state" : "Pick a state first"} />
        </SelectTrigger>
        <SelectContent className="max-h-72 bg-zinc-900 border-zinc-800 text-zinc-100">
          <SelectItem value={ALL_CITIES_VALUE}>
            {activeState ? `All cities in ${activeState.name}` : "Pick a state first"}
          </SelectItem>
          {cities.map((city) => (
            <SelectItem key={city.slug} value={city.slug}>
              {city.name} ({city.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
