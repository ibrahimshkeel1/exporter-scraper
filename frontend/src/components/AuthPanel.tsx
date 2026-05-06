"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Mail } from "lucide-react";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";

type AuthPanelProps = {
  compact?: boolean;
  onSessionChange?: () => void;
};

function isLocalOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function authRedirectUrl() {
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const configuredOrigin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

  if (currentOrigin && !isLocalOrigin(currentOrigin)) {
    return `${currentOrigin}/dashboard`;
  }
  if (configuredOrigin && !isLocalOrigin(configuredOrigin)) {
    return `${configuredOrigin}/dashboard`;
  }
  return `${currentOrigin || configuredOrigin}/dashboard`;
}

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
        emailRedirectTo: authRedirectUrl()
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
    if (compact) {
      return (
        <div className="ide-panel space-y-2 p-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Signed in</p>
            <p className="break-all text-xs font-medium leading-5 text-vercel-text" title={currentEmail}>{currentEmail}</p>
          </div>
          <button className="ide-btn inline-flex h-8 w-full items-center justify-center gap-2 px-3 text-xs" type="button" onClick={signOut}>
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      );
    }
    return (
      <div className="ide-panel flex items-center justify-between gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <strong className="font-medium text-vercel-text text-lg">{currentEmail}</strong>
          <span className="text-sm text-vercel-muted">Signed in and ready to create lead jobs.</span>
        </div>
        <button className="ide-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium whitespace-nowrap" type="button" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    );
  }

  if (!supabase) {
    if (compact) {
      return (
        <div className="border border-[#ff6b6b] bg-[#220b0b] px-3 py-2 text-xs text-[#ff6b6b]">
          Supabase env vars missing.
        </div>
      );
    }
    return (
      <div className="ide-panel bg-[#220b0b] p-4 text-sm text-[#ff6b6b]">
        Supabase public env vars are not configured.
      </div>
    );
  }

  if (compact) {
    return (
      <form className="ide-panel space-y-2 p-3" onSubmit={signInWithPassword}>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Account</p>
          <input
            id="email"
            className="ide-input h-8 w-full px-3 text-xs"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            id="password"
            className="ide-input h-8 w-full px-3 text-xs"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button className="ide-btn ide-btn-primary inline-flex h-8 items-center justify-center gap-1 px-2 text-[11px] font-medium" type="submit" disabled={loading}>
            <LogIn size={13} aria-hidden="true" />
            Login
          </button>
          <button className="ide-btn inline-flex h-8 items-center justify-center gap-1 px-2 text-[11px]" type="button" onClick={sendEmailLink} disabled={loading || !email}>
            <Mail size={13} aria-hidden="true" />
            Email link
          </button>
        </div>
        {message && <p className="text-[11px] text-vercel-muted">{message}</p>}
      </form>
    );
  }

  return (
    <form className="ide-panel flex flex-col gap-6 p-6" onSubmit={signInWithPassword}>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-vercel-text tracking-tight">Sign in</h3>
        <p className="text-sm text-vercel-muted">Password login avoids local testing email limits. Email links remain available as a fallback.</p>
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 flex-1">
          <label htmlFor="email" className="text-sm font-medium text-vercel-text">Email</label>
          <input
            id="email"
            className="ide-input px-4 py-3 text-sm placeholder:text-gray-600"
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
            className="ide-input px-4 py-3 text-sm placeholder:text-gray-600"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <button className="ide-btn ide-btn-primary inline-flex flex-1 items-center justify-center gap-2 px-6 py-3 text-sm font-medium sm:flex-none" type="submit" disabled={loading}>
          <LogIn size={18} aria-hidden="true" />
          {loading ? "Signing in..." : "Password login"}
        </button>
        <button className="ide-btn inline-flex flex-1 items-center justify-center gap-2 px-6 py-3 text-sm font-medium sm:flex-none" type="button" onClick={sendEmailLink} disabled={loading || !email}>
          <Mail size={18} aria-hidden="true" />
          Email link
        </button>
      </div>
      {message && <p className="text-sm text-vercel-muted mt-2">{message}</p>}
    </form>
  );
}
