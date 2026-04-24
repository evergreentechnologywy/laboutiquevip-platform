import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Crown, ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { SEO } from '@/components/SEO';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next') || '/';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const validateEmail = (val) => {
    const res = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    setEmailError(res ? "" : "Please enter a valid email address");
    return res;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    
    if (!validateEmail(email)) return;
    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    try {
      await base44.auth.login(email, password);
      window.location.href = next;
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

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

      <div className="w-full max-w-md">
        <div className="bg-white rounded-[28px] border border-stone-200 p-8 shadow-[0_24px_80px_-32px_rgba(28,25,23,0.12)]">
          <h1 className="text-2xl font-semibold text-stone-900 mb-2">Sign in</h1>
          <p className="text-stone-500 text-sm mb-8">Welcome back. Enter your credentials to continue.</p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email-input" className="text-stone-700">Email Address</Label>
              <Input 
                id="email-input"
                name="email"
                type="email" 
                placeholder="email@example.com" 
                value={email} 
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }} 
                className={`h-12 rounded-xl border-stone-200 ${emailError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                required 
              />
              {emailError && <p className="text-xs text-red-500">{emailError}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password-input" className="text-stone-700">Password</Label>
                <Link to="/forgot-password" title="Forgot password?" className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <Input 
                id="password-input"
                name="password"
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="h-12 rounded-xl border-stone-200"
                required 
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs text-red-600 font-medium">{error}</p>
              </div>
            )}

            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-12 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 transition-all font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : 'Sign in'}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-stone-100 text-center">
            <p className="text-sm text-stone-500">
              No account? <Link className="font-semibold text-stone-900 hover:underline underline-offset-4" to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
            </p>
          </div>
        </div>

        <button 
          onClick={() => navigate('/')} 
          className="mt-8 flex items-center gap-2 mx-auto text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </button>
      </div>
    </div>
  );
}
