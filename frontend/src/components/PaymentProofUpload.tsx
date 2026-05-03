"use client";

import { FormEvent, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";

type PaymentProofUploadProps = {
  jobId: string;
  amountUsd: number;
  onUploaded?: () => void;
};

export function PaymentProofUpload({ jobId, amountUsd, onUploaded }: PaymentProofUploadProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [file, setFile] = useState<File | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (!supabase) {
      setLoading(false);
      setMessage("Supabase public env vars are not configured.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const token = session?.access_token;
    if (!session || !token) {
      setLoading(false);
      setMessage("Sign in before uploading payment proof.");
      return;
    }

    let storagePath: string | null = null;
    if (file) {
      storagePath = `${session.user.id}/${jobId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(storagePath, file, {
        upsert: false
      });
      if (uploadError) {
        setLoading(false);
        setMessage(uploadError.message);
        return;
      }
    }

    const response = await fetch(`/api/jobs/${jobId}/payment-proof`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        amountUsd,
        transactionId,
        storagePath,
        note
      })
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not submit payment proof.");
      return;
    }

    setMessage("Payment proof submitted.");
    setFile(null);
    setTransactionId("");
    setNote("");
    onUploaded?.();
  }

  return (
    <form className="flex flex-col gap-4 mt-2" onSubmit={submitProof}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`transaction-${jobId}`} className="text-xs font-medium text-vercel-text">Transaction ID</label>
          <input
            id={`transaction-${jobId}`}
            className="bg-transparent border border-vercel-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vercel-accent focus:border-transparent text-vercel-text"
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            placeholder="Easypaisa/JazzCash/reference"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`proof-${jobId}`} className="text-xs font-medium text-vercel-text">Screenshot</label>
          <input
            id={`proof-${jobId}`}
            className="bg-transparent border border-vercel-border rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-vercel-accent focus:border-transparent text-vercel-text file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-[#111] file:text-vercel-text hover:file:bg-gray-100"
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`note-${jobId}`} className="text-xs font-medium text-vercel-text">Note</label>
        <input
          id={`note-${jobId}`}
          className="bg-transparent border border-vercel-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-vercel-accent focus:border-transparent text-vercel-text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <button className="inline-flex w-fit items-center justify-center gap-2 bg-transparent border border-vercel-border text-vercel-text hover:bg-[#222] rounded-md px-3 py-1.5 text-sm font-medium transition-colors" type="submit" disabled={loading}>
        <Upload size={14} aria-hidden="true" />
        {loading ? "Uploading" : `Submit proof for $${amountUsd}`}
      </button>
      {message && <p className="text-xs text-vercel-muted">{message}</p>}
    </form>
  );
}
