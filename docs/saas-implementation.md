# ExportFlow SaaS Implementation Notes

## Runtime Shape

- **Frontend**: `frontend/` Next.js app deployed on Vercel.
- **Database and files**: Supabase Auth, Postgres, and Storage.
- **Automation**: n8n receives approved jobs, runs the VPS scraper, sends status callbacks, uploads exports, and emails customers.
- **Worker**: `python "final scrapper.py" --job-config <path> --status-output <path>`.

## Required Environment

Set these in Vercel:

```env
NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3-flash-preview
N8N_LEAD_JOB_WEBHOOK_URL=https://your-n8n-domain/webhook/exportflow-lead-job
N8N_WEBHOOK_SECRET=
ADMIN_PASSWORD=
ADMIN_BYPASS_CODE=
```

Set these on the VPS/n8n host:

```env
EXPORTFLOW_APP_URL=https://your-vercel-domain.vercel.app
N8N_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Enable email OTP in Supabase Auth.
4. Keep `payment-proofs` and `lead-exports` private.
5. Use the service role key only in Vercel server-side API routes and n8n.

## n8n Lead Job Workflow

Webhook input from the frontend:

```json
{
  "job_id": "uuid",
  "customer_email": "buyer@example.com",
  "status_callback": "https://app/api/jobs/uuid/events",
  "export_callback": "https://app/api/jobs/uuid/exports",
  "job_config": {
    "job_id": "uuid",
    "targeting": {
      "region": "USA",
      "industry": "socks hosiery buyers",
      "refined_industry": "socks hosiery importers wholesalers private label buyers",
      "search_terms": ["socks importer wholesaler USA contact"]
    },
    "lead_pack": {
      "limit": 10,
      "min_score": 75,
      "mode": "verified"
    },
    "quality": {
      "allow_no_email": false,
      "allow_weak_buyer_evidence": false,
      "a_plus_score": 85
    },
    "delivery": {
      "format": "all",
      "output_dir": "/srv/exportflow/runs/uuid"
    }
  }
}
```

Recommended n8n nodes:

1. Webhook: `POST /webhook/exportflow-lead-job`, validate `x-exportflow-secret`.
2. HTTP Request: call the VPS worker API.
3. Later: add status polling, Supabase upload, and customer email delivery.

If your n8n has no **Execute Command** node, run the worker API on the VPS:

```bash
cd /srv/exportflow
export WORKER_API_SECRET="same-value-as-N8N_WEBHOOK_SECRET"
export WORKER_PORT=8787
python worker_api.py
```

Then configure the n8n **HTTP Request** node:

```text
Method: POST
URL: http://127.0.0.1:8787/run-job
Send Headers: true
Header name: x-exportflow-secret
Header value: same-value-as-N8N_WEBHOOK_SECRET
Send Body: true
Body Content Type: JSON
Body:
{
  "job_id": "{{ $json.body.job_id }}",
  "job_config": {{ JSON.stringify($json.body.job_config) }}
}
```

The worker writes run files under:

```text
exports/worker-runs/<job_id>/
```

It returns immediately with `202`, then the scraper keeps running in the background.

When you are ready for delivery automation, add nodes to upload generated `.xlsx`, `.csv`, and `.json` files to Supabase Storage bucket `lead-exports`, then POST registered files to `export_callback`:

   ```json
   {
     "exports": [
       {
         "format": "xlsx",
         "storage_path": "uuid/uuid_leads.xlsx",
         "public_url": "signed-or-public-download-url",
         "row_count": 10
       }
     ]
   }
   ```
Finally, send the customer email when exports are registered.

## Worker Contract

The scraper now accepts:

```bash
python "final scrapper.py" --job-config scraper/job_config.example.json --status-output exports/demo/events.jsonl
```

Output events are emitted to stdout as:

```text
SCRAPER_EVENT {"status":"discovering","message":"Discovering candidate buyer websites.","job_id":"demo-job-001"}
```

The same JSON is appended to `--status-output` when provided.

## Launch Guardrails

- Keep v1 focused on apparel/textile exporters in Pakistan.
- Use admin bypass only for demos and internal proof runs.
- Do not enable automated outreach until lead-pack buyers are converting.
- Cap self-serve jobs to 60 leads until the 1000-lead batch path is chunked, resumable, and monitored.
- Treat 1000-lead batches as custom quotes with manual QA.
