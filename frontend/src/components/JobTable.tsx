"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PaymentProofUpload } from "@/components/PaymentProofUpload";
import { StatusPill } from "@/components/StatusPill";
import { createBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase-client";
import { LeadJob } from "@/lib/types";

type JobTableProps = {
  refreshSignal: number;
};

type LeadExportFile = NonNullable<LeadJob["lead_exports"]>[number];

export function JobTable({ refreshSignal }: JobTableProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [jobs, setJobs] = useState<LeadJob[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadJobs() {
    setLoading(true);
    setMessage("");
    if (!supabase) {
      setLoading(false);
      setJobs([]);
      setMessage("Supabase public env vars are not configured.");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      setJobs([]);
      setMessage("Sign in to see jobs.");
      return;
    }

    const response = await fetch("/api/jobs", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not load jobs.");
      return;
    }

    setJobs(payload.jobs ?? []);
  }

  async function downloadExport(file: LeadExportFile) {
    if (file.public_url) {
      window.open(file.public_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!supabase || !file.storage_path) {
      setMessage("No download URL is available for this export yet.");
      return;
    }

    const { data, error } = await supabase.storage.from("lead-exports").createSignedUrl(file.storage_path, 60 * 60);
    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? "Could not create a download link.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    loadJobs();
  }, [refreshSignal]);

  return (
    <div className="panel panel-inner stack">
      <div className="row">
        <div className="tight-stack">
          <h2>Lead jobs</h2>
          <p>Payment review, worker progress, and export delivery live here.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={loadJobs} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {message && <div className="notice warning">{message}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Pack</th>
              <th>Target</th>
              <th>Payment</th>
              <th>Exports</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No jobs yet.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <div className="tight-stack">
                    <StatusPill status={job.status} />
                    <span className="muted">{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                </td>
                <td>
                  <strong>{job.plan_name}</strong>
                  <p>
                    {job.lead_limit} leads - ${job.price_usd}
                  </p>
                </td>
                <td>
                  <strong>{job.target_region}</strong>
                  <p>{job.refined_industry || job.original_industry}</p>
                </td>
                <td style={{ minWidth: 280 }}>
                  <div className="tight-stack">
                    <StatusPill status={job.payment_status} />
                    {job.payment_status === "pending" && (
                      <PaymentProofUpload jobId={job.id} amountUsd={job.price_usd} onUploaded={loadJobs} />
                    )}
                    {job.payment_status !== "pending" && job.admin_note && <p>{job.admin_note}</p>}
                  </div>
                </td>
                <td>
                  <div className="tight-stack">
                    {job.lead_exports && job.lead_exports.length > 0 ? (
                      job.lead_exports.map((file) => (
                        <button className="btn btn-secondary" key={file.id} type="button" onClick={() => downloadExport(file)}>
                          {file.format.toUpperCase()}
                        </button>
                      ))
                    ) : (
                      <span className="muted">Waiting for delivery</span>
                    )}
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
