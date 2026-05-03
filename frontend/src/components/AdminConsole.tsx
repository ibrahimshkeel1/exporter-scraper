"use client";

import { useState } from "react";
import { Check, KeyRound, RefreshCw, RotateCcw, X, TerminalSquare } from "lucide-react";
import { StatusPill } from "./StatusPill";
import { JobLogViewer, JobEvent } from "./JobLogViewer";
import { LeadJob } from "../lib/types";

export function AdminConsole() {
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [jobs, setJobs] = useState<LeadJob[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeLogs, setActiveLogs] = useState<JobEvent[] | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/jobs", {
      headers: { "x-admin-password": password }
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not load admin queue.");
      return;
    }

    setJobs(payload.jobs ?? []);
  }

  async function runAction(jobId: string, action: "approve" | "reject" | "retry" | "mark_delivered") {
    setMessage("");
    const response = await fetch(`/api/admin/jobs/${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password
      },
      body: JSON.stringify({ action })
    });
    const payload = await response.json();

    if (!response.ok && response.status !== 202) {
      setMessage(payload.error ?? "Admin action failed.");
      return;
    }

    setMessage(payload.warning ?? "Admin action completed.");
    await loadJobs();
  }

  async function setLoginPassword() {
    setMessage("");
    const response = await fetch("/api/admin/users/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password
      },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Could not set login password.");
      return;
    }

    setMessage(`Password ${payload.mode === "created" ? "created" : "updated"} for ${userEmail}.`);
    setUserPassword("");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold text-vercel-text tracking-tight">Admin queue</h2>
            <p className="text-sm text-vercel-muted">Approve manual proofs, demo-bypass jobs, retry failures, and mark manual deliveries.</p>
          </div>
          <button className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 text-vercel-text hover:bg-white/5 rounded-lg px-4 py-2 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" type="button" onClick={loadJobs} disabled={loading || !password}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Refresh
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="admin-password" className="text-sm font-medium text-vercel-text">Admin password</label>
          <input
            id="admin-password"
            className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 placeholder:text-gray-600"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="ADMIN_PASSWORD"
          />
        </div>
        <div className="flex flex-wrap items-end gap-5 pt-6 border-t border-white/10">
          <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
            <label htmlFor="login-email" className="text-sm font-medium text-vercel-text">User email</label>
            <input
              id="login-email"
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 placeholder:text-gray-600"
              type="email"
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
            <label htmlFor="login-password" className="text-sm font-medium text-vercel-text">Set password</label>
            <input
              id="login-password"
              className="bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent text-vercel-text transition-all hover:border-white/20 placeholder:text-gray-600"
              type="password"
              value={userPassword}
              onChange={(event) => setUserPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 text-vercel-text hover:bg-white/5 rounded-lg px-6 py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            type="button"
            onClick={setLoginPassword}
            disabled={!password || !userEmail || userPassword.length < 8}
          >
            <KeyRound size={16} aria-hidden="true" />
            Set login
          </button>
        </div>
        {message && <div className="text-sm text-vercel-text bg-black/50 border border-white/10 px-4 py-3 rounded-lg shadow-sm">{message}</div>}
      </div>

      <div className="bg-gradient-to-b from-[#18181B] to-[#09090B] backdrop-blur-md border border-white/10 rounded-xl p-8 shadow-2xl">
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-black/40">
                <th className="py-4 px-4 font-medium text-vercel-muted">Status</th>
                <th className="py-4 px-4 font-medium text-vercel-muted">Customer</th>
                <th className="py-4 px-4 font-medium text-vercel-muted">Target</th>
                <th className="py-4 px-4 font-medium text-vercel-muted">Payment</th>
                <th className="py-4 px-4 font-medium text-vercel-muted">Actions & Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-vercel-muted">
                    Enter the password and refresh.
                  </td>
                </tr>
              )}
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-white/5 transition-colors group">
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-col gap-1.5 items-start">
                      <StatusPill status={job.status} />
                      <span className="text-xs text-vercel-muted font-mono opacity-70 group-hover:opacity-100 transition-opacity">{job.id.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-col gap-1">
                      <strong className="font-medium text-vercel-text">{job.customer_email}</strong>
                      <span className="text-vercel-muted">
                        {job.plan_name} - ${job.price_usd}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-col gap-1">
                      <strong className="font-medium text-vercel-text">{job.target_region}</strong>
                      <span className="text-vercel-muted">{job.refined_industry || job.original_industry}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-col gap-1.5 items-start">
                      <StatusPill status={job.payment_status} />
                      {job.payment_proofs?.map((proof) => (
                        <span className="text-xs text-vercel-muted truncate max-w-[150px] bg-black/40 px-2 py-1 rounded border border-white/5" key={proof.id} title={proof.transaction_id || proof.storage_path || "proof"}>
                          {proof.transaction_id || "proof"} {proof.storage_path ? `- ${proof.storage_path}` : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      <button className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" type="button" onClick={() => runAction(job.id, "approve")}>
                        <Check size={14} aria-hidden="true" />
                        Approve
                      </button>
                      <button className="inline-flex items-center gap-1.5 bg-black/50 border border-white/10 text-vercel-text hover:bg-white/10 rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" type="button" onClick={() => runAction(job.id, "retry")}>
                        <RotateCcw size={14} aria-hidden="true" />
                        Retry
                      </button>
                      <button className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" type="button" onClick={() => runAction(job.id, "mark_delivered")}>
                        Delivered
                      </button>
                      <button className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]" type="button" onClick={() => runAction(job.id, "reject")}>
                        <X size={14} aria-hidden="true" />
                        Reject
                      </button>
                      
                      <button 
                        onClick={() => {
                          setActiveJobId(job.id);
                          setActiveLogs((job as any).job_events || []);
                        }}
                        className="inline-flex items-center gap-1.5 bg-vercel-accent text-black hover:bg-white rounded-md px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                      >
                        <TerminalSquare size={14} /> Logs
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {activeJobId && activeLogs && (
        <JobLogViewer 
          jobId={activeJobId} 
          initialEvents={activeLogs} 
          onClose={() => {
            setActiveJobId(null);
            setActiveLogs(null);
          }} 
        />
      )}
    </div>
  );
}
