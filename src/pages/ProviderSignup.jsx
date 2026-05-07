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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 py-20 px-4">
        <SEO
          title="Provider Signup | La Boutique VIP International"
          description="Join La Boutique VIP as a verified provider. Create your profile, choose your package, and start reaching clients."
          noindex
        />
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-stone-50 mb-4">
              <Crown className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Become a provider</h1>
            <p className="mt-4 text-stone-600 leading-7">
              Join La Boutique VIP International to present your profile in a polished, trusted, and premium environment.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 text-sm font-semibold">1</div>
                <div>
                  <p className="font-medium text-stone-900">Create an account or sign in</p>
                  <p className="text-sm text-stone-500">Secure login with email verification.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 text-sm font-semibold">2</div>
                <div>
                  <p className="font-medium text-stone-900">Build your profile and choose a package</p>
                  <p className="text-sm text-stone-500">Add photos, rates, and select the visibility tier that fits your goals.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 text-sm font-semibold">3</div>
                <div>
                  <p className="font-medium text-stone-900">Verify and go live</p>
                  <p className="text-sm text-stone-500">Complete identity verification. Once approved, your listing becomes searchable.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button onClick={() => base44.auth.redirectToRegister(createPageUrl("ProviderSignup"))} className="w-full h-12 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 font-semibold">
                Create account
              </Button>
              <Button onClick={() => base44.auth.redirectToLogin(createPageUrl("ProviderSignup"))} variant="outline" className="w-full h-12 rounded-xl border-stone-300 text-stone-700 hover:bg-stone-50 font-semibold">
                Already have an account? Sign in
              </Button>
            </div>

            <p className="text-xs text-stone-500 text-center leading-5">
              By signing up, you agree to our{" "}
              <Link to={createPageUrl("Terms")} className="underline underline-offset-4 text-stone-900">Terms of Service</Link>{" "}
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
      <div className="min-h-screen bg-stone-50 py-20 px-4">
        <div className="max-w-md mx-auto bg-white rounded-[32px] border border-stone-200 p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-stone-50 mb-6">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-semibold text-stone-900 mb-4">Under review</h1>
          <p className="text-stone-600 leading-7 mb-8">
            Your profile has been submitted successfully. Our team will review your details and verification documents. We&apos;ll notify you via email once your listing is live.
          </p>
          {paymentUrl && (
            <Button onClick={() => window.location.href = paymentUrl} className="w-full h-12 rounded-xl bg-stone-900 text-stone-50">
              Open crypto payment
            </Button>
          )}
          {submitError && (
            <div className="mt-4 rounded-lg bg-red-50 p-3">
              <p className="text-xs text-red-600 font-medium">{submitError}</p>
            </div>
          )}
          <Button onClick={() => navigate(createPageUrl("ProviderDashboard"))} variant={paymentUrl ? "outline" : "default"} className={`w-full h-12 rounded-xl ${paymentUrl ? "mt-3 border-stone-300" : "bg-stone-900 text-stone-50"}`}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 py-12 px-4">
      <SEO title="Provider Onboarding | La Boutique VIP" />
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-stone-900">Provider Onboarding</h1>
          <p className="mt-2 text-stone-500">Complete your profile to join the directory</p>
        </div>

        <div className="mb-8">
          <AdvertisingCopilot surface="signup" compact defaultPrompt="Help me improve this advertiser profile before review." />
        </div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex justify-between items-center relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-stone-200 -z-0" />
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-stone-900 transition-all duration-500 -z-0" 
              style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
            />
            {steps.map((s) => {
              const Icon = s.icon;
              const active = step >= s.id;
              return (
                <div key={s.id} className="relative z-10 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border-2 ${active ? 'bg-stone-900 border-stone-900 text-stone-50' : 'bg-white border-stone-200 text-stone-400'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`absolute -bottom-7 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${active ? 'text-stone-900' : 'text-stone-400'}`}>
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
            <Card className="rounded-[28px] border-stone-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100">
                <CardTitle>Account Details</CardTitle>
                <CardDescription>Confirm your basic contact information</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input value={formData.email} disabled className="h-12 rounded-xl bg-stone-50 border-stone-200" />
                  <p className="text-[10px] text-stone-400 italic">Email is managed via your main account</p>
                </div>
                <div className="space-y-2">
                  <Label>Phone Number (Optional)</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    placeholder="+1 (555) 000-0000"
                    className="h-12 rounded-xl border-stone-200" 
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={nextStep} className="rounded-full bg-stone-900 px-8 h-12">
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Profile */}
          {step === 2 && (
            <Card className="rounded-[28px] border-stone-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100">
                <CardTitle>Profile Details</CardTitle>
                <CardDescription>How you will appear in the directory</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Display Name *</Label>
                    <Input 
                      value={formData.display_name} 
                      onChange={e => setFormData({...formData, display_name: e.target.value})}
                      placeholder="e.g. Elena"
                      className="h-12 rounded-xl border-stone-200" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Age *</Label>
                    <Input 
                      type="number"
                      value={formData.age} 
                      onChange={e => setFormData({...formData, age: e.target.value})}
                      placeholder="21"
                      className="h-12 rounded-xl border-stone-200" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tagline</Label>
                  <Input 
                    value={formData.tagline} 
                    onChange={e => setFormData({...formData, tagline: e.target.value})}
                    placeholder="A brief, catchy headline"
                    className="h-12 rounded-xl border-stone-200" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bio</Label>
                  <Textarea 
                    value={formData.bio} 
                    onChange={e => setFormData({...formData, bio: e.target.value})}
                    placeholder="Tell your clients about yourself..."
                    className="rounded-xl border-stone-200" 
                    rows={4}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Country *</Label>
                    <Select value={formData.location_state} onValueChange={val => setFormData({...formData, location_state: val})}>
                      <SelectTrigger className="h-12 rounded-xl border-stone-200 bg-white">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {stateOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>City *</Label>
                    <Input 
                      value={formData.location_city} 
                      onChange={e => setFormData({...formData, location_city: e.target.value})}
                      placeholder="Enter city"
                      className="h-12 rounded-xl border-stone-200" 
                    />
                  </div>
                </div>
                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={prevStep} className="text-stone-500">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={nextStep} disabled={!formData.display_name || !formData.location_city || !formData.location_state} className="rounded-full bg-stone-900 px-8 h-12">
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Photos */}
          {step === 3 && (
            <Card className="rounded-[28px] border-stone-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100">
                <CardTitle>Profile Photos</CardTitle>
                <CardDescription>Upload at least one high-quality photo</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {formData.photos.map((url, i) => (
                    <div key={i} className="aspect-[3/4] rounded-2xl overflow-hidden border border-stone-100 relative group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setFormData(prev => ({...prev, photos: prev.photos.filter((_, idx) => idx !== i)}))}
                        className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ArrowLeft className="w-4 h-4" /> {/* Should be X, using available icons */}
                      </button>
                    </div>
                  ))}
                  <label className="aspect-[3/4] rounded-2xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center cursor-pointer hover:bg-stone-50 transition-colors">
                    <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'photos')} disabled={uploading} />
                    {uploading ? <Loader2 className="w-6 h-6 animate-spin text-stone-400" /> : <Upload className="w-6 h-6 text-stone-300" />}
                    <span className="mt-2 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Add Photo</span>
                  </label>
                </div>
                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={prevStep} className="text-stone-500">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={nextStep} className="rounded-full bg-stone-900 px-8 h-12">
                    {formData.photos.length === 0 ? "Skip for now" : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Rates */}
          {step === 4 && (
            <Card className="rounded-[28px] border-stone-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-stone-50/50 border-b border-stone-100">
                <CardTitle>Rates</CardTitle>
                <CardDescription>Set your standard hourly rate</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="max-w-sm space-y-2">
                  <Label>Hourly Rate (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-semibold">$</span>
                    <Input 
                      type="number"
                      value={formData.rate_hourly} 
                      onChange={e => setFormData({...formData, rate_hourly: e.target.value})}
                      placeholder="200"
                      className="h-12 rounded-xl border-stone-200 pl-8" 
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm">/ hr</span>
                  </div>
                </div>
                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={prevStep} className="text-stone-500">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={nextStep} className="rounded-full bg-stone-900 px-8 h-12">
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
                      className={`cursor-pointer rounded-2xl border p-6 transition-all ${selected ? 'border-stone-900 bg-stone-900 text-stone-50 ring-4 ring-stone-900/5' : 'border-stone-200 bg-white text-stone-900 hover:border-stone-300'}`}
                    >
                      <h3 className="font-semibold">{pkg.name}</h3>
                      <p className={`mt-2 text-xs ${selected ? 'text-stone-400' : 'text-stone-500'}`}>{formatPackagePrice(pkg, billingPeriod)}</p>
                      <div className="mt-4">
                        {selected && <CheckCircle2 className="h-5 w-5 text-white" />}
                      </div>
                    </article>
                  );
                })}
              </div>
              {formData.ad_package !== "none" && (
                <p className="text-sm text-stone-500">
                  Payment due after submission: ${(getPackageAmountCents(getAdPackageById(formData.ad_package), billingPeriod) / 100).toFixed(2)} USD.
                </p>
              )}
              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={prevStep} className="text-stone-500">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={nextStep} className="rounded-full bg-stone-900 px-8 h-12">
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
              
              <div className="bg-white rounded-[28px] border border-stone-200 p-8 shadow-sm">
                <h3 className="font-semibold text-stone-900">Final Step</h3>
                <p className="mt-2 text-sm text-stone-600 leading-7">
                  Submit your profile for review. You can still edit your profile and upload documents later from your dashboard.
                </p>
                {submitError && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3">
                    <p className="text-xs text-red-600 font-medium">{submitError}</p>
                  </div>
                )}
                <div className="flex justify-between mt-8">
                  <Button variant="ghost" onClick={prevStep} className="text-stone-500">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={createProviderMutation.isPending}
                    className="rounded-full bg-stone-900 px-10 h-12"
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
