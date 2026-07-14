import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RecruiteraLogo } from '@/components/layout/RecruiteraLogo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setErr(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-sh2 p-8 space-y-5"
      >
        <div className="flex flex-col items-center gap-3 pb-2">
          <RecruiteraLogo size={44} />
          <div className="text-center">
            <h1 className="text-lg font-bold text-text">Recruitera CRM</h1>
            <p className="text-[12px] text-text-3">Sign in to continue</p>
          </div>
        </div>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-3">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] text-text outline-none focus:border-accent-strong"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-3">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] text-text outline-none focus:border-accent-strong"
          />
        </label>

        {err && (
          <div className="text-[12px] text-bad bg-bad-bg border border-bad/20 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-cg-900 text-white text-[13px] font-bold hover:bg-cg-800 disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
