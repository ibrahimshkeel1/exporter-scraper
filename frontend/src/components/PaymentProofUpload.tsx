"use client";

import { FormEvent, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { createBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase-client";

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
    <form className="stack" onSubmit={submitProof}>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`transaction-${jobId}`}>Transaction ID</label>
          <input
            id={`transaction-${jobId}`}
            className="input"
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            placeholder="Easypaisa/JazzCash/reference"
          />
        </div>
        <div className="field">
          <label htmlFor={`proof-${jobId}`}>Screenshot</label>
          <input
            id={`proof-${jobId}`}
            className="input"
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`note-${jobId}`}>Note</label>
        <input
          id={`note-${jobId}`}
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <button className="btn btn-secondary" type="submit" disabled={loading}>
        <Upload size={16} aria-hidden="true" />
        {loading ? "Uploading" : `Submit proof for $${amountUsd}`}
      </button>
      {message && <p className="muted">{message}</p>}
    </form>
  );
}
