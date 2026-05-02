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

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      <div className={compact ? "row" : "panel panel-inner row"}>
        <div className="tight-stack">
          <strong>{currentEmail}</strong>
          {!compact && <span className="muted">Signed in and ready to create lead jobs.</span>}
        </div>
        <button className="btn btn-secondary" type="button" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className={compact ? "notice warning" : "panel panel-inner notice warning"}>
        Supabase public env vars are not configured.
      </div>
    );
  }

  return (
    <form className={compact ? "row" : "panel panel-inner stack"} onSubmit={signIn}>
      {!compact && (
        <div className="tight-stack">
          <h3>Sign in</h3>
          <p>Use email login for the first-circle launch. Supabase handles the session.</p>
        </div>
      )}
      <div className="field" style={{ flex: 1 }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? <Mail size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
        {loading ? "Sending" : "Email link"}
      </button>
      {message && <p className="muted">{message}</p>}
    </form>
  );
}
