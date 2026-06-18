import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SignUp } from '@clerk/react';
import { Crown, ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { SEO } from '@/components/SEO';

function sanitizeNextUrl(rawNext) {
  if (!rawNext || typeof rawNext !== "string") return "/";
  if (!rawNext.startsWith("/")) return "/";
  if (rawNext.startsWith("//")) return "/";
  return rawNext;
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = sanitizeNextUrl(new URLSearchParams(location.search).get('next'));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4 py-12">
      <SEO 
        title="Create Account | La Boutique VIP International"
        description="Join La Boutique VIP today to create your provider profile or start browsing verified listings."
        ogTitle="Create Account | La Boutique VIP"
      />
      <Link to={createPageUrl("Home")} className="mb-10 flex items-center gap-3 transition hover:opacity-80">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-900 text-stone-50">
          <Crown className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight text-stone-900">La Boutique VIP</span>
          <span className="text-xs text-stone-500 italic">International</span>
        </div>
      </Link>

      <SignUp routing="path" path="/register" signInUrl="/login" redirectUrl={next} />

      <button 
        onClick={() => navigate('/')} 
        className="mt-8 flex items-center gap-2 mx-auto text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </button>
    </div>
  );
}
