import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { Crown, ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { SEO } from '@/components/SEO';

export default function Login() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4 py-12">
      <SEO 
        title="Sign In | La Boutique VIP International"
        description="Sign in to your La Boutique VIP account to manage your provider profile or browse verified listings."
        ogTitle="Sign In | La Boutique VIP"
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

      <SignIn routing="path" path="/login" signUpUrl="/register" />

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
