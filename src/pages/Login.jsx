import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await base44.auth.login(email, password);
      window.location.href = next;
    } catch (err) {
      setError(err?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <input className="w-full rounded bg-zinc-800 text-white p-3" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded bg-zinc-800 text-white p-3" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}
        <button disabled={loading} className="w-full rounded bg-amber-500 text-black p-3 font-semibold disabled:opacity-60" type="submit">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-zinc-400 text-sm">No account? <Link className="text-amber-400" to={`/register?next=${encodeURIComponent(next)}`}>Register</Link></p>
        <button type="button" onClick={() => navigate('/')} className="text-zinc-500 text-sm">Back to home</button>
      </form>
    </div>
  );
}
