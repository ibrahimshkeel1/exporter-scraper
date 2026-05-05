# ExportFlow SaaS Implementation

## Components

- Frontend: `frontend/` (Next.js on Vercel)
- Database and storage: Supabase
- Automation: n8n webhook flow
- Worker API: `worker_api.py` on VPS
- Scraper engine: `scraper/main.py` via `final scrapper.py`

## Required Environment Variables

Frontend server environment (`frontend/.env.local` and Vercel):

```env
APP_URL=https://your-app-domain
NEXT_PUBLIC_APP_URL=https://your-app-domain
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GEMINI_API_KEY=<gemini-key>
GEMINI_MODEL=gemini-3-flash-preview
N8N_LEAD_JOB_WEBHOOK_URL=https://your-n8n-domain/webhook/exportflow-lead-job
N8N_WEBHOOK_SECRET=<shared-secret>
ADMIN_PASSWORD=<admin-password>
ADMIN_BYPASS_CODE=<admin-bypass-code>
WORKER_OUTPUT_BASE_DIR=exports/worker-runs
WORKER_API_URL=https://your-worker-domain
```

Worker environment (`/srv/exportflow/worker.env` on VPS):

```env
WORKER_PORT=8787
WORKER_API_SECRET=<shared-secret>
N8N_WEBHOOK_SECRET=<shared-secret>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_EXPORT_BUCKET=lead-exports
EXPORTFLOW_PROXY_POOL=http://user:pass@host:port,http://user:pass@host2:port
EXPORTFLOW_PROXY_HEALTHCHECK_URL=https://ip.oxylabs.io/location
EXPORTFLOW_PROXY_HEALTHCHECK_TIMEOUT_SECONDS=12
EXPORTFLOW_PROXY_MIN_HEALTHY=1
```

Critical key rule:

- `SUPABASE_SERVICE_ROLE_KEY` must be a JWT with `role=service_role`.
- Do not use an anon key in this variable, or export upload/registration will fail.

## Job Execution Contract

Worker endpoint:

```text
POST /run-job
Header: x-exportflow-secret: <shared-secret>
```

Expected payload:

```json
{
  "job_id": "uuid",
  "status_callback": "https://app/api/jobs/uuid/events",
  "export_callback": "https://app/api/jobs/uuid/exports",
  "job_config": {
    "job_id": "uuid",
    "targeting": {
      "region": "USA",
      "industry": "Architecture, Engineering, and Construction"
    },
    "lead_pack": {
      "limit": 10,
      "min_score": 75,
      "max_analyzed": 3000,
      "fill_until_complete": true
    },
    "delivery": {
      "format": "all",
      "output_dir": "exports/worker-runs/uuid/exports"
    }
  }
}
```

## Status Flow

Normal successful flow:

```text
queued -> running -> exporting -> delivered
```

If scraper succeeds but upload fails:

```text
running -> exporting -> failed (delivery failed)
```

## Live Logs

- Frontend streams via: `GET /api/jobs/<job_id>/logs`
- Worker logs and events live under: `exports/worker-runs/<job_id>/`

