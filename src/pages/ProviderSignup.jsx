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

const adPackages = [
  {
    id: "none",
    name: "Free Listing",
    price: 0,
    duration: "Forever",
    features: [
      "Basic profile listing",
      "Up to 3 photos",
      "Standard search visibility",
      "Contact form access"
    ],
    color: "zinc"
  },
  {
    id: "basic",
    name: "Basic Ads",
    price: 25,
    duration: "per week",
    features: [
      "Everything in Free",
      "Up to 10 photos",
      "Enhanced search ranking",
      "Featured in category",
      "Priority support"
    ],
    color: "blue",
    popular: false
  },
  {
    id: "featured",
    name: "Featured",
    price: 50,
    duration: "per week",
    features: [
      "Everything in Basic",
      "Unlimited photos",
      "Homepage featured section",
      "Top search results",
      "Verified badge",
      "Premium support"
    ],
    color: "rose",
    popular: true
  },
  {
    id: "premium",
    name: "VIP Premium",
    price: 75,
    duration: "per week",
    features: [
      "Everything in Featured",
      "Exclusive VIP badge",
      "Priority homepage placement",
      "Social media promotion",
      "Dedicated account manager",
      "Advanced analytics"
    ],
    color: "amber",
    popular: false
  },
  {
    id: "elite",
    name: "Elite Cities",
    price: 100,
    duration: "per week",
    features: [
      "Everything in VIP Premium",
      "Big city priority placement",
      "Multiple city coverage",
      "Premium marketing campaigns",
      "VIP event invitations",
      "Top search in major markets",
      "Exclusive elite badge"
    ],
    color: "purple",
    popular: false
  }
];

export default function ProviderSignup() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState(1);
  const [user, setUser] = React.useState(null);
  const [formData, setFormData] = React.useState({
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
    verification_documents: []
  });
  const [uploading, setUploading] = React.useState(false);

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
    mutationFn: async (data) => {
      const adPackageExpiry = data.ad_package !== "none" 
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;

      return await base44.entities.Provider.create({
        ...data,
        user_id: user.id,
        is_premium: data.ad_package === "premium" || data.ad_package === "featured",
        ad_package_expiry: adPackageExpiry,
        pending_photos: [],
        status: "pending_verification"
      });
    },
    onSuccess: () => {
      navigate(createPageUrl("ProviderDashboard"));
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
    } catch (error) {
      alert("Error uploading files. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.display_name || !formData.location_city || !formData.location_state) {
      alert("Please fill in all required fields");
      return;
    }
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
                    onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
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
                  <Label className="text-zinc-300">City *</Label>
                  <Input
                    value={formData.location_city}
                    onChange={(e) => setFormData({ ...formData, location_city: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">State *</Label>
                  <Input
                    value={formData.location_state}
                    onChange={(e) => setFormData({ ...formData, location_state: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">Country</Label>
                  <Input
                    value={formData.location_country}
                    onChange={(e) => setFormData({ ...formData, location_country: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-2"
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
            <h2 className="text-2xl font-bold text-zinc-100 mb-6 text-center">Choose Your Advertising Package</h2>
            <div className="grid md:grid-cols-5 gap-4 mb-8">
              {adPackages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`relative cursor-pointer transition-all ${
                    formData.ad_package === pkg.id
                      ? 'border-rose-500 shadow-xl shadow-rose-500/20'
                      : 'border-zinc-800 hover:border-zinc-700'
                  } bg-zinc-900`}
                  onClick={() => setFormData({ ...formData, ad_package: pkg.id })}
                >
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-rose-500 to-amber-500 border-0">
                        <Star className="w-3 h-3 mr-1" />
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-${pkg.color}-500 to-${pkg.color}-600 flex items-center justify-center mb-4`}>
                      {pkg.id === "none" && <Sparkles className="w-6 h-6 text-white" />}
                      {pkg.id === "basic" && <Check className="w-6 h-6 text-white" />}
                      {pkg.id === "featured" && <Star className="w-6 h-6 text-white" />}
                      {pkg.id === "premium" && <Crown className="w-6 h-6 text-white" />}
                      {pkg.id === "elite" && <Crown className="w-6 h-6 text-white" />}
                    </div>
                    <CardTitle className="text-zinc-100">{pkg.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-3xl font-bold text-zinc-100">${pkg.price}</span>
                      <span className="text-zinc-500">/{pkg.duration}</span>
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
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="border-zinc-700 text-zinc-300">
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="bg-gradient-to-r from-rose-500 to-amber-500"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Verification */}
        {step === 3 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Verification Documents</CardTitle>
              <CardDescription className="text-zinc-400">
                Upload ID or verification documents for faster approval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center">
                <Upload className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400 mb-4">Upload verification documents (optional)</p>
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

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-sm text-blue-400">
                  ℹ️ Your profile will be reviewed by our team within 24-48 hours. You'll receive an email once approved.
                </p>
              </div>

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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}