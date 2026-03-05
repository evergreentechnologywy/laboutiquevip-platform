import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

export default function Register() {
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await base44.auth.register(email, password, fullName || email.split('@')[0]);
      window.location.href = next;
    } catch (err) {
      setError(err?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-white">Create account</h1>
        <input className="w-full rounded bg-zinc-800 text-white p-3" type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input className="w-full rounded bg-zinc-800 text-white p-3" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded bg-zinc-800 text-white p-3" type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}
        <button disabled={loading} className="w-full rounded bg-amber-500 text-black p-3 font-semibold disabled:opacity-60" type="submit">
          {loading ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-zinc-400 text-sm">Already have an account? <Link className="text-amber-400" to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
      </form>
    </div>
  );
}
