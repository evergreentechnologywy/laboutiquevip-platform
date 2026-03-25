// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Star, Shield, Crown, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { searchProviders } from "@/api/providerSearch";

export default function Home() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [locationQuery, setLocationQuery] = React.useState("");

  const { data: featuredProviders = [] } = useQuery({
    queryKey: ['featured-providers'],
    queryFn: async () => {
      const data = await searchProviders({
        premium: true,
        verified: true,
        limit: 6,
      });
      return data.items || [];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.append('q', searchQuery);
    if (locationQuery) params.append('location', locationQuery);
    window.location.href = createPageUrl(`Browse?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-950/20 via-zinc-950 to-amber-950/20" />
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-rose-500 to-amber-500 rounded-xl flex items-center justify-center shadow-2xl shadow-rose-500/25">
                <Crown className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-5xl sm:text-7xl font-bold mb-2">
              <span className="bg-gradient-to-r from-rose-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
                La Boutique Vip
              </span>
            </h1>
            <p className="text-2xl sm:text-3xl font-semibold text-zinc-500 mb-6">International</p>
            <p className="text-xl sm:text-2xl text-zinc-400 mb-12 max-w-3xl mx-auto">
              Discover polished, verified profiles with clear rates, direct contact options, and discreet enquiry tools.
            </p>

            {/* Search Box */}
            <div className="max-w-4xl mx-auto bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6 shadow-2xl">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <Input
                      placeholder="Search by name, services, or features..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      className="pl-12 h-14 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-rose-500 focus:ring-rose-500"
                    />
                  </div>
                </div>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <Input
                    placeholder="City or location..."
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-12 h-14 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-rose-500 focus:ring-rose-500"
                  />
                </div>
              </div>
              <Button
                onClick={handleSearch}
                className="w-full mt-4 h-14 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-semibold text-lg shadow-lg hover:shadow-rose-500/25 transition-all"
              >
                Search Now
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-left">
          <p className="text-sm font-medium text-amber-100 mb-2">Adults only · trust & transparency</p>
          <p className="text-sm text-zinc-300 leading-6">
            This platform is intended only for adults 18+. Verification and featured placement are subject to review. Any premium placement, verification status, or billing-related benefits should be treated as active only after platform confirmation.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm hover:border-rose-500/50 transition-all">
            <div className="w-16 h-16 bg-gradient-to-br from-rose-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/20">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-100">Verified Profiles</h3>
            <p className="text-zinc-400">All providers are verified for authenticity and safety</p>
          </div>

          <div className="text-center p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm hover:border-amber-500/50 transition-all">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-100">Premium Experience</h3>
            <p className="text-zinc-400">Curated selection of elite companions</p>
          </div>

          <div className="text-center p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm hover:border-pink-500/50 transition-all">
            <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-pink-500/20">
              <Star className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-zinc-100">Trusted Reviews</h3>
            <p className="text-zinc-400">Authentic reviews from verified clients</p>
          </div>
        </div>
      </div>

      {/* Featured Providers */}
      {featuredProviders.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-zinc-100 mb-2">Featured Companions</h2>
              <p className="text-zinc-400">Premium verified profiles</p>
            </div>
            <Link to={createPageUrl("Browse")}>
              <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:border-rose-500 hover:text-rose-400">
                View All
                <TrendingUp className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredProviders.map((provider) => (
              <Link
                key={provider.id}
                to={createPageUrl(`ViewProfile?id=${provider.id}`)}
                className="group"
              >
                <div className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-rose-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-rose-500/10">
                  <div className="aspect-[3/4] overflow-hidden bg-zinc-800">
                    {provider.photos?.[0] ? (
                      <img
                        src={provider.photos[0]}
                        alt={provider.display_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Crown className="w-16 h-16 text-zinc-700" />
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-xl font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors">
                          {provider.display_name}
                        </h3>
                        <p className="text-sm text-zinc-400">
                          {provider.location_city}, {provider.location_state}
                        </p>
                      </div>
                      {provider.is_verified && (
                        <div className="bg-rose-500/20 p-2 rounded-lg">
                          <Shield className="w-4 h-4 text-rose-400" />
                        </div>
                      )}
                    </div>

                    {provider.tagline && (
                      <p className="text-sm text-zinc-500 mb-4 line-clamp-2">
                        {provider.tagline}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-medium text-zinc-300">
                          {provider.rating_average?.toFixed(1) || '5.0'}
                        </span>
                        <span className="text-sm text-zinc-500">
                          ({provider.reviews_count || 0})
                        </span>
                      </div>
                      {provider.rate_hourly && (
                        <span className="text-sm font-semibold text-rose-400">
                          ${provider.rate_hourly}/hr
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-950/50 to-amber-950/50 border border-zinc-800 p-12 sm:p-16 text-center">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?w=1200')] opacity-5 bg-cover bg-center" />
          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-bold mb-6 bg-gradient-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">
              Are You a Provider?
            </h2>
            <p className="text-xl text-zinc-300 mb-8 max-w-2xl mx-auto">
              Join La Boutique Vip International and connect with discerning clients
            </p>
            <Button
              onClick={() => base44.auth.redirectToLogin(createPageUrl("ProviderSignup"))}
              className="h-14 px-8 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-semibold text-lg shadow-xl hover:shadow-rose-500/25 transition-all"
            >
              Get Started Today
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
