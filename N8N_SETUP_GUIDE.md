# n8n Setup Guide (Current)

## Purpose

This guide covers the active n8n role in ExportFlow:

- receive approved lead jobs from frontend
- forward jobs to worker API
- optionally notify user after delivery

## Required Nodes

1. Webhook (`POST /webhook/exportflow-lead-job`)
2. HTTP Request (call worker `POST /run-job`)
3. Optional notification node (email/Slack/etc.)

## Webhook Input Contract

n8n receives payload from frontend similar to:

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

## HTTP Request Node (Worker Call)

- Method: `POST`
- URL: `http://172.17.0.1:8787/run-job` (if n8n Docker + worker on host)
- Header:
  - `x-exportflow-secret: <same-as-worker-secret>`
- Body JSON:

```json
{
  "job_id": "{{ $json.body.job_id }}",
  "status_callback": "{{ $json.body.status_callback }}",
  "export_callback": "{{ $json.body.export_callback }}",
  "job_config": {{ JSON.stringify($json.body.job_config) }}
}
```

Important:

- Do not prefix fields with `=`.
- Keep `job_config` as JSON object, not stringified string text.

## Secrets

n8n and worker must share the same secret:

- `N8N_WEBHOOK_SECRET` (n8n)
- `WORKER_API_SECRET` and `N8N_WEBHOOK_SECRET` (worker env)

## Smoke Test

```bash
curl -s http://127.0.0.1:8787/health
```

Expected:

```json
{"ok": true, "service": "exportflow-worker"}
```

## Failure Signals

- Worker accepts job but ends with `export delivery failed`:
  - check `SUPABASE_SERVICE_ROLE_KEY` on worker env is `service_role`, not anon.
- n8n cannot reach worker:
  - verify URL (`172.17.0.1` from Docker) and firewall/network.
- job IDs malformed (`=uuid`):
  - expression formatting in n8n body is wrong.

