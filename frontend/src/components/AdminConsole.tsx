"use client";

import { useState } from "react";
import { Check, RefreshCw, RotateCcw, X } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { LeadJob } from "@/lib/types";

export function AdminConsole() {
  const [password, setPassword] = useState("");
  const [jobs, setJobs] = useState<LeadJob[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="stack">
      <div className="panel panel-inner stack">
        <div className="row">
          <div className="tight-stack">
            <h2>Admin queue</h2>
            <p>Approve manual proofs, demo-bypass jobs, retry failures, and mark manual deliveries.</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={loadJobs} disabled={loading || !password}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        </div>
        <div className="field">
          <label htmlFor="admin-password">Admin password</label>
          <input
            id="admin-password"
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="ADMIN_PASSWORD"
          />
        </div>
        {message && <div className="notice">{message}</div>}
      </div>

      <div className="panel panel-inner table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Customer</th>
              <th>Target</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Enter the password and refresh.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <div className="tight-stack">
                    <StatusPill status={job.status} />
                    <span className="muted">{job.id.slice(0, 8)}</span>
                  </div>
                </td>
                <td>
                  <strong>{job.customer_email}</strong>
                  <p>
                    {job.plan_name} · ${job.price_usd}
                  </p>
                </td>
                <td>
                  <strong>{job.target_region}</strong>
                  <p>{job.refined_industry || job.original_industry}</p>
                </td>
                <td>
                  <div className="tight-stack">
                    <StatusPill status={job.payment_status} />
                    {job.payment_proofs?.map((proof) => (
                      <span className="muted" key={proof.id}>
                        {proof.transaction_id || "proof"} {proof.storage_path ? `· ${proof.storage_path}` : ""}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="tight-stack">
                    <button className="btn btn-primary" type="button" onClick={() => runAction(job.id, "approve")}>
                      <Check size={16} aria-hidden="true" />
                      Approve
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => runAction(job.id, "retry")}>
                      <RotateCcw size={16} aria-hidden="true" />
                      Retry
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => runAction(job.id, "mark_delivered")}>
                      Delivered
                    </button>
                    <button className="btn btn-danger" type="button" onClick={() => runAction(job.id, "reject")}>
                      <X size={16} aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
