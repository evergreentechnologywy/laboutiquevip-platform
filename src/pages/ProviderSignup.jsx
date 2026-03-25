// @ts-nocheck
import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Crown, Sparkles, Star, Check, Upload, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { stateOptions, cityOptionsForState, OTHER_CITY_OPTION } from "@/lib/locationOptions";
import { adPackages, getAdPackageById, formatPackagePrice } from "@/lib/adPackages";
import DiditVerification from "@/components/DiditVerification";
import { buildProviderSignupPayload } from "@/lib/providerPayload";

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
  ad_package: "none",
  verification_documents: [],
  verification_id: null,
};

export default function ProviderSignup() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState(1);
  const [user, setUser] = React.useState(null);
  const [formData, setFormData] = React.useState(initialFormData);
  const [uploading, setUploading] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [cityChoice, setCityChoice] = React.useState(OTHER_CITY_OPTION);
  const [billingPeriod, setBillingPeriod] = React.useState("weekly");

  const availableCities = React.useMemo(() => cityOptionsForState(formData.location_state), [formData.location_state]);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        setFormData(prev => ({ ...prev, email: currentUser.email }));
      } catch (error) {
        base44.auth.redirectToLogin(createPageUrl("ProviderSignup"));
      }
    };
    loadUser();
  }, []);

  const createProviderMutation = useMutation({
    /** @param {typeof initialFormData} data */
    mutationFn: async (data) => {
      const payload = buildProviderSignupPayload({
        formData: data,
        userId: user.id,
        billingPeriod,
      });
      return await base44.entities.Provider.create(payload);
    },
    onSuccess: () => {
      setSubmitError("");
      navigate(createPageUrl("ProviderDashboard"), { replace: true });
    },
    onError: (/** @type {Error & { data?: { message?: string, error?: string } }} */ error) => {
      setSubmitError(error?.data?.message || error?.data?.error || error?.message || "Could not create your profile.");
    },
  });

  const handleFileUpload = async (e) => {
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
        verification_documents: [...prev.verification_documents, ...uploadedUrls]
      }));
      setSubmitError("");
    } catch (error) {
      setSubmitError(error?.data?.message || error?.message || "Error uploading files. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.display_name.trim() || !formData.location_city.trim() || !formData.location_state.trim()) {
      setSubmitError("Please fill in your display name, country, and city.");
      return;
    }

    setSubmitError("");
    createProviderMutation.mutate(formData);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">
            Join La Boutique Vip
          </h1>
          <p className="text-xl font-semibold text-zinc-600 mb-4">International</p>
          <p className="text-zinc-400 text-lg">Create your profile and choose your advertising package</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-rose-400' : 'text-zinc-600'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-rose-500' : 'bg-zinc-800'}`}>
                1
              </div>
              <span className="font-medium">Profile Info</span>
            </div>
            <div className="w-16 h-0.5 bg-zinc-800" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-rose-400' : 'text-zinc-600'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-rose-500' : 'bg-zinc-800'}`}>
                2
              </div>
              <span className="font-medium">Choose Package</span>
            </div>
            <div className="w-16 h-0.5 bg-zinc-800" />
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-rose-400' : 'text-zinc-600'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-rose-500' : 'bg-zinc-800'}`}>
                3
              </div>
              <span className="font-medium">Verification</span>
            </div>
          </div>
        </div>

        {/* Step 1: Profile Information */}
        {step === 1 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Profile Information</CardTitle>
              <CardDescription className="text-zinc-400">Tell us about yourself</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-zinc-300">Display Name *</Label>
                  <Input
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                    placeholder="Your professional name"
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">Age</Label>
                  <Input
                    type="number"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                  />
                </div>
              </div>

              <div>
                <Label className="text-zinc-300">Tagline</Label>
                <Input
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                  placeholder="A catchy headline"
                />
              </div>

              <div>
                <Label className="text-zinc-300">Bio</Label>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                  rows={5}
                  placeholder="Tell clients about yourself..."
                />
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <Label className="text-zinc-300">Country *</Label>
                  <Select
                    value={formData.location_state || undefined}
                    onValueChange={(value) => {
                      setFormData({ ...formData, location_state: value, location_city: "" });
                      setCityChoice(OTHER_CITY_OPTION);
                    }}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2">
                      <SelectValue placeholder="Select a country" />
                    </SelectTrigger>
                    <SelectContent>
                      {stateOptions.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-300">City *</Label>
                  {availableCities.length > 0 ? (
                    <>
                      <Select
                        value={availableCities.includes(formData.location_city) ? formData.location_city : cityChoice}
                        onValueChange={(value) => {
                          setCityChoice(value);
                          setFormData({ ...formData, location_city: value === OTHER_CITY_OPTION ? "" : value });
                        }}
                      >
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2">
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
                        <Input
                          value={formData.location_city}
                          onChange={(e) => setFormData({ ...formData, location_city: e.target.value })}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-3"
                          placeholder="Enter another city"
                        />
                      )}
                    </>
                  ) : (
                    <Input
                      value={formData.location_city}
                      onChange={(e) => setFormData({ ...formData, location_city: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                      placeholder="Enter city"
                    />
                  )}
                </div>
                <div>
                  <Label className="text-zinc-300">Region / state</Label>
                  <Input
                    value={formData.location_country}
                    onChange={(e) => setFormData({ ...formData, location_country: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                    placeholder="Optional region or state"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-zinc-300">Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">Email</Label>
                  <Input
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  className="bg-gradient-to-r from-rose-500 to-amber-500"
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Choose Package */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-4 text-center">Choose Your Advertising Package</h2>
            <p className="text-center text-zinc-400 mb-6">Free listings can submit immediately. Paid tiers are selected here and payment activation is handled after approval.</p>

            <div className="flex justify-center mb-6">
              <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
                <button
                  type="button"
                  onClick={() => setBillingPeriod("weekly")}
                  className={`px-4 py-2 rounded-lg text-sm ${billingPeriod === "weekly" ? "bg-rose-500 text-white" : "text-zinc-400"}`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-4 py-2 rounded-lg text-sm ${billingPeriod === "monthly" ? "bg-rose-500 text-white" : "text-zinc-400"}`}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              {adPackages.map((pkg) => {
                const selected = formData.ad_package === pkg.id;
                const colorClass = pkg.color === "blue"
                  ? "from-blue-500 to-blue-600"
                  : pkg.color === "rose"
                    ? "from-rose-500 to-rose-600"
                    : pkg.color === "amber"
                      ? "from-amber-500 to-amber-600"
                      : "from-zinc-600 to-zinc-700";

                return (
                  <Card
                    key={pkg.id}
                    className={`relative cursor-pointer transition-all ${selected ? 'border-rose-500 shadow-xl shadow-rose-500/20' : 'border-zinc-800 hover:border-zinc-700'} bg-zinc-900`}
                    onClick={() => setFormData({ ...formData, ad_package: pkg.id })}
                  >
                    {pkg.recommended && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-rose-500 to-amber-500 border-0">
                          <Star className="w-3 h-3 mr-1" />
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    <CardHeader>
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center mb-4`}>
                        {pkg.id === "none" && <Sparkles className="w-6 h-6 text-white" />}
                        {pkg.id === "basic" && <Check className="w-6 h-6 text-white" />}
                        {pkg.id === "featured" && <Star className="w-6 h-6 text-white" />}
                        {pkg.id === "premium" && <Crown className="w-6 h-6 text-white" />}
                      </div>
                      <CardTitle className="text-zinc-100">{pkg.name}</CardTitle>
                      <div className="mt-4">
                        <span className="text-3xl font-bold text-zinc-100">{formatPackagePrice(pkg, billingPeriod).replace(/\/(week|month)$/, '')}</span>
                        <span className="text-zinc-500 ml-1">{pkg.id === "none" ? "/forever" : billingPeriod === "monthly" ? "/month" : "/week"}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {pkg.features.map((feature, index) => (
                          <li key={index} className="flex items-start gap-2 text-sm text-zinc-400">
                            <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="bg-zinc-900 border-zinc-800 mb-8">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-400">Selected package</p>
                    <h3 className="text-xl font-semibold text-zinc-100">{getAdPackageById(formData.ad_package).name}</h3>
                    <p className="text-sm text-zinc-400 mt-1">
                      {formData.ad_package === "none"
                        ? "Start with a free listing and complete verification now."
                        : `${formatPackagePrice(getAdPackageById(formData.ad_package), billingPeriod)} after approval.`}
                    </p>
                  </div>
                  {formData.ad_package !== "none" ? (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">Paid activation required after approval</Badge>
                  ) : (
                    <Badge className="bg-zinc-800 text-zinc-200 border-zinc-700">No payment required</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="border-zinc-700 text-zinc-300">
                Back
              </Button>
              <Button onClick={() => setStep(3)} className="bg-gradient-to-r from-rose-500 to-amber-500">
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Verification */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Didit Identity Verification */}
            <DiditVerification 
              onVerificationComplete={(verification) => {
                setFormData({ ...formData, verification_id: verification.id });
              }}
              onVerificationStatusChange={(status) => {
                if (status === "approved") {
                  setSubmitError("");
                }
              }}
            />

            {/* Optional Document Upload */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-zinc-100">Additional Documents (Optional)</CardTitle>
                <CardDescription className="text-zinc-400">
                  Upload any additional verification documents or certifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center">
                  <Upload className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400 mb-4">Upload additional documents (optional)</p>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="doc-upload"
                    disabled={uploading}
                  />
                  <label htmlFor="doc-upload">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-zinc-700 text-zinc-300"
                      disabled={uploading}
                      onClick={() => document.getElementById('doc-upload').click()}
                  >
                    {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploading ? 'Uploading...' : 'Choose Files'}
                  </Button>
                </label>
              </div>

              {formData.verification_documents.length > 0 && (
                <div>
                  <p className="text-sm text-zinc-400 mb-2">Uploaded documents:</p>
                  <ul className="space-y-2">
                    {formData.verification_documents.map((url, index) => (
                      <li key={index} className="text-sm text-green-400 flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        Document {index + 1}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
            <p className="text-sm text-blue-400">
              ℹ️ Once ID verification succeeds, your profile is approved automatically and your dashboard will show the listing as live.
            </p>
            <p className="text-sm text-blue-300/90">
              Photo uploads are still reviewed manually, and ad text is filtered automatically to block explicit language.
            </p>
          </div>

          {submitError ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-300">{submitError}</p>
            </div>
          ) : null}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="border-zinc-700 text-zinc-300">
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createProviderMutation.isPending}
              className="bg-gradient-to-r from-rose-500 to-amber-500"
            >
              {createProviderMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Profile...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Submit for Review
                </>
              )}
            </Button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
