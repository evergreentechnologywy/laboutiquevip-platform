// @ts-nocheck
import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, UserCheck, UserX, Clock, TrendingUp, Eye, Star, Shield, AlertCircle, CheckCircle, XCircle, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function AdminDashboard() {
  const [user, setUser] = React.useState(null);
  const [selectedProvider, setSelectedProvider] = React.useState(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [adminNotes, setAdminNotes] = React.useState("");
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const loadUser = async () => {
      const currentUser = await base44.auth.me();
      if (currentUser.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setUser(currentUser);
    };
    loadUser();
  }, []);

  const { data: allProviders = [], isLoading } = useQuery({
    queryKey: ['all-providers'],
    queryFn: () => base44.entities.Provider.list('-created_date', 1000),
    enabled: !!user,
  });

  const { data: allReviews = [] } = useQuery({
    queryKey: ['all-reviews'],
    queryFn: () => base44.entities.Review.list('-created_date', 1000),
    enabled: !!user,
  });

  const approveMutation = useMutation({
    /** @param {{ id: string, notes: string }} variables */
    mutationFn: ({ id, notes }) => base44.entities.Provider.update(id, {
      status: 'active',
      is_verified: true,
      is_profile_approved: true,
      admin_notes: notes
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-providers'] });
      setSelectedProvider(null);
      setAdminNotes("");
    },
  });

  const approvePhotosMutation = useMutation({
    /** @param {{ id: string, pendingPhotos?: string[], currentPhotos?: string[] }} variables */
    mutationFn: ({ id, pendingPhotos, currentPhotos }) => base44.entities.Provider.update(id, {
      photos: [...(currentPhotos || []), ...(pendingPhotos || [])],
      pending_photos: [],
      status: 'active'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-providers'] });
      setSelectedProvider(null);
    },
  });

  const rejectMutation = useMutation({
    /** @param {{ id: string, reason: string, notes: string }} variables */
    mutationFn: ({ id, reason, notes }) => base44.entities.Provider.update(id, {
      status: 'rejected',
      rejection_reason: reason,
      admin_notes: notes
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-providers'] });
      setSelectedProvider(null);
      setRejectionReason("");
      setAdminNotes("");
    },
  });

  const suspendMutation = useMutation({
    /** @param {{ id: string, notes: string }} variables */
    mutationFn: ({ id, notes }) => base44.entities.Provider.update(id, {
      status: 'suspended',
      admin_notes: notes
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-providers'] });
      setSelectedProvider(null);
    },
  });

  const pendingProviders = allProviders.filter(p => p.status === 'pending_verification' || p.status === 'pending_photos');
  const activeProviders = allProviders.filter(p => p.status === 'active');
  const suspendedProviders = allProviders.filter(p => p.status === 'suspended');
  const pendingReviews = allReviews.filter(r => r.status === 'pending');

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Skeleton className="w-64 h-32" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">Admin Dashboard</h1>
          <p className="text-zinc-400">Manage providers, approvals, and platform overview</p>
        </div>

        {/* Stats Overview */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8 text-yellow-400" />
                <span className="text-3xl font-bold text-zinc-100">{pendingProviders.length}</span>
              </div>
              <p className="text-sm text-zinc-400">Pending Approvals</p>
              {pendingProviders.length > 0 && (
                <Badge className="mt-2 bg-yellow-500/20 text-yellow-400 border-0">Needs Action</Badge>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <UserCheck className="w-8 h-8 text-green-400" />
                <span className="text-3xl font-bold text-zinc-100">{activeProviders.length}</span>
              </div>
              <p className="text-sm text-zinc-400">Active Providers</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
                <TrendingUp className="w-3 h-3" />
                <span>Platform growth</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Shield className="w-8 h-8 text-blue-400" />
                <span className="text-3xl font-bold text-zinc-100">{allProviders.filter(p => p.is_verified).length}</span>
              </div>
              <p className="text-sm text-zinc-400">Verified Providers</p>
              <p className="text-xs text-zinc-600 mt-2">Approved and verified listings</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Star className="w-8 h-8 text-amber-400" />
                <span className="text-3xl font-bold text-zinc-100">{pendingReviews.length}</span>
              </div>
              <p className="text-sm text-zinc-400">Pending Reviews</p>
              <p className="text-xs text-zinc-600 mt-2">Need moderation</p>
            </CardContent>
          </Card>
        </div>

        {/* Provider Management Tabs */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="pending" className="data-[state=active]:bg-zinc-800">
              Pending ({pendingProviders.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-zinc-800">
              Active ({activeProviders.length})
            </TabsTrigger>
            <TabsTrigger value="suspended" className="data-[state=active]:bg-zinc-800">
              Suspended ({suspendedProviders.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800">
              All Providers ({allProviders.length})
            </TabsTrigger>
          </TabsList>

          {/* Pending Providers */}
          <TabsContent value="pending">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  Pending Provider Approvals
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingProviders.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingProviders.map((provider) => (
                      <ProviderCard
                        key={provider.id}
                        provider={provider}
                        onSelect={setSelectedProvider}
                        showActions={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Active Providers */}
          <TabsContent value="active">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Active Providers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeProviders.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onSelect={setSelectedProvider}
                      showActions={false}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Suspended Providers */}
          <TabsContent value="suspended">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Suspended Providers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {suspendedProviders.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onSelect={setSelectedProvider}
                      showActions={false}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* All Providers */}
          <TabsContent value="all">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">All Providers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {allProviders.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onSelect={setSelectedProvider}
                      showActions={false}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Provider Detail Dialog */}
        <Dialog open={!!selectedProvider} onOpenChange={() => setSelectedProvider(null)}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Provider Profile</DialogTitle>
            </DialogHeader>
            {selectedProvider && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-400 text-sm">Display Name</Label>
                    <p className="font-medium text-zinc-100">{selectedProvider.display_name}</p>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-sm">Location</Label>
                    <p className="font-medium text-zinc-100">
                      {selectedProvider.location_city}, {selectedProvider.location_state}
                    </p>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-sm">Email</Label>
                    <p className="font-medium text-zinc-100">{selectedProvider.email}</p>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-sm">Phone</Label>
                    <p className="font-medium text-zinc-100">{selectedProvider.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-sm">Ad Package</Label>
                    <Badge className={
                      selectedProvider.ad_package === 'premium' ? 'bg-amber-500/20 text-amber-400 border-0' :
                      selectedProvider.ad_package === 'featured' ? 'bg-rose-500/20 text-rose-400 border-0' :
                      selectedProvider.ad_package === 'basic' ? 'bg-blue-500/20 text-blue-400 border-0' :
                      'bg-zinc-700 text-zinc-400 border-0'
                    }>
                      {selectedProvider.ad_package || 'none'}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-sm">Status</Label>
                    <Badge className={
                      selectedProvider.status === 'active' ? 'bg-green-500/20 text-green-400 border-0' :
                      selectedProvider.status === 'pending_verification' ? 'bg-yellow-500/20 text-yellow-400 border-0' :
                      'bg-red-500/20 text-red-400 border-0'
                    }>
                      {selectedProvider.status}
                    </Badge>
                  </div>
                </div>

                {selectedProvider.bio && (
                  <div>
                    <Label className="text-zinc-400 text-sm">Bio</Label>
                    <p className="text-zinc-300 mt-1">{selectedProvider.bio}</p>
                  </div>
                )}

                {selectedProvider.verification_documents?.length > 0 && (
                  <div>
                    <Label className="text-zinc-400 text-sm mb-2 block">Verification Documents</Label>
                    <div className="flex gap-2 flex-wrap">
                      {selectedProvider.verification_documents.map((doc, index) => (
                        <a
                          key={index}
                          href={doc}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <FileText className="w-4 h-4" />
                          Document {index + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {selectedProvider.pending_photos?.length > 0 && (
                  <div>
                    <Label className="text-zinc-400 text-sm mb-2 block">Pending Photos for Approval</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedProvider.pending_photos.map((photo, index) => (
                        <img
                          key={index}
                          src={photo}
                          alt={`Pending photo ${index + 1}`}
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {selectedProvider.photos?.length > 0 && (
                  <div>
                    <Label className="text-zinc-400 text-sm mb-2 block">Approved Photos</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedProvider.photos.map((photo, index) => (
                        <img
                          key={index}
                          src={photo}
                          alt={`Approved photo ${index + 1}`}
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-zinc-400 text-sm">Admin Notes</Label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                    rows={3}
                    placeholder="Add internal notes..."
                  />
                </div>

                {selectedProvider.status === 'pending_photos' && (
                  <DialogFooter>
                    <Button
                      className="bg-gradient-to-r from-green-500 to-emerald-500"
                      onClick={() => approvePhotosMutation.mutate({
                        id: selectedProvider.id,
                        pendingPhotos: selectedProvider.pending_photos,
                        currentPhotos: selectedProvider.photos
                      })}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve Photos
                    </Button>
                  </DialogFooter>
                )}

                {selectedProvider.status === 'pending_verification' && (
                  <>
                    <div>
                      <Label className="text-zinc-400 text-sm">Rejection Reason (if rejecting)</Label>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                        rows={3}
                        placeholder="Reason for rejection..."
                      />
                    </div>
                    <DialogFooter className="flex gap-3">
                      <Button
                        variant="outline"
                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        onClick={() => rejectMutation.mutate({
                          id: selectedProvider.id,
                          reason: rejectionReason,
                          notes: adminNotes
                        })}
                        disabled={!rejectionReason}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        className="bg-gradient-to-r from-green-500 to-emerald-500"
                        onClick={() => approveMutation.mutate({
                          id: selectedProvider.id,
                          notes: adminNotes
                        })}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve Profile
                      </Button>
                    </DialogFooter>
                  </>
                )}

                {selectedProvider.status === 'active' && (
                  <DialogFooter>
                    <Button
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                      onClick={() => suspendMutation.mutate({
                        id: selectedProvider.id,
                        notes: adminNotes
                      })}
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Suspend Account
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function ProviderCard({ provider, onSelect, showActions }) {
  return (
    <div className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-medium text-zinc-100">{provider.display_name}</h3>
          <Badge className={
            provider.status === 'active' ? 'bg-green-500/20 text-green-400 border-0 text-xs' :
            provider.status === 'pending_verification' ? 'bg-yellow-500/20 text-yellow-400 border-0 text-xs' :
            provider.status === 'suspended' ? 'bg-red-500/20 text-red-400 border-0 text-xs' :
            'bg-gray-500/20 text-gray-400 border-0 text-xs'
          }>
            {provider.status}
          </Badge>
          <Badge className={
            provider.ad_package === 'premium' ? 'bg-amber-500/20 text-amber-400 border-0 text-xs' :
            provider.ad_package === 'featured' ? 'bg-rose-500/20 text-rose-400 border-0 text-xs' :
            provider.ad_package === 'basic' ? 'bg-blue-500/20 text-blue-400 border-0 text-xs' :
            'bg-zinc-700 text-zinc-400 border-0 text-xs'
          }>
            {provider.ad_package || 'free'}
          </Badge>
        </div>
        <p className="text-sm text-zinc-400">
          {provider.location_city}, {provider.location_state} • {provider.email}
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Created {format(new Date(provider.created_date), 'MMM d, yyyy')}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSelect(provider)}
        className="border-zinc-700 text-zinc-300"
      >
        {showActions ? 'Review' : 'View Details'}
      </Button>
    </div>
  );
}
