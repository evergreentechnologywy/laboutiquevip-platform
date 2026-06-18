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
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 px-4 py-12 selection:bg-rose-500/35 selection:text-white">
      <SEO 
        title="Create Account | La Boutique VIP International"
        description="Join La Boutique VIP today to create your provider profile or start browsing verified listings."
        ogTitle="Create Account | La Boutique VIP"
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
        <SignUp 
          routing="path" 
          path="/register" 
          signInUrl="/login" 
          redirectUrl={next} 
          appearance={{
            elements: {
              card: "bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] rounded-[32px] backdrop-blur-md",
              headerTitle: "text-zinc-100 font-serif text-2xl tracking-tight",
              headerSubtitle: "text-zinc-400 font-light text-sm",
              socialButtonsBlockButton: "bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700/80 transition-colors rounded-xl",
              socialButtonsBlockButtonText: "text-zinc-200 font-medium",
              dividerLine: "bg-zinc-850",
              dividerText: "text-zinc-500 text-xs uppercase tracking-wider",
              formFieldLabel: "text-zinc-350 text-xs font-semibold uppercase tracking-wider",
              formFieldInput: "bg-zinc-800/50 border-zinc-700 text-zinc-100 rounded-xl focus:border-rose-500/50 focus:ring-rose-500/20 transition-all",
              formButtonPrimary: "bg-gradient-to-r from-rose-500 to-amber-500 hover:opacity-95 text-white font-semibold h-11 border-0 shadow-md rounded-full transition-all",
              footerActionText: "text-zinc-450 text-sm font-light",
              footerActionLink: "text-rose-450 hover:text-rose-350 font-medium transition-colors",
              identityPreviewText: "text-zinc-300",
              identityPreviewEditButton: "text-rose-450 hover:text-rose-350",
              formFieldSuccessText: "text-emerald-450",
              formFieldErrorText: "text-rose-450",
            }
          }}
        />
      </div>

      <button 
        onClick={() => navigate('/')} 
        className="mt-8 flex items-center gap-2 mx-auto text-sm font-medium text-zinc-450 hover:text-zinc-100 transition-colors relative z-10"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </button>
    </div>
  );
}
