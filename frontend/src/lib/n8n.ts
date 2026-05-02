import { LeadJob } from "@/lib/types";

export async function triggerLeadJob(job: LeadJob) {
  const webhookUrl = process.env.N8N_LEAD_JOB_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookUrl) {
    return {
      ok: false,
      error: "N8N_LEAD_JOB_WEBHOOK_URL is not configured."
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookSecret ? { "x-exportflow-secret": webhookSecret } : {})
    },
    body: JSON.stringify({
      job_id: job.id,
      customer_email: job.customer_email,
      status_callback: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${job.id}/events`,
      export_callback: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${job.id}/exports`,
      job_config: job.job_config
    })
  });

  if (!response.ok) {
    return {
      ok: false,
      error: `n8n webhook failed with HTTP ${response.status}.`
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { ok: true, payload };
}
