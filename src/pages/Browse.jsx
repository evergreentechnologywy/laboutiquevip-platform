// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Star, Shield, Crown, Filter, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { searchProviders } from "@/api/providerSearch";

function groupProvidersByCity(items) {
  return items.reduce((acc, provider) => {
    const key = `${provider.location_city || "Unknown"}, ${provider.location_state || "Unknown"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(provider);
    return acc;
  }, {});
}

export default function Browse() {
  const urlParams = new URLSearchParams(window.location.search);
  const [searchQuery, setSearchQuery] = React.useState(urlParams.get("q") || "");
  const [location, setLocation] = React.useState(urlParams.get("location") || "");
  const [priceRange, setPriceRange] = React.useState([0, 2000]);
  const [sortBy, setSortBy] = React.useState("newest");
  const [selectedFilters, setSelectedFilters] = React.useState({ verified: false, premium: false });
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, location, sortBy, selectedFilters.verified, selectedFilters.premium, priceRange[0], priceRange[1]]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["provider-search", searchQuery, location, sortBy, selectedFilters, priceRange, page],
    queryFn: () => searchProviders({
      q: searchQuery,
      location,
      verified: selectedFilters.verified,
      premium: selectedFilters.premium,
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      sort: sortBy,
      page,
      limit: 60,
    }),
  });

  const providers = data?.items || [];
  const cityGroups = data?.cityGroups || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const isStateSearch = !!location && providers.some((provider) => provider.location_state?.toLowerCase() === location.toLowerCase()) && new Set(providers.map((provider) => provider.location_city)).size > 1;
  const groupedProviders = groupProvidersByCity(providers);

  const toggleFilter = (filter) => {
    setSelectedFilters((prev) => ({ ...prev, [filter]: !prev[filter] }));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setLocation("");
    setPriceRange([0, 2000]);
    setSelectedFilters({ verified: false, premium: false });
    setSortBy("newest");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-100 mb-2">Browse Companions</h1>
          <p className="text-zinc-400">Discover verified professionals in your area</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-8">
          <div className="grid md:grid-cols-4 gap-4 mb-4">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input placeholder="Search by name or services..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input placeholder="City or state..." value={location} onChange={(e) => setLocation(e.target.value)} className="pl-10 bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
                <SelectItem value="price_low">Price: Low to High</SelectItem>
                <SelectItem value="price_high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">Filters:</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => toggleFilter("verified")} className={`${selectedFilters.verified ? "bg-rose-500/20 border-rose-500 text-rose-400" : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}><Shield className="w-3 h-3 mr-1" />Verified Only</Button>
            <Button variant="outline" size="sm" onClick={() => toggleFilter("premium")} className={`${selectedFilters.premium ? "bg-amber-500/20 border-amber-500 text-amber-400" : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}><Crown className="w-3 h-3 mr-1" />Premium Only</Button>
            <div className="flex-1 max-w-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-zinc-400">Price Range:</span>
                <span className="text-sm font-medium text-zinc-200">${priceRange[0]} - ${priceRange[1]}</span>
              </div>
              <Slider value={priceRange} onValueChange={setPriceRange} max={2000} step={50} className="[&_[role=slider]]:bg-rose-500 [&_[role=slider]]:border-rose-600" />
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-zinc-400 hover:text-zinc-200"><X className="w-3 h-3 mr-1" />Clear All</Button>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3">
          <p className="text-zinc-400">{isLoading ? "Loading..." : `${total} companions found`}{isFetching && !isLoading ? " • refreshing" : ""}</p>
          {isStateSearch && cityGroups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cityGroups.map((group) => (
                <Badge key={`${group.city}-${group.state}`} className="bg-zinc-800 text-zinc-300 border-0">{group.city} ({group.count})</Badge>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden"><Skeleton className="aspect-[3/4] w-full" /><div className="p-6 space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-full" /></div></div>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <div className="col-span-full text-center py-16"><div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4"><Search className="w-8 h-8 text-zinc-600" /></div><h3 className="text-xl font-semibold text-zinc-300 mb-2">No results found</h3><p className="text-zinc-500 mb-6">Try adjusting your filters or search terms</p><Button onClick={clearFilters} variant="outline" className="border-zinc-700 text-zinc-300">Clear Filters</Button></div>
        ) : isStateSearch ? (
          <div className="space-y-10">
            {Object.entries(groupedProviders).map(([cityLabel, cityProviders]) => (
              <div key={cityLabel}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-semibold text-zinc-100">{cityLabel}</h2>
                  <Badge className="bg-rose-500/15 text-rose-300 border-0">{cityProviders.length} listings</Badge>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {cityProviders.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button variant="outline" className="border-zinc-700 text-zinc-300" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <span className="text-sm text-zinc-400">Page {page} of {totalPages}</span>
            <Button variant="outline" className="border-zinc-700 text-zinc-300" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderCard({ provider }) {
  return (
    <Link to={createPageUrl(`ViewProfile?id=${provider.id}`)} className="group">
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-rose-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-rose-500/10">
        <div className="aspect-[3/4] overflow-hidden bg-zinc-800 relative">
          {provider.photos?.[0] ? <img src={provider.photos[0]} alt={provider.display_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center"><Crown className="w-16 h-16 text-zinc-700" /></div>}
          {provider.is_premium && <div className="absolute top-4 right-4"><Badge className="bg-gradient-to-r from-amber-500 to-orange-500 border-0"><Crown className="w-3 h-3 mr-1" />Premium</Badge></div>}
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-xl font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors">{provider.display_name}</h3>
              <p className="text-sm text-zinc-400">{provider.location_city}, {provider.location_state}</p>
            </div>
            {provider.is_verified && <div className="bg-rose-500/20 p-2 rounded-lg"><Shield className="w-4 h-4 text-rose-400" /></div>}
          </div>
          {provider.tagline && <p className="text-sm text-zinc-500 mb-4 line-clamp-2">{provider.tagline}</p>}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1"><Star className="w-4 h-4 fill-amber-400 text-amber-400" /><span className="text-sm font-medium text-zinc-300">{provider.rating_average?.toFixed(1) || "5.0"}</span><span className="text-sm text-zinc-500">({provider.reviews_count || 0})</span></div>
            {provider.rate_hourly && <span className="text-sm font-semibold text-rose-400">${provider.rate_hourly}/hr</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
