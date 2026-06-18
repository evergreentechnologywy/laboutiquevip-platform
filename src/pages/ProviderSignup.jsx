import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Crown, Sparkles, Star, Check, Upload, Loader2, User, MapPin, Image as ImageIcon, CreditCard, ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { stateOptions, cityOptionsForState, OTHER_CITY_OPTION } from "@/lib/locationOptions";
import { adPackages, getAdPackageById, formatPackagePrice, getPackageAmountCents, getPackageProductSku } from "@/lib/adPackages";
import DiditVerification from "@/components/DiditVerification";
import AdvertisingCopilot from "@/components/AdvertisingCopilot";
import { buildProviderSignupPayload } from "@/lib/providerPayload";
import { SEO } from "@/components/SEO";

const initialFormData = {
  display_name: "",
  tagline: "",
  bio: "",
  location_city: "",
  location_state: "",
  location_country: "USA",
  age: "",
  phone: "",
  email: "",
  rate_hourly: "",
  photos: [],
  ad_package: "none",
  verification_documents: [],
  verification_id: null,
};

const steps = [
  { id: 1, name: "Account", icon: User },
  { id: 2, name: "Profile", icon: MapPin },
  { id: 3, name: "Photos", icon: ImageIcon },
  { id: 4, name: "Rates", icon: Star },
  { id: 5, name: "Package", icon: CreditCard },
  { id: 6, name: "Verification", icon: ShieldCheck },
];

export default function ProviderSignup() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState(1);
  const [user, setUser] = React.useState(null);
  const [formData, setFormData] = React.useState(initialFormData);
  const [uploading, setUploading] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [cityChoice, setCityChoice] = React.useState(OTHER_CITY_OPTION);
  const [billingPeriod, setBillingPeriod] = React.useState("weekly");
  const [finished, setFinished] = React.useState(false);
  const [paymentUrl, setPaymentUrl] = React.useState("");
  const [isLoadingUser, setIsLoadingUser] = React.useState(true);

  const availableCities = React.useMemo(() => cityOptionsForState(formData.location_state), [formData.location_state]);

  React.useEffect(() => {
    const loadUser = async () => {
      if (!base44.auth.hasToken()) {
        setUser(null);
        setIsLoadingUser(false);
        return;
      }
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        setFormData(prev => ({ ...prev, email: currentUser.email }));
      } catch {
        setUser(null);
      } finally {
        setIsLoadingUser(false);
      }
    };
    loadUser();
  }, []);

  const createProviderMutation = useMutation({
    mutationFn: async (data) => {
      const payload = buildProviderSignupPayload({
        formData: data,
        userId: user.id,
        billingPeriod,
      });
      return await base44.entities.Provider.create(payload);
    },
    onSuccess: async () => {
      const selectedPackage = getAdPackageById(formData.ad_package);
      const productSku = getPackageProductSku(selectedPackage, billingPeriod);
      if (productSku) {
        try {
          const order = await base44.orders.create({
            productSku,
            currency: "USD",
            metadata: {
              adPackage: selectedPackage.id,
              billingPeriod,
            },
          });
          if (order.paymentUrl) {
            setPaymentUrl(order.paymentUrl);
          } else {
            setSubmitError("Profile created, but payment link could not be generated.");
          }
        } catch (error) {
          setSubmitError(error?.data?.message || error?.data?.error || error?.message || "Profile created, but payment link could not be generated.");
        }
      }
      setFinished(true);
    },
    onError: (error) => {
      setSubmitError(error?.data?.message || error?.data?.error || error?.message || "Could not create your profile.");
    },
  });

  const handleFileUpload = async (e, field = 'verification_documents') => {
    const files = Array.from(e.target.files);
    setUploading(true);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploadedUrls.push(file_url);
      }
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], ...uploadedUrls]
      }));
    } catch (error) {
      setSubmitError("Error uploading. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const nextStep = () => setStep(s => Math.min(6, s + 1));
  const prevStep = () => setStep(s => Math.max(1, s - 1));

  const handleSubmit = () => {
    createProviderMutation.mutate(formData);
  };

  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-20 px-4">
        <SEO
          title="Provider Signup | La Boutique VIP International"
          description="Join La Boutique VIP as a verified provider. Create your profile, choose your package, and start reaching clients."
          noindex
        />
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-zinc-950 mb-4 glow-gold">
              <Crown className="h-6 w-6 fill-zinc-950" />
            </div>
            <h1 className="text-3xl font-serif font-bold tracking-tight text-zinc-100">Become a provider</h1>
            <p className="mt-4 text-zinc-400 font-light leading-7">
              Join La Boutique VIP International to present your profile in a polished, trusted, and premium environment.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-[32px] border border-zinc-900 bg-zinc-900/20 p-8 shadow-2xl backdrop-blur-md space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 border border-zinc-900 text-zinc-300 text-sm font-semibold">1</div>
                  <div>
                    <p className="font-semibold text-zinc-200">Create an account or sign in</p>
                    <p className="text-sm text-zinc-500 font-light">Secure login with email verification.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 border border-zinc-900 text-zinc-300 text-sm font-semibold">2</div>
                  <div>
                    <p className="font-semibold text-zinc-200">Build your profile and choose a package</p>
                    <p className="text-sm text-zinc-500 font-light">Add photos, rates, and select the visibility tier that fits your goals.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 border border-zinc-900 text-zinc-300 text-sm font-semibold">3</div>
                  <div>
                    <p className="font-semibold text-zinc-200">Verify and go live</p>
                    <p className="text-sm text-zinc-500 font-light">Complete identity verification. Once approved, your listing becomes searchable.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <Button onClick={() => base44.auth.redirectToRegister(createPageUrl("ProviderSignup"))} className="w-full h-12 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 border-0 shadow-lg glow-rose">
                  Create account
                </Button>
                <Button onClick={() => base44.auth.redirectToLogin(createPageUrl("ProviderSignup"))} variant="outline" className="w-full h-12 rounded-2xl border-zinc-800 bg-zinc-950 text-zinc-350 hover:bg-zinc-900 hover:text-white">
                  Already have an account? Sign in
                </Button>
              </div>

              <p className="text-xs text-zinc-500 text-center leading-5 font-light">
                By signing up, you agree to our{" "}
                <Link to={createPageUrl("Terms")} className="underline underline-offset-4 text-zinc-300 hover:text-amber-400 transition-colors">Terms of Service</Link>{" "}
                and confirm you are 18+ years of age.
              </p>
            </div>
            <AdvertisingCopilot surface="signup" compact defaultPrompt="Help me prepare to register as an advertiser." />
          </div>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-20 px-4">
        <div className="max-w-md mx-auto bg-zinc-900/20 rounded-[32px] border border-zinc-900 p-10 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-950 border border-zinc-900 text-rose-450 mb-6 shadow-sm">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-zinc-100 mb-4">Under review</h1>
          <p className="text-zinc-400 font-light text-sm leading-7 mb-8">
            Your profile has been submitted successfully. Our team will review your details and verification documents. We&apos;ll notify you via email once your listing is live.
          </p>
          {paymentUrl && (
            <Button onClick={() => window.location.href = paymentUrl} className="w-full h-12 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 border-0 shadow-lg glow-rose">
              Open crypto payment
            </Button>
          )}
          {submitError && (
            <div className="mt-4 rounded-xl bg-red-950/20 border border-red-500/30 p-3">
              <p className="text-xs text-red-450 font-medium">{submitError}</p>
            </div>
          )}
          <Button onClick={() => navigate(createPageUrl("ProviderDashboard"))} variant={paymentUrl ? "outline" : "default"} className={`w-full h-12 rounded-2xl ${paymentUrl ? "mt-3 border-zinc-805 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white" : "bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 border-0 shadow-lg glow-rose"}`}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-12 px-4">
      <SEO title="Provider Onboarding | La Boutique VIP" />
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-serif font-bold text-zinc-100">Provider Onboarding</h1>
          <p className="mt-2 text-zinc-400 font-light">Complete your profile to join the directory</p>
        </div>

        <div className="mb-8">
          <AdvertisingCopilot surface="signup" compact defaultPrompt="Help me improve this advertiser profile before review." />
        </div>

        {/* Progress Bar */}
        <div className="mb-12 px-2">
          <div className="flex justify-between items-center relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-zinc-900 -z-0" />
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500 -z-0" 
              style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
            />
            {steps.map((s) => {
              const Icon = s.icon;
              const active = step >= s.id;
              return (
                <div key={s.id} className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 duration-300 ${active ? 'bg-amber-500 border-amber-500 text-zinc-950 font-bold shadow-md glow-gold' : 'bg-zinc-950 border-zinc-900 text-zinc-550'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`absolute -bottom-7 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap ${active ? 'text-amber-400' : 'text-zinc-550'}`}>
                    {s.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-16">
          {/* Step 1: Account */}
          {step === 1 && (
            <Card className="rounded-[32px] border-zinc-900 bg-zinc-900/20 shadow-2xl overflow-hidden">
              <CardHeader className="bg-zinc-950/45 border-b border-zinc-900/80">
                <CardTitle className="font-serif text-zinc-100">Account Details</CardTitle>
                <CardDescription className="text-zinc-450 font-light">Confirm your basic contact information</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Email Address</Label>
                  <Input value={formData.email} disabled className="h-12 rounded-2xl bg-zinc-950/40 border-zinc-900 text-zinc-400" />
                  <p className="text-[10px] text-zinc-550 italic font-light">Email is managed via your main account</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Phone Number (Optional)</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    placeholder="+1 (555) 000-0000"
                    className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" 
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={nextStep} className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-8 h-12 border-0 shadow-lg glow-rose">
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Profile */}
          {step === 2 && (
            <Card className="rounded-[32px] border-zinc-900 bg-zinc-900/20 shadow-2xl overflow-hidden">
              <CardHeader className="bg-zinc-950/45 border-b border-zinc-900/80">
                <CardTitle className="font-serif text-zinc-100">Profile Details</CardTitle>
                <CardDescription className="text-zinc-455 font-light">How you will appear in the directory</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Display Name *</Label>
                    <Input 
                      value={formData.display_name} 
                      onChange={e => setFormData({...formData, display_name: e.target.value})}
                      placeholder="e.g. Elena"
                      className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Age *</Label>
                    <Input 
                      type="number"
                      value={formData.age} 
                      onChange={e => setFormData({...formData, age: e.target.value})}
                      placeholder="21"
                      className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Tagline</Label>
                  <Input 
                    value={formData.tagline} 
                    onChange={e => setFormData({...formData, tagline: e.target.value})}
                    placeholder="A brief, catchy headline"
                    className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Bio</Label>
                  <Textarea 
                    value={formData.bio} 
                    onChange={e => setFormData({...formData, bio: e.target.value})}
                    placeholder="Tell your clients about yourself..."
                    className="bg-zinc-950/70 border-zinc-850 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm leading-6" 
                    rows={4}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Country *</Label>
                    <Select value={formData.location_state} onValueChange={val => setFormData({...formData, location_state: val})}>
                      <SelectTrigger className="h-12 rounded-2xl border-zinc-850 bg-zinc-950/70 text-zinc-100 focus:border-amber-500 focus:ring-amber-500/20">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        {stateOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">City *</Label>
                    <Input 
                      value={formData.location_city} 
                      onChange={e => setFormData({...formData, location_city: e.target.value})}
                      placeholder="Enter city"
                      className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" 
                    />
                  </div>
                </div>
                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={prevStep} className="text-zinc-400 hover:text-zinc-100">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={nextStep} disabled={!formData.display_name || !formData.location_city || !formData.location_state} className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-8 h-12 border-0 shadow-lg glow-rose disabled:opacity-40 disabled:pointer-events-none">
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Photos */}
          {step === 3 && (
            <Card className="rounded-[32px] border-zinc-900 bg-zinc-900/20 shadow-2xl overflow-hidden">
              <CardHeader className="bg-zinc-950/45 border-b border-zinc-900/80">
                <CardTitle className="font-serif text-zinc-100">Profile Photos</CardTitle>
                <CardDescription className="text-zinc-455 font-light">Upload at least one high-quality photo</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {formData.photos.map((url, i) => (
                    <div key={i} className="aspect-[3/4] rounded-2xl overflow-hidden border border-zinc-900 relative group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setFormData(prev => ({...prev, photos: prev.photos.filter((_, idx) => idx !== i)}))}
                        className="absolute top-2 right-2 h-7 w-7 rounded-full bg-zinc-950/90 shadow-sm flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <label className="aspect-[3/4] rounded-2xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-900/40 transition-colors">
                    <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'photos')} disabled={uploading} />
                    {uploading ? <Loader2 className="w-6 h-6 animate-spin text-amber-500" /> : <Upload className="w-6 h-6 text-zinc-600" />}
                    <span className="mt-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Add Photo</span>
                  </label>
                </div>
                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={prevStep} className="text-zinc-400 hover:text-zinc-100">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={nextStep} className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-8 h-12 border-0 shadow-lg glow-rose">
                    {formData.photos.length === 0 ? "Skip for now" : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Rates */}
          {step === 4 && (
            <Card className="rounded-[32px] border-zinc-900 bg-zinc-900/20 shadow-2xl overflow-hidden">
              <CardHeader className="bg-zinc-950/45 border-b border-zinc-900/80">
                <CardTitle className="font-serif text-zinc-100">Rates</CardTitle>
                <CardDescription className="text-zinc-455 font-light">Set your standard hourly rate</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="max-w-sm space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Hourly Rate (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-semibold">$</span>
                    <Input 
                      type="number"
                      value={formData.rate_hourly} 
                      onChange={e => setFormData({...formData, rate_hourly: e.target.value})}
                      placeholder="200"
                      className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm pl-8" 
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-550 text-sm font-light">/ hr</span>
                  </div>
                </div>
                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={prevStep} className="text-zinc-400 hover:text-zinc-100">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={nextStep} className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-8 h-12 border-0 shadow-lg glow-rose">
                    {!formData.rate_hourly ? "Skip for now" : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Package */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {adPackages.map(pkg => {
                  const selected = formData.ad_package === pkg.id;
                  return (
                    <article 
                      key={pkg.id} 
                      onClick={() => setFormData({...formData, ad_package: pkg.id})}
                      className={`cursor-pointer rounded-2xl border p-6 transition-all backdrop-blur-md shadow-lg ${selected ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 ring-4 ring-amber-550/5' : 'border-zinc-900 bg-zinc-900/20 text-zinc-350 hover:border-zinc-800'}`}
                    >
                      <h3 className="font-semibold tracking-tight">{pkg.name}</h3>
                      <p className={`mt-2 text-xs ${selected ? 'text-amber-300' : 'text-zinc-500'}`}>{formatPackagePrice(pkg, billingPeriod)}</p>
                      <div className="mt-4">
                        {selected && <CheckCircle2 className="h-5 w-5 text-amber-400" />}
                      </div>
                    </article>
                  );
                })}
              </div>
              {formData.ad_package !== "none" && (
                <p className="text-sm text-zinc-400 font-light">
                  Payment due after submission: <span className="font-semibold text-amber-450">${(getPackageAmountCents(getAdPackageById(formData.ad_package), billingPeriod) / 100).toFixed(2)} USD</span>.
                </p>
              )}
              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={prevStep} className="text-zinc-400 hover:text-zinc-100">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={nextStep} className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-8 h-12 border-0 shadow-lg glow-rose">
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 6: Verification */}
          {step === 6 && (
            <div className="space-y-6">
              <DiditVerification 
                onVerificationComplete={v => setFormData({...formData, verification_id: v.id})}
              />
              
              <div className="bg-zinc-900/20 rounded-[32px] border border-zinc-900 p-8 shadow-2xl backdrop-blur-md">
                <h3 className="font-serif text-xl font-bold text-zinc-100">Final Step</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-7 font-light">
                  Submit your profile for review. You can still edit your profile details and upload additional documents later from your dashboard.
                </p>
                {submitError && (
                  <div className="mt-4 rounded-xl bg-red-955/20 border border-red-500/30 p-3">
                    <p className="text-xs text-red-450 font-medium">{submitError}</p>
                  </div>
                )}
                <div className="flex justify-between mt-8">
                  <Button variant="ghost" onClick={prevStep} className="text-zinc-400 hover:text-zinc-100">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={createProviderMutation.isPending}
                    className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 px-10 h-12 border-0 shadow-lg glow-rose"
                  >
                    {createProviderMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Finish & Submit"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
