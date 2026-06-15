import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Crown, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { SEO } from '@/components/SEO';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next') || '/';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateEmail = (val) => {
    const res = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    setEmailError(res ? "" : "Please enter a valid email address");
    return res;
  };

  const getPasswordStrength = (pass) => {
    if (!pass) return null;
    if (pass.length < 8) return { label: "Weak", class: "bg-red-500", width: "33%" };
    if (pass.length < 12) return { label: "Medium", class: "bg-amber-500", width: "66%" };
    return { label: "Strong", class: "bg-green-500", width: "100%" };
  };

  const strength = getPasswordStrength(password);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setPasswordError('');

    if (!validateEmail(email)) return;
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await base44.auth.register(email, password, fullName || email.split('@')[0]);
      setRegistered(true);
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Registration failed. This email might already be in use.');
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-[28px] border border-stone-200 p-10 text-center shadow-[0_24px_80px_-32px_rgba(28,25,23,0.12)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-600 mb-6">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-semibold text-stone-900 mb-4">Account created</h1>
          <p className="text-stone-600 leading-7 mb-8">
            Thank you for joining La Boutique VIP. Please check your inbox at <span className="font-semibold text-stone-900">{email}</span> to verify your email address before signing in.
          </p>
          <Button 
            onClick={() => navigate('/login')} 
            className="w-full h-12 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 transition-all font-semibold"
          >
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

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

      <div className="w-full max-w-md">
        <div className="bg-white rounded-[28px] border border-stone-200 p-8 shadow-[0_24px_80px_-32px_rgba(28,25,23,0.12)]">
          <h1 className="text-2xl font-semibold text-stone-900 mb-2">Create account</h1>
          <p className="text-stone-500 text-sm mb-8">Join our community of verified profiles.</p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="fullname-input" className="text-stone-700">Full Name</Label>
              <Input 
                id="fullname-input"
                name="fullname"
                type="text" 
                placeholder="Name" 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)} 
                className="h-12 rounded-xl border-stone-200"
              />
            </div>

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
              <Label htmlFor="password-input" className="text-stone-700">Password</Label>
              <Input 
                id="password-input"
                name="password"
                type="password" 
                placeholder="Min. 8 characters" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className={`h-12 rounded-xl border-stone-200 ${passwordError && password.length < 8 ? 'border-red-500' : ''}`}
                required 
              />
              {strength && (
                <div className="pt-1">
                  <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${strength.class}`} 
                      style={{ width: strength.width }}
                    />
                  </div>
                  <p className="text-[10px] mt-1 text-stone-500 uppercase tracking-wider font-semibold">
                    Strength: {strength.label}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password-input" className="text-stone-700">Confirm Password</Label>
              <Input 
                id="confirm-password-input"
                name="confirm-password"
                type="password" 
                placeholder="Re-enter password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                className={`h-12 rounded-xl border-stone-200 ${passwordError && password !== confirmPassword ? 'border-red-500' : ''}`}
                required 
              />
              {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
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
                  Creating account...
                </>
              ) : 'Create account'}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-stone-100 text-center">
            <p className="text-sm text-stone-500">
              Already have an account? <Link className="font-semibold text-stone-900 hover:underline underline-offset-4" to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
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
