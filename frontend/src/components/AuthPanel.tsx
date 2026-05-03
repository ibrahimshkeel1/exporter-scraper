"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Mail } from "lucide-react";
import { createBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase-client";

type AuthPanelProps = {
  compact?: boolean;
  onSessionChange?: () => void;
};

export function AuthPanel({ compact = false, onSessionChange }: AuthPanelProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentEmail(session?.user?.email ?? null);
      onSessionChange?.();
    });

    return () => listener.subscription.unsubscribe();
  }, [onSessionChange, supabase]);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Supabase public env vars are not configured.");
      return;
    }
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);
    setMessage(error ? error.message : "Signed in.");
  }

  async function sendEmailLink() {
    if (!supabase) {
      setMessage("Supabase public env vars are not configured.");
      return;
    }
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`
      }
    });

    setLoading(false);
    setMessage(error ? error.message : "Check your email for the login link.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentEmail(null);
    onSessionChange?.();
  }

  if (currentEmail) {
    return (
      <div className={compact ? "flex items-center gap-4" : "bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl flex items-center justify-between gap-4"}>
        <div className="flex flex-col gap-1.5">
          <strong className="font-medium text-vercel-text text-lg">{currentEmail}</strong>
          {!compact && <span className="text-sm text-vercel-muted">Signed in and ready to create lead jobs.</span>}
        </div>
        <button className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 text-vercel-text hover:bg-white/5 rounded-lg px-5 py-2.5 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap" type="button" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className={compact ? "text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-lg" : "bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl text-sm text-amber-400 bg-amber-500/10"}>
        Supabase public env vars are not configured.
      </div>
    );
  }

  return (
    <form className={compact ? "flex items-center gap-4" : "bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl flex flex-col gap-6"} onSubmit={signInWithPassword}>
      {!compact && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold text-vercel-text tracking-tight">Sign in</h3>
          <p className="text-sm text-vercel-muted">Password login avoids local testing email limits. Email links remain available as a fallback.</p>
        </div>
      )}
      <div className={compact ? "flex flex-1 gap-4 items-end" : "flex flex-col gap-5"}>
        <div className="flex flex-col gap-2 flex-1">
          <label htmlFor="email" className="text-sm font-medium text-vercel-text">Email</label>
          <input
            id="email"
            className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 placeholder:text-gray-600"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <label htmlFor="password" className="text-sm font-medium text-vercel-text">Password</label>
          <input
            id="password"
            className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 placeholder:text-gray-600"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
      </div>
      <div className={compact ? "flex items-center gap-3" : "flex flex-wrap gap-4"}>
        <button className="inline-flex items-center justify-center gap-2 bg-vercel-accent text-black hover:bg-white rounded-lg px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] flex-1 sm:flex-none" type="submit" disabled={loading}>
          <LogIn size={18} aria-hidden="true" />
          {loading ? "Signing in..." : "Password login"}
        </button>
        <button className="inline-flex items-center justify-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 text-vercel-text hover:bg-white/5 rounded-lg px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] flex-1 sm:flex-none" type="button" onClick={sendEmailLink} disabled={loading || !email}>
          <Mail size={18} aria-hidden="true" />
          Email link
        </button>
      </div>
      {message && <p className="text-sm text-vercel-muted mt-2">{message}</p>}
    </form>
  );
}
