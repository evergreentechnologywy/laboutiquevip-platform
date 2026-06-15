import React from "react";
import { SEO } from "@/components/SEO";

export default function Terms() {
  return (
    <div className="min-h-screen bg-stone-50 py-20 px-4 sm:px-6 lg:px-8">
      <SEO
        title="Terms of Service | La Boutique VIP International"
        description="Read the Terms of Service for using La Boutique VIP International."
        noindex
      />
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 mb-8">Terms of Service</h1>
        <div className="prose prose-stone max-w-none text-stone-600 space-y-6">
          <p className="text-lg leading-8 font-medium text-stone-900">Effective Date: April 24, 2026</p>
          <p>
            Welcome to La Boutique VIP International. By accessing or using our platform, you agree to be bound by these Terms of Service.
          </p>
          
          <h2 className="text-2xl font-semibold text-stone-900 mt-10">1. Age Requirement</h2>
          <p>
            You must be at least 18 years of age (or the legal age of majority in your jurisdiction, whichever is higher) to access and use this platform. By entering, you represent and warrant that you meet this age requirement.
          </p>

          <h2 className="text-2xl font-semibold text-stone-900 mt-10">2. Platform Purpose</h2>
          <p>
            La Boutique VIP is an advertising directory. We do not provide the services advertised on the platform, nor do we act as an agency or employer for the independent advertisers listed here.
          </p>

          <h2 className="text-2xl font-semibold text-stone-900 mt-10">3. User Conduct</h2>
          <p>
            Users agree to interact with the platform and advertisers respectfully and lawfully. Any form of harassment, illegal activity, or violation of these terms may result in permanent suspension from the platform.
          </p>

          <h2 className="text-2xl font-semibold text-stone-900 mt-10">4. Advertiser Verification</h2>
          <p>
            While we implement verification workflows through external providers, we do not guarantee the absolute accuracy of any listing. Users are encouraged to exercise discretion and perform their own due diligence.
          </p>

          <h2 className="text-2xl font-semibold text-stone-900 mt-10">5. Limitation of Liability</h2>
          <p>
            La Boutique VIP is provided "as is" without warranties of any kind. We are not liable for any disputes, damages, or losses arising from interactions between users and advertisers.
          </p>
        </div>
      </div>
    </div>
  );
}
