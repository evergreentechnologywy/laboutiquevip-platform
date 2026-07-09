import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SignIn } from '@clerk/react';
import { Crown, ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { SEO } from '@/components/SEO';
import { clerkAppearance } from '@/lib/clerkAppearance';

function sanitizeNextUrl(rawNext) {
  if (!rawNext || typeof rawNext !== "string") return "/";
  if (!rawNext.startsWith("/")) return "/";
  if (rawNext.startsWith("//")) return "/";
  return rawNext;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = sanitizeNextUrl(new URLSearchParams(location.search).get("next"));
  const signUpUrl = `/register${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 px-4 py-12 selection:bg-rose-500/35 selection:text-white">
      <SEO 
        title="Sign In | La Boutique VIP International"
        description="Sign in to your La Boutique VIP account to manage your provider profile or browse verified listings."
        ogTitle="Sign In | La Boutique VIP"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.08),_transparent_45%)] pointer-events-none" />

      <Link to={createPageUrl("Home")} className="mb-10 flex items-center gap-3 transition hover:opacity-80 relative z-10">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-lg glow-rose">
          <Crown className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight text-zinc-100 font-serif">La Boutique VIP</span>
          <span className="text-xs text-zinc-400 italic font-light">International</span>
        </div>
      </Link>

      <div className="relative z-10 w-full max-w-md">
        <SignIn
          routing="path"
          path="/login"
          signUpUrl={signUpUrl}
          forceRedirectUrl={next}
          signUpForceRedirectUrl={next}
          appearance={clerkAppearance}
        />
      </div>

      <button 
        onClick={() => navigate('/')} 
        className="mt-8 flex items-center gap-2 mx-auto text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors relative z-10"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </button>
    </div>
  );
}
