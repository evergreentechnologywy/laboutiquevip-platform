// @ts-nocheck
import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Crown,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Save,
  Shield,
  Star,
  TrendingUp,
  User,
} from "lucide-react";
import { stateOptions, cityOptionsForState, OTHER_CITY_OPTION } from "@/lib/locationOptions";
import { knownHostAffiliateUrl, stripeAffiliateUrl } from "@/lib/affiliateLinks";
import { adPackages, getAdPackageById, formatPackagePrice, getPackageProductSku } from "@/lib/adPackages";
import { getPackageLifecycleDisplay } from "@/lib/packageLifecycle";
import { normalizeOptionalUrl } from "@/lib/providerPresentation";
import {
  DIRECTORY_LINK_FIELDS,
  buildSocialMediaPayload,
  emptySocialMedia,
  SOCIAL_LINK_FIELDS,
  socialMediaFromProvider,
} from "@/lib/socialLinks";
import { SEO } from "@/components/SEO";
import AdvertisingCopilot from "@/components/AdvertisingCopilot";
import { RequireRole } from "@/components/RequireRole";

const emptyProfile = {
  display_name: "",
  tagline: "",
  bio: "",
  location_city: "",
  location_state: "",
  location_country: "USA",
  age: "",
  phone: "",
  email: "",
  verification_provider: "",
  verification_username: "",
  verification_url: "",
  review_provider: "",
  review_username: "",
  review_url: "",
  video_url: "",
  p411_url: "",
  p411_id: "",
  ter_url: "",
  pd_url: "",
  tob_url: "",
  social_media: emptySocialMedia(),
  rate_hourly: "",
  ad_package: "none",
};

const MAX_PROVIDER_PHOTOS = 8;

function normalizeOptionalString(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getInitialTab() {
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") || "overview";
}

function setTabInUrl(tab) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url.toString());
}

function formatMoney(amountCents, currency = "USD") {
  const amount = typeof amountCents === "number" ? amountCents / 100 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatOrderDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ProviderDashboard() {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState(getInitialTab);
  const [user, setUser] = React.useState(null);
  const [provider, setProvider] = React.useState(null);
  const [formData, setFormData] = React.useState(emptyProfile);
  const [uploading, setUploading] = React.useState(false);
  const [cityChoice, setCityChoice] = React.useState(OTHER_CITY_OPTION);
  const [error, setError] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState({ type: "", message: "" });
  const [billingPeriod, setBillingPeriod] = React.useState("weekly");
  const [checkoutStatus, setCheckoutStatus] = React.useState({ type: "", message: "" });
  const advertiserToolLinks = React.useMemo(
    () =>
      [
        {
          key: "stripe",
          href: stripeAffiliateUrl(),
          title: "Accept card payments",
          description: "Stripe — fast setup, global reach",
          iconClassName: "bg-indigo-500/20 text-indigo-400",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        },
        {
          key: "knownhost",
          href: knownHostAffiliateUrl(),
          title: "Host your own site",
          description: "KnownHost — adult-friendly, fast, reliable",
          iconClassName: "bg-emerald-500/20 text-emerald-400",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          ),
        },
      ].filter((link) => Boolean(link.href)),
    [],
  );

  React.useEffect(() => {
    setTabInUrl(tab);
  }, [tab]);

  React.useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);

        const providers = await base44.entities.Provider.filter({ user_id: currentUser.id });
        if (providers.length > 0) {
          const currentProvider = providers[0];
          setProvider(currentProvider);
          setFormData({
            ...emptyProfile,
            ...currentProvider,
            social_media: socialMediaFromProvider(currentProvider),
            age: currentProvider.age ?? "",
            rate_hourly: currentProvider.rate_hourly ?? "",
          });
          setSaveStatus({ type: "", message: "" });
        }
      } catch (err) {
        setError("Unable to load your dashboard right now.");
      }
    };

    loadData();
  }, []);

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", provider?.id],
    queryFn: () => base44.entities.Review.filter({ provider_id: provider.id }, "-created_date", 20),
    enabled: !!provider,
  });

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["orders", user?.id],
    queryFn: () => base44.orders.list(),
    enabled: !!user,
  });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentState = params.get("payment");
    if (paymentState === "success") {
      setCheckoutStatus({
        type: "success",
        message: "Payment callback received. We are confirming your package activation now.",
      });
      refetchOrders();
    } else if (paymentState === "cancelled") {
      setCheckoutStatus({
        type: "error",
        message: "Payment was cancelled. You can restart checkout whenever you're ready.",
      });
    }
  }, [refetchOrders]);

  const syncProviderState = React.useCallback((savedProvider) => {
    setProvider(savedProvider);
    setFormData({
      ...emptyProfile,
      ...savedProvider,
      social_media: socialMediaFromProvider(savedProvider),
      age: savedProvider.age ?? "",
      rate_hourly: savedProvider.rate_hourly ?? "",
    });
    queryClient.invalidateQueries({ queryKey: ["reviews", savedProvider.id] });
    queryClient.invalidateQueries({ queryKey: ["providers"] });
  }, [queryClient]);

  const saveMutation = useMutation({
    /** @param {typeof emptyProfile & { pending_photos?: string[], verification_documents?: string[] }} payload */
    mutationFn: async (payload) => {
      if (!provider) {
        return base44.entities.Provider.create({
          ...payload,
          user_id: user.id,
          pending_photos: [],
          verification_documents: [],
        });
      }
      return base44.entities.Provider.update(provider.id, payload);
    },
    onSuccess: (savedProvider) => {
      syncProviderState(savedProvider);
      setError("");
      setSaveStatus({
        type: "success",
        message: provider ? "Changes saved successfully." : "Listing created successfully.",
      });
    },
    onError: (err) => {
      const message = err?.data?.message || err?.message || "Could not save your profile.";
      setError(message);
      setSaveStatus({ type: "error", message });
    },
  });

  const visibilityMutation = useMutation({
    /** @param {string} nextStatus */
    mutationFn: async (nextStatus) => {
      if (!provider) throw new Error("Create your listing before changing visibility.");
      return base44.entities.Provider.update(provider.id, { status: nextStatus });
    },
    onSuccess: (savedProvider) => {
      syncProviderState(savedProvider);
      setSaveStatus({
        type: "success",
        message: savedProvider.status === "paused"
          ? "Your ad is now hidden from public browse results."
          : "Your ad is live again."
      });
      setError("");
    },
    onError: (err) => {
      const message = err?.data?.message || err?.message || "Could not update ad visibility.";
      setError(message);
      setSaveStatus({ type: "error", message });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ productSku }) => base44.orders.create({
      productSku,
      currency: "USD",
      metadata: {
        source: "provider_dashboard",
        billingPeriod,
      },
    }),
    onSuccess: async (order) => {
      await refetchOrders();
      if (order.paymentUrl) {
        setCheckoutStatus({ type: "success", message: "Payment link created. Redirecting to NOWPayments." });
        window.location.href = order.paymentUrl;
        return;
      }
      if (order?.paymentError) {
        setCheckoutStatus({
          type: "error",
          message: order.paymentError,
        });
        return;
      }
      setCheckoutStatus({
        type: "error",
        message: "Payment link could not be generated. Please try again or contact support.",
      });
    },
    onError: (err) => {
      const message = err?.data?.message || err?.data?.error || err?.message || "Could not start package checkout.";
      setCheckoutStatus({ type: "error", message });
    },
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSocialChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      social_media: {
        ...(prev.social_media && typeof prev.social_media === "object" ? prev.social_media : emptySocialMedia()),
        [key]: value,
      },
    }));
  };

  const handleSaveProfile = () => {
    if (!user) return;

    if (!formData.display_name.trim() || !formData.location_city.trim() || !formData.location_state.trim()) {
      const message = "Display name, state, and city are required.";
      setError(message);
      setSaveStatus({ type: "error", message });
      return;
    }

    const payload = {
      ...formData,
      display_name: formData.display_name.trim(),
      tagline: normalizeOptionalString(formData.tagline),
      bio: normalizeOptionalString(formData.bio),
      location_city: formData.location_city.trim(),
      location_state: formData.location_state.trim(),
      location_country: normalizeOptionalString(formData.location_country) ?? "USA",
      age: normalizeOptionalNumber(formData.age),
      phone: normalizeOptionalString(formData.phone),
      email: normalizeOptionalString(formData.email),
      verification_provider: normalizeOptionalString(formData.verification_provider),
      verification_username: normalizeOptionalString(formData.verification_username),
      verification_url: normalizeOptionalUrl(formData.verification_url),
      review_provider: normalizeOptionalString(formData.review_provider),
      review_username: normalizeOptionalString(formData.review_username),
      review_url: normalizeOptionalUrl(formData.review_url),
      video_url: normalizeOptionalUrl(formData.video_url),
      p411_url: normalizeOptionalUrl(formData.p411_url),
      p411_id: normalizeOptionalString(formData.p411_id),
      ter_url: normalizeOptionalUrl(formData.ter_url),
      pd_url: normalizeOptionalUrl(formData.pd_url),
      tob_url: normalizeOptionalUrl(formData.tob_url),
      social_media: buildSocialMediaPayload(formData.social_media, provider?.social_media),
      rate_hourly: normalizeOptionalNumber(formData.rate_hourly),
      photos: Array.isArray(formData.photos) ? formData.photos.filter(Boolean).slice(0, MAX_PROVIDER_PHOTOS) : [],
      pending_photos: Array.isArray(formData.pending_photos)
        ? formData.pending_photos.filter(Boolean).slice(0, MAX_PROVIDER_PHOTOS)
        : [],
    };

    setError("");
    setSaveStatus({ type: "", message: "" });
    saveMutation.mutate(payload);
  };

  const handleStartCheckout = () => {
    const selectedPackage = getAdPackageById(formData.ad_package);
    const productSku = getPackageProductSku(selectedPackage, billingPeriod);
    if (!productSku) {
      setCheckoutStatus({ type: "error", message: "Select a paid package before continuing to payment." });
      return;
    }

    setCheckoutStatus({ type: "", message: "" });
    checkoutMutation.mutate({ productSku });
  };

  const handlePhotoUpload = async (event) => {
    if (!provider) {
      setError("Save your profile before uploading photos.");
      return;
    }

    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const approvedCount = Array.isArray(provider.photos) ? provider.photos.length : 0;
    const pendingCount = Array.isArray(provider.pending_photos) ? provider.pending_photos.length : 0;
    const currentTotalPhotos = approvedCount + pendingCount;
    const remainingSlots = MAX_PROVIDER_PHOTOS - currentTotalPhotos;
    if (remainingSlots <= 0) {
      setError(`You can keep up to ${MAX_PROVIDER_PHOTOS} total photos on your profile.`);
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError("");

    try {
      const filesToUpload = files.slice(0, remainingSlots);
      const uploadedUrls = [];
      for (const file of filesToUpload) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploadedUrls.push(file_url);
      }

      const nextPendingPhotos = [...(provider.pending_photos || []), ...uploadedUrls]
        .filter(Boolean)
        .slice(0, Math.max(0, MAX_PROVIDER_PHOTOS - approvedCount));
      const updated = await base44.entities.Provider.update(provider.id, {
        pending_photos: nextPendingPhotos,
        status: provider.is_profile_approved ? provider.status : "pending_verification",
      });
      setProvider(updated);
      setFormData((prev) => ({ ...prev, pending_photos: updated.pending_photos || [] }));
      setSaveStatus({
        type: "success",
        message:
          filesToUpload.length < files.length
            ? `Uploaded ${filesToUpload.length} photo(s). Max ${MAX_PROVIDER_PHOTOS} photos are allowed.`
            : "Photos uploaded and queued for review.",
      });
    } catch (err) {
      setError(err?.data?.message || err?.message || "Photo upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const availableCities = React.useMemo(() => cityOptionsForState(formData.location_state), [formData.location_state]);

  React.useEffect(() => {
    if (availableCities.includes(formData.location_city)) {
      setCityChoice(formData.location_city);
    } else {
      setCityChoice(OTHER_CITY_OPTION);
    }
  }, [availableCities, formData.location_city]);

  const packageLifecycle = getPackageLifecycleDisplay(provider);
  const selectedPackage = getAdPackageById(formData.ad_package);
  const selectedProductSku = getPackageProductSku(selectedPackage, billingPeriod);
  const providerBillingBlocked = provider?.status === "rejected" || provider?.status === "suspended";

  return (
    <RequireRole roles={["provider", "admin", "agency"]} loginNext="/providerdashboard">
      {!user && !error ? (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
      ) : error && !user ? (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-8">
        <Card className="bg-zinc-900 border-zinc-800 max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-zinc-200 font-medium">Dashboard unavailable</p>
            <p className="text-zinc-400 mt-2">{error}</p>
          </CardContent>
        </Card>
      </div>
      ) : (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <SEO title="Provider Dashboard | La Boutique VIP International" noindex />
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-100 mb-2">Provider dashboard</h1>
            <p className="text-zinc-400">
              {provider ? `Welcome back, ${provider.display_name}.` : "Create and manage your public listing."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {provider && (
              <>
                <Link to={createPageUrl(`ViewProfile?id=${provider.id}`)} target="_blank">
                  <Button variant="outline" className="border-zinc-700 text-zinc-300">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View public profile
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                  disabled={visibilityMutation.isPending || !provider.is_profile_approved}
                  onClick={() => visibilityMutation.mutate(provider.status === "paused" ? "active" : "paused")}
                >
                  {visibilityMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : provider.status === "paused" ? (
                    <Eye className="w-4 h-4 mr-2" />
                  ) : (
                    <EyeOff className="w-4 h-4 mr-2" />
                  )}
                  {provider.status === "paused" ? "Reactivate ad" : "Hide ad temporarily"}
                </Button>
              </>
            )}
            <Button
              onClick={handleSaveProfile}
              disabled={saveMutation.isPending || !user}
              className="bg-gradient-to-r from-rose-500 to-amber-500"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {provider ? "Save changes" : "Create listing"}
            </Button>
          </div>
        </div>

        {saveStatus.message ? (
          <Card className={saveStatus.type === "success" ? "bg-emerald-950/30 border-emerald-500/20" : "bg-red-950/30 border-red-500/20"}>
            <CardContent className={`pt-6 ${saveStatus.type === "success" ? "text-emerald-200" : "text-red-200"}`}>
              {saveStatus.message}
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="bg-red-950/30 border-red-500/20">
            <CardContent className="pt-6 text-red-200">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={Eye} label="Profile views" value={provider?.views_count || 0} hint="Public profile traffic" />
          <StatCard icon={Shield} label="Listing status" value={provider?.status || "draft"} hint="Approval and moderation state" />
          <StatCard icon={ImagePlus} label="Pending photos" value={(provider?.pending_photos || []).length} hint="Awaiting manual review" />
          <StatCard icon={Star} label="Reviews" value={reviews.length} hint="Published feedback count" />
        </div>

        <PackageLifecycleBanner display={packageLifecycle} />

        <Card className="bg-blue-950/20 border-blue-500/20">
          <CardContent className="pt-6 text-sm text-blue-100 space-y-2">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 mt-0.5 text-blue-300" />
              <div className="space-y-2">
                <p className="font-medium">How approval works</p>
                <p>ID verification automatically approves your profile and enables your listing once it succeeds.</p>
                <p>Photo uploads are reviewed separately and stay in the pending queue until approved by the platform team.</p>
                <p>Ad text is screened automatically and explicit language may be blocked or require edits before publication.</p>
                <p>You can hide an approved ad temporarily at any time without losing your profile data or approval status.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="bg-zinc-900 border border-zinc-800 flex flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="ads">Advertisement</TabsTrigger>
            <TabsTrigger value="copilot">AI Copilot</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-zinc-100">Listing status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StatusRow label="Listing status" value={provider?.status === "active" ? "Live" : provider?.status === "paused" ? "Hidden temporarily" : provider?.status || "draft"} tone={provider?.status === "active" ? "success" : provider?.status === "rejected" ? "danger" : provider?.status === "paused" ? "default" : "warning"} />
                  <StatusRow label="ID verification" value={provider?.is_verified ? "Approved" : "Approval pending"} tone={provider?.is_verified ? "success" : "warning"} />
                  <StatusRow label="Photo review" value={(provider?.pending_photos?.length || 0) > 0 ? `${provider?.pending_photos?.length} pending` : (provider?.photos?.length || 0) > 0 ? "Approved" : "No photos uploaded"} tone={(provider?.pending_photos?.length || 0) > 0 ? "warning" : (provider?.photos?.length || 0) > 0 ? "success" : "default"} />
                  <StatusRow label="Ad package" value={packageLifecycle.packageName} tone={provider?.is_premium ? "premium" : "default"} />
                  <StatusRow label="Package started" value={packageLifecycle.startedLabel} tone="default" />
                  <StatusRow label="Package expires" value={packageLifecycle.expiresLabel} tone={packageLifecycle.tone} />
                  <StatusRow label="Average rating" value={provider?.rating_average?.toFixed(1) || "0.0"} tone="default" />
                  {provider?.rejection_reason ? (
                    <div className="rounded-lg bg-red-950/30 border border-red-500/20 p-4">
                      <p className="text-sm text-red-200 font-medium">Latest rejection reason</p>
                      <p className="text-sm text-red-100/90 mt-1">{provider.rejection_reason}</p>
                    </div>
                  ) : null}
                  {provider?.admin_notes ? (
                    <div className="rounded-lg bg-zinc-800 border border-zinc-700 p-4">
                      <p className="text-sm text-zinc-300 font-medium">Admin notes</p>
                      <p className="text-sm text-zinc-400 mt-1">{provider.admin_notes}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-zinc-100">Recent reviews</CardTitle>
                </CardHeader>
                <CardContent>
                  {reviews.length === 0 ? (
                    <EmptyState icon={Star} title="No reviews yet" description="Client reviews will show up here once they are submitted." />
                  ) : (
                    <div className="space-y-4">
                      {reviews.slice(0, 5).map((review) => (
                        <div key={review.id} className="border-b border-zinc-800 pb-4 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-100">{review.reviewer_name || "Anonymous"}</span>
                              <Badge className="bg-zinc-800 text-zinc-300 border-0">{review.status}</Badge>
                            </div>
                            <span className="text-sm text-amber-400">{review.rating}/5</span>
                          </div>
                          <p className="text-sm text-zinc-400">{review.comment || "No written feedback."}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Advertiser tools — affiliate section with payment processing + hosting */}
          {advertiserToolLinks.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800 mb-6">
            <CardHeader>
              <CardTitle className="text-zinc-100 text-base">Tools &amp; services for your business</CardTitle>
              <CardDescription className="text-zinc-400">Services to help you grow your brand and accept payments.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                {advertiserToolLinks.map(({ key, href, title, description, iconClassName, icon }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="nofollow sponsored"
                    className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 transition hover:border-zinc-600 hover:bg-zinc-800"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClassName}`}>
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100">{title}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
          )}

          <TabsContent value="profile">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Manage profile</CardTitle>
                <CardDescription className="text-zinc-400">Edit your public listing, contact details, and external trust references.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <Field label="Display name *"><Input value={formData.display_name} onChange={(e) => handleChange("display_name", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></Field>
                  <Field label="Tagline"><Input value={formData.tagline || ""} onChange={(e) => handleChange("tagline", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></Field>
                </div>

                <Field label="Bio"><Textarea value={formData.bio || ""} onChange={(e) => handleChange("bio", e.target.value)} rows={5} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></Field>

                <div className="grid md:grid-cols-3 gap-6">
                  <Field label="State *">
                    <Select value={formData.location_state || undefined} onValueChange={(value) => {
                      handleChange("location_state", value);
                      handleChange("location_city", "");
                      setCityChoice(OTHER_CITY_OPTION);
                    }}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                        <SelectValue placeholder="Select a state" />
                      </SelectTrigger>
                      <SelectContent>
                        {stateOptions.map((state) => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="City *">
                    {availableCities.length > 0 ? (
                      <div className="space-y-3">
                        <Select
                          value={availableCities.includes(formData.location_city) ? formData.location_city : cityChoice}
                          onValueChange={(value) => {
                            setCityChoice(value);
                            handleChange("location_city", value === OTHER_CITY_OPTION ? "" : value);
                          }}
                        >
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                            <SelectValue placeholder="Select a city" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableCities.map((city) => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                            <SelectItem value={OTHER_CITY_OPTION}>{OTHER_CITY_OPTION}</SelectItem>
                          </SelectContent>
                        </Select>
                        {cityChoice === OTHER_CITY_OPTION && (
                          <Input value={formData.location_city || ""} onChange={(e) => handleChange("location_city", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="Enter another city" />
                        )}
                      </div>
                    ) : (
                      <Input value={formData.location_city || ""} onChange={(e) => handleChange("location_city", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="Enter city" />
                    )}
                  </Field>
                  <Field label="Country"><Input value={formData.location_country || ""} onChange={(e) => handleChange("location_country", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="Optional country" /></Field>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  <Field label="Age"><Input type="number" value={formData.age} onChange={(e) => handleChange("age", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" min={18} /></Field>
                  <Field label="Phone"><Input value={formData.phone || ""} onChange={(e) => handleChange("phone", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></Field>
                  <Field label="Public email"><Input type="email" value={formData.email || ""} onChange={(e) => handleChange("email", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" /></Field>
                </div>

                <div className="grid md:grid-cols-1 gap-6">
                  <Field label="Hourly rate"><Input type="number" value={formData.rate_hourly} onChange={(e) => handleChange("rate_hourly", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" min={0} /></Field>
                </div>

                <div className="grid md:grid-cols-1 gap-6">
                  <Field label="Video URL (YouTube, Vimeo, etc.)"><Input value={formData.video_url || ""} onChange={(e) => handleChange("video_url", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="https://www.youtube.com/watch?v=..." /></Field>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-6">
                  <div>
                    <h3 className="font-medium text-zinc-100">Social & messaging links</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      Add public social profiles and messaging links shown on your listing — Instagram, OnlyFans, WhatsApp, Telegram, Linktree, and similar.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {SOCIAL_LINK_FIELDS.map(({ key, label, placeholder }) => (
                      <Field key={key} label={label}>
                        <Input
                          value={formData.social_media?.[key] || ""}
                          onChange={(e) => handleSocialChange(key, e.target.value)}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100"
                          placeholder={placeholder}
                        />
                      </Field>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4">
                  <div>
                    <h3 className="font-medium text-zinc-100">Directory profile links</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      Optional links to review or verification directories (P411, TER, PrivateDelights, TheOtherBoard).
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="P411 profile ID">
                      <Input value={formData.p411_id || ""} onChange={(e) => handleChange("p411_id", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="P123456" />
                    </Field>
                    {DIRECTORY_LINK_FIELDS.map(({ key, label, placeholder }) => (
                      <Field key={key} label={label}>
                        <Input
                          value={formData[key] || ""}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100"
                          placeholder={placeholder}
                        />
                      </Field>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                  <div className="mb-4">
                    <h3 className="font-medium text-zinc-100">External trust accounts</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      Add the third-party accounts you want shown publicly. Use a username, a direct link, or both. Verification and review publication on those services remain controlled by the external providers.
                    </p>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-zinc-200">Verification account</p>
                      <Field label="Verification provider">
                        <Input value={formData.verification_provider || ""} onChange={(e) => handleChange("verification_provider", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="Example: Preferred Verifier" />
                      </Field>
                      <Field label="Verification username">
                        <Input value={formData.verification_username || ""} onChange={(e) => handleChange("verification_username", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="@username or account handle" />
                      </Field>
                      <Field label="Verification link">
                        <Input value={formData.verification_url || ""} onChange={(e) => handleChange("verification_url", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="https://..." />
                      </Field>
                    </div>

                    <div className="space-y-4">
                      <p className="text-sm font-medium text-zinc-200">Review account</p>
                      <Field label="Review provider">
                        <Input value={formData.review_provider || ""} onChange={(e) => handleChange("review_provider", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="Example: Trusted Reviews" />
                      </Field>
                      <Field label="Review username">
                        <Input value={formData.review_username || ""} onChange={(e) => handleChange("review_username", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="@username or profile handle" />
                      </Field>
                      <Field label="Review link">
                        <Input value={formData.review_url || ""} onChange={(e) => handleChange("review_url", e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100" placeholder="https://..." />
                      </Field>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-zinc-100">Photo moderation queue</h3>
                      <p className="text-sm text-zinc-400">Your listing can go live after ID verification, but newly uploaded photos stay here until they are manually approved. Up to 8 total photos are supported.</p>
                    </div>
                    <div>
                      <input id="provider-photo-upload" type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                      <label htmlFor="provider-photo-upload">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-zinc-700 text-zinc-300"
                          disabled={
                            uploading ||
                            !provider ||
                            ((provider?.photos?.length || 0) + (provider?.pending_photos?.length || 0) >= MAX_PROVIDER_PHOTOS)
                          }
                          asChild
                        >
                          <span>{uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}Upload photos</span>
                        </Button>
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Current total: {(provider?.photos?.length || 0) + (provider?.pending_photos?.length || 0)}/{MAX_PROVIDER_PHOTOS}.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6">
                    <MediaGrid title="Approved photos" items={provider?.photos || []} emptyText="No approved photos yet." />
                    <MediaGrid title="Pending approval" items={provider?.pending_photos || []} emptyText="No photos waiting for review." />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ads">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Advertisement package</CardTitle>
                <CardDescription className="text-zinc-400">Choose how prominently your listing should be promoted.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <Field label="Current package">
                    <Select value={formData.ad_package || "none"} onValueChange={(value) => handleChange("ad_package", value)}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 min-w-56">
                        <SelectValue placeholder="Select package" />
                      </SelectTrigger>
                      <SelectContent>
                        {adPackages.map((pkg) => (
                          <SelectItem key={pkg.id} value={pkg.id}>{pkg.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1 self-end">
                    <button type="button" onClick={() => setBillingPeriod("weekly")} className={`px-4 py-2 rounded-lg text-sm ${billingPeriod === "weekly" ? "bg-rose-500 text-white" : "text-zinc-400"}`}>Weekly</button>
                    <button type="button" onClick={() => setBillingPeriod("monthly")} className={`px-4 py-2 rounded-lg text-sm ${billingPeriod === "monthly" ? "bg-rose-500 text-white" : "text-zinc-400"}`}>Monthly</button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {adPackages.map((pkg) => (
                    <Card key={pkg.id} className={`border ${formData.ad_package === pkg.id ? "border-rose-500 bg-rose-500/5" : "border-zinc-800 bg-zinc-950/60"}`}>
                      <CardHeader>
                        <CardTitle className="text-zinc-100 text-lg flex items-center gap-2">
                          {pkg.premium ? <Crown className="w-4 h-4 text-amber-400" /> : <TrendingUp className="w-4 h-4 text-zinc-400" />}
                          {pkg.label}
                        </CardTitle>
                        <CardDescription className="text-zinc-500">{formatPackagePrice(pkg, billingPeriod)}{pkg.id === "none" ? "" : " after approval"}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 text-sm text-zinc-400">
                          {pkg.features.map((feature) => (
                            <li key={feature} className="flex items-start gap-2"><Star className="w-3.5 h-3.5 mt-0.5 text-amber-400" />{feature}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="rounded-lg bg-zinc-800 border border-zinc-700 p-4 text-sm text-zinc-300 space-y-2">
                  <p><span className="font-medium text-zinc-100">Selected:</span> {selectedPackage.name}</p>
                  <p>Paid packages activate after NOWPayments confirms the crypto payment. The active package, upgrade time, and expiration date stay visible in your dashboard.</p>
                  <p className="text-zinc-500">Expiration reminders are sent before paid visibility ends when email delivery is configured.</p>
                  {providerBillingBlocked && (
                    <p className="text-red-300">Payment is disabled while this listing is {provider.status}. Contact support or wait for admin review before buying paid visibility.</p>
                  )}
                  {checkoutStatus.message && (
                    <p className={checkoutStatus.type === "success" ? "text-emerald-300" : "text-red-300"}>{checkoutStatus.message}</p>
                  )}
                  <Button
                    type="button"
                    className="bg-rose-500 hover:bg-rose-600 text-white"
                    disabled={!selectedProductSku || checkoutMutation.isPending || providerBillingBlocked}
                    onClick={handleStartCheckout}
                  >
                    {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                    {selectedProductSku ? "Continue to payment" : "Free listing selected"}
                  </Button>
                </div>

                <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="font-medium text-zinc-100">Recent payment activity</h3>
                    <Button type="button" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => refetchOrders()}>
                      Refresh
                    </Button>
                  </div>
                  {orders.length === 0 ? (
                    <p className="text-sm text-zinc-500">No package payments yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {orders.slice(0, 5).map((order) => {
                        const latestInvoice = order.invoices?.[0];
                        const status = latestInvoice?.status || order.status;
                        return (
                          <div key={order.id} className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium text-zinc-100">{formatMoney(order.amountCents, order.currency)}</p>
                              <p className="text-xs text-zinc-500">{formatOrderDate(order.createdAt)}</p>
                            </div>
                            <Badge className={`${status === "paid" ? "bg-emerald-500/20 text-emerald-300" : status === "failed" || status === "expired" || status === "refunded" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"} border-0`}>
                              {status}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="copilot">
            <AdvertisingCopilot surface="dashboard" defaultPrompt="Review my current ad and suggest the next best advertising move." />
          </TabsContent>

        </Tabs>
      </div>
    </div>
      )}
    </RequireRole>
  );
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <Icon className="w-8 h-8 text-rose-400" />
          <span className="text-3xl font-bold text-zinc-100">{value}</span>
        </div>
        <p className="text-sm text-zinc-400">{label}</p>
        <p className="mt-2 text-xs text-zinc-500">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, value, tone }) {
  const className =
    tone === "success"
      ? "bg-green-500/20 text-green-300"
      : tone === "warning"
        ? "bg-yellow-500/20 text-yellow-300"
        : tone === "danger"
          ? "bg-red-500/20 text-red-300"
          : tone === "premium"
            ? "bg-amber-500/20 text-amber-300"
            : "bg-zinc-800 text-zinc-200";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-400">{label}</span>
      <Badge className={`${className} border-0 capitalize`}>{value}</Badge>
    </div>
  );
}

function PackageLifecycleBanner({ display }) {
  const badgeClassName =
    display.tone === "premium"
      ? "bg-amber-500/20 text-amber-200"
      : display.tone === "warning"
        ? "bg-yellow-500/20 text-yellow-200"
        : "bg-zinc-800 text-zinc-200";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-zinc-400">Current advertising package</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-zinc-100">{display.packageName}</h2>
            <Badge className={`${badgeClassName} border-0`}>{display.expiresLabel}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm md:min-w-80">
          <div>
            <p className="text-zinc-500">Started</p>
            <p className="mt-1 font-medium text-zinc-200">{display.startedLabel}</p>
          </div>
          <div>
            <p className="text-zinc-500">Expiration</p>
            <p className="mt-1 font-medium text-zinc-200">{display.expiresLabel}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-zinc-300 mb-2 block">{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="text-center py-12 text-zinc-500">
      <Icon className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-zinc-300 font-medium">{title}</p>
      <p className="text-sm text-zinc-500 mt-1">{description}</p>
    </div>
  );
}

function MediaGrid({ title, items, emptyText }) {
  return (
    <div>
      <h4 className="font-medium text-zinc-100 mb-3">{title}</h4>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((photo, index) => (
            <img key={`${photo}-${index}`} src={photo} alt={`${title} ${index + 1}`} className="w-full aspect-square rounded-lg object-cover border border-zinc-800" />
          ))}
        </div>
      )}
    </div>
  );
}
