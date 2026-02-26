import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Calendar, MessageSquare, Star, TrendingUp, User, ExternalLink, Crown, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function ProviderDashboard() {
  const [user, setUser] = React.useState(null);
  const [provider, setProvider] = React.useState(null);

  React.useEffect(() => {
    const loadData = async () => {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      const providers = await base44.entities.Provider.filter({ user_id: currentUser.id });
      if (providers.length > 0) {
        setProvider(providers[0]);
      }
    };
    loadData();
  }, []);

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', provider?.id],
    queryFn: () => base44.entities.Booking.filter({ provider_id: provider.id }, '-created_date', 10),
    enabled: !!provider,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', provider?.id],
    queryFn: () => base44.entities.Message.filter({ provider_id: provider.id, is_read: false }, '-created_date', 10),
    enabled: !!provider,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', provider?.id],
    queryFn: () => base44.entities.Review.filter({ provider_id: provider.id }, '-created_date', 5),
    enabled: !!provider,
  });

  const pendingBookings = bookings.filter(b => b.status === 'pending').length;
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;
  const totalRevenue = bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + (b.total_amount || 0), 0);

  if (!user || !provider) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            {Array(4).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-8">
        <Card className="bg-zinc-900 border-zinc-800 max-w-md text-center">
          <CardContent className="pt-6">
            <User className="w-16 h-16 mx-auto mb-4 text-zinc-600" />
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">Create Your Profile</h2>
            <p className="text-zinc-400 mb-6">You don't have a provider profile yet. Create one to get started.</p>
            <Link to={createPageUrl("ProviderProfile")}>
              <Button className="bg-gradient-to-r from-rose-500 to-amber-500">
                Create Profile
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100 mb-2">Dashboard</h1>
            <p className="text-zinc-400">Welcome back, {provider.display_name}</p>
          </div>
          <div className="flex gap-3">
            <Link to={createPageUrl(`ViewProfile?id=${provider.id}`)} target="_blank">
              <Button variant="outline" className="border-zinc-700 text-zinc-300">
                <ExternalLink className="w-4 h-4 mr-2" />
                View Public Profile
              </Button>
            </Link>
            {!provider.is_premium && (
              <Button className="bg-gradient-to-r from-amber-500 to-orange-500">
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Premium
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Eye className="w-8 h-8 text-rose-400" />
                <span className="text-3xl font-bold text-zinc-100">{provider.views_count || 0}</span>
              </div>
              <p className="text-sm text-zinc-400">Profile Views</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
                <TrendingUp className="w-3 h-3" />
                <span>+12% this week</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Calendar className="w-8 h-8 text-amber-400" />
                <span className="text-3xl font-bold text-zinc-100">{pendingBookings + confirmedBookings}</span>
              </div>
              <p className="text-sm text-zinc-400">Active Bookings</p>
              <div className="mt-2 text-xs text-zinc-500">
                {pendingBookings} pending, {confirmedBookings} confirmed
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <MessageSquare className="w-8 h-8 text-blue-400" />
                <span className="text-3xl font-bold text-zinc-100">{messages.length}</span>
              </div>
              <p className="text-sm text-zinc-400">Unread Messages</p>
              {messages.length > 0 && (
                <div className="mt-2">
                  <Badge className="bg-blue-500/20 text-blue-400 border-0 text-xs">New</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-green-400" />
                <span className="text-3xl font-bold text-zinc-100">${totalRevenue}</span>
              </div>
              <p className="text-sm text-zinc-400">Total Revenue</p>
              <div className="mt-2 text-xs text-zinc-500">
                From completed bookings
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Bookings */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-zinc-100">Recent Bookings</CardTitle>
                <Link to={createPageUrl("ProviderBookings")}>
                  <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {bookings.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No bookings yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bookings.slice(0, 5).map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium text-zinc-100">{booking.client_name}</p>
                        <p className="text-sm text-zinc-400">
                          {format(new Date(booking.booking_date), 'MMM d, yyyy')} at {booking.booking_time}
                        </p>
                      </div>
                      <Badge
                        className={
                          booking.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-0' :
                          booking.status === 'confirmed' ? 'bg-green-500/20 text-green-400 border-0' :
                          booking.status === 'completed' ? 'bg-blue-500/20 text-blue-400 border-0' :
                          'bg-red-500/20 text-red-400 border-0'
                        }
                      >
                        {booking.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Messages */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-zinc-100">Recent Messages</CardTitle>
                <Link to={createPageUrl("ProviderMessages")}>
                  <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No unread messages</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.slice(0, 5).map((message) => (
                    <div key={message.id} className="border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between mb-1">
                        <p className="font-medium text-zinc-100">{message.sender_name}</p>
                        <Badge className="bg-blue-500/20 text-blue-400 border-0 text-xs">New</Badge>
                      </div>
                      <p className="text-sm text-zinc-400 mb-1">{message.subject}</p>
                      <p className="text-sm text-zinc-500 line-clamp-1">{message.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Reviews */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Recent Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <Star className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No reviews yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-zinc-100">{review.reviewer_name}</p>
                          <div className="flex">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${
                                  i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <Badge
                          className={
                            review.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-0 text-xs' :
                            review.status === 'approved' ? 'bg-green-500/20 text-green-400 border-0 text-xs' :
                            'bg-red-500/20 text-red-400 border-0 text-xs'
                          }
                        >
                          {review.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-400">{review.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Profile Status */}
          <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Profile Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Verification Status</span>
                {provider.is_verified ? (
                  <Badge className="bg-green-500/20 text-green-400 border-0">Verified</Badge>
                ) : (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-0">Pending</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Account Type</span>
                {provider.is_premium ? (
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 border-0">Premium</Badge>
                ) : (
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">Basic</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Profile Status</span>
                <Badge
                  className={
                    provider.status === 'active' ? 'bg-green-500/20 text-green-400 border-0' :
                    'bg-zinc-700 text-zinc-400 border-0'
                  }
                >
                  {provider.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Average Rating</span>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="font-medium text-zinc-100">
                    {provider.rating_average?.toFixed(1) || '5.0'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}