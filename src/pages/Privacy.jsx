import React from "react";
import { SEO } from "@/components/SEO";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-20 px-4 sm:px-6 lg:px-8">
      <SEO
        title="Privacy Policy | La Boutique VIP International"
        description="Learn how La Boutique VIP collects, uses, and protects your personal information."
        noindex
      />
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-serif font-bold tracking-tight text-zinc-100 mb-8">Privacy Policy</h1>
        <div className="prose prose-invert max-w-none text-zinc-400 space-y-6">
          <p className="text-lg leading-8 font-semibold text-amber-450">Last Updated: April 24, 2026</p>
          <p className="font-light">
            Your privacy is important to us. This policy explains how we collect, use, and protect your personal information when you use La Boutique VIP.
          </p>

          <h2 className="text-2xl font-serif font-bold text-zinc-200 mt-10">1. Data Collection</h2>
          <p className="font-light leading-7">
            We collect information that you provide directly to us (such as when creating an account or a listing) and information collected automatically (such as log data and cookies).
          </p>

          <h2 className="text-2xl font-serif font-bold text-zinc-200 mt-10">2. Use of Information</h2>
          <p className="font-light leading-7">
            Information is used to provide, maintain, and improve our services, communicate with you, and ensure the safety and security of our community.
          </p>

          <h2 className="text-2xl font-serif font-bold text-zinc-200 mt-10">3. Data Sharing</h2>
          <p className="font-light leading-7">
            We do not sell your personal data. Information is only shared with third-party service providers (like identity verification services) as necessary to provide our services.
          </p>

          <h2 className="text-2xl font-serif font-bold text-zinc-200 mt-10">4. Data Security</h2>
          <p className="font-light leading-7">
            We implement industry-standard security measures to protect your data. However, no method of transmission over the internet is 100% secure.
          </p>

          <h2 className="text-2xl font-serif font-bold text-zinc-200 mt-10">5. Your Rights</h2>
          <p className="font-light leading-7">
            You have the right to access, correct, or delete your personal information at any time through your account settings or by contacting our support team.
          </p>
        </div>
      </div>
    </div>
  );
}
