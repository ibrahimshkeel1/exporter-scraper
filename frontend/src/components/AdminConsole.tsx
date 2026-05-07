"use client";

import { useState } from "react";
import { Check, KeyRound, RefreshCw, RotateCcw, X, TerminalSquare, SlidersHorizontal } from "lucide-react";
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
    <div className="flex flex-col gap-4">
      <div className="ide-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-vercel-text">Operator Console</h2>
            <p className="text-xs text-vercel-muted">Queue control, retries, delivery overrides, and config tuning.</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/admin/config-tuning"
              className="ide-btn inline-flex items-center gap-2 px-3 py-2 text-xs no-underline"
            >
              <SlidersHorizontal size={14} />
              Config Tuning
            </a>
            <button className="ide-btn inline-flex items-center gap-2 px-3 py-2 text-xs" type="button" onClick={loadJobs} disabled={loading || !password}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <input className="ide-input px-3 py-2 text-sm" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="ADMIN_PASSWORD" />
          <input className="ide-input px-3 py-2 text-sm" type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="customer@example.com" />
          <div className="flex gap-2">
            <input className="ide-input flex-1 px-3 py-2 text-sm" type="password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} placeholder="Set password (8+)" />
            <button className="ide-btn inline-flex items-center gap-2 px-3 text-xs" type="button" onClick={setLoginPassword} disabled={!password || !userEmail || userPassword.length < 8}>
              <KeyRound size={14} />
              Set
            </button>
          </div>
        </div>

        {message && <div className="mt-2 border border-[#30363d] bg-[#010409] px-3 py-2 text-xs text-vercel-text">{message}</div>}
      </div>

      <div className="ide-panel overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#30363d] bg-[#161b22]">
              <th className="px-3 py-2 text-xs text-vercel-muted">Status</th>
              <th className="px-3 py-2 text-xs text-vercel-muted">Customer</th>
              <th className="px-3 py-2 text-xs text-vercel-muted">Target</th>
              <th className="px-3 py-2 text-xs text-vercel-muted">Payment</th>
              <th className="px-3 py-2 text-xs text-vercel-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-xs text-vercel-muted">
                  Enter admin password and refresh.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-[#30363d]">
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    <StatusPill status={job.status} />
                    <span className="font-mono text-[11px] text-vercel-muted">{job.id.slice(0, 8)}</span>
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-xs">
                  <p className="text-vercel-text">{job.customer_email}</p>
                  <p className="text-vercel-muted">{job.plan_name} | ${job.price_usd}</p>
                </td>
                <td className="px-3 py-3 align-top text-xs">
                  <p className="text-vercel-text">{job.target_region}</p>
                  <p className="text-vercel-muted">{job.refined_industry || job.original_industry}</p>
                </td>
                <td className="px-3 py-3 align-top text-xs">
                  <StatusPill status={job.payment_status} />
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap gap-1">
                    <button className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-xs" type="button" onClick={() => runAction(job.id, "approve")}><Check size={12} />Approve</button>
                    <button className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-xs" type="button" onClick={() => runAction(job.id, "retry")}><RotateCcw size={12} />Retry</button>
                    <button className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-xs" type="button" onClick={() => runAction(job.id, "mark_delivered")}>Delivered</button>
                    <button className="ide-btn inline-flex items-center gap-1 px-2 py-1 text-xs" type="button" onClick={() => runAction(job.id, "reject")}><X size={12} />Reject</button>
                    <button
                      className="ide-btn ide-btn-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                      type="button"
                      onClick={() => {
                        setActiveJobId(job.id);
                        setActiveLogs((job as any).job_events || []);
                      }}
                    >
                      <TerminalSquare size={12} /> Logs
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
