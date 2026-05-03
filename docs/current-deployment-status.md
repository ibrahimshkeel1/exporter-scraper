# Current Deployment Status

Last updated: 2026-05-02

## Project State

The ExportFlow SaaS is deployed and connected end to end for a live test run.

Current live website:

```text
https://exportflow-lovat.vercel.app
```

Current n8n webhook:

```text
https://n8n.cristalinawater.com/webhook/exportflow-lead-job
```

Current VPS:

```text
5.75.161.50
```

Secrets and passwords are intentionally not written in this file. They are stored in Vercel environment variables and `/srv/exportflow/worker.env` on the VPS.

## What Has Been Done

- Frontend deployed to Vercel as `exportflow`.
- Vercel production alias is `https://exportflow-lovat.vercel.app`.
- Supabase environment variables were added to Vercel production.
- Admin login works.
- A customer login was created through the admin page.
- Customer dashboard login works.
- VPS worker files were uploaded to `/srv/exportflow`.
- Old VPS version was backed up under `/srv/exportflow-backup-before-new-worker`.
- Python virtual environment exists at `/srv/exportflow/venv`.
- Scraper dependencies and Playwright Chromium were installed on VPS.
- Worker service was created as `exportflow-worker.service`.
- Worker health check passed:

```bash
curl http://127.0.0.1:8787/health
```

Expected output:

```json
{"ok": true, "service": "exportflow-worker"}
```

- VPS scraper smoke test passed with 1 lead.
- n8n is running in Docker on the same VPS.
- n8n can reach the worker from inside Docker using:

```text
http://172.17.0.1:8787
```

- n8n workflow was connected:

```text
Vercel website -> n8n webhook -> VPS worker -> scraper
```

- A job reached the worker and the website showed `running`.

## Current Stage

The system is operational for a real end-to-end test.

The first full 10-lead tests proved the deployment path but failed lead delivery because the strict scraper only found 1/10 qualified leads for broad apparel targets. That is a quality/targeting issue, not a website/n8n/VPS connection issue.

Admin-bypass jobs are now intended for proof runs:

```text
admin bypass -> 1 relaxed demo lead -> fast delivered proof
```

Normal paid jobs still use the stricter paid-pack settings.

Expected status flow for a clean run:

```text
queued -> running -> delivered
```

After `delivered`, the dashboard should show export buttons such as CSV, JSON, or XLSX.

Do not click `Retry` while a job is already `running`, because that can start duplicate worker processes.

## n8n Workflow Settings

Webhook node:

```text
HTTP Method: POST
Path: exportflow-lead-job
Production URL: https://n8n.cristalinawater.com/webhook/exportflow-lead-job
```

HTTP Request node:

```text
Method: POST
URL: http://172.17.0.1:8787/run-job
Authentication: None
```

Header:

```text
Name: x-exportflow-secret
Value: same value as N8N_WEBHOOK_SECRET / WORKER_API_SECRET
```

Body JSON:

```json
{
  "job_id": "{{ $json.body.job_id }}",
  "status_callback": "{{ $json.body.status_callback }}",
  "export_callback": "{{ $json.body.export_callback }}",
  "job_config": {{ JSON.stringify($json.body.job_config) }}
}
```

Important: do not use `={{ ... }}` in this body. That caused bad values like `=job-id` and `=https://...`.

## Vercel Environment Variables

These should exist in Vercel production environment:

```text
APP_URL
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
N8N_LEAD_JOB_WEBHOOK_URL
N8N_WEBHOOK_SECRET
WORKER_OUTPUT_BASE_DIR
ADMIN_PASSWORD
ADMIN_BYPASS_CODE
GEMINI_API_KEY
```

Known values that are not secret:

```text
APP_URL=https://exportflow-lovat.vercel.app
NEXT_PUBLIC_APP_URL=https://exportflow-lovat.vercel.app
N8N_LEAD_JOB_WEBHOOK_URL=https://n8n.cristalinawater.com/webhook/exportflow-lead-job
WORKER_OUTPUT_BASE_DIR=exports/worker-runs
```

After changing Vercel environment variables, redeploy:

```powershell
cd "C:\Users\Ibrahim\Desktop\webdev\frontend"
vercel --prod
```

## VPS Worker Commands

SSH into VPS:

```powershell
ssh root@5.75.161.50
```

Go to worker folder:

```bash
cd /srv/exportflow
```

Check service:

```bash
systemctl status exportflow-worker --no-pager
```

Restart service:

```bash
systemctl restart exportflow-worker
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Worker logs:

```bash
journalctl -u exportflow-worker -n 200 --no-pager
```

Recent logs:

```bash
journalctl -u exportflow-worker --since "15 minutes ago" --no-pager
```

Check worker run folders:

```bash
ls -lt /srv/exportflow/exports/worker-runs | head
```

Check a specific job:

```bash
ls -la /srv/exportflow/exports/worker-runs/JOB_ID
tail -n 50 /srv/exportflow/exports/worker-runs/JOB_ID/events.jsonl
```

## n8n Docker Checks

Check containers:

```bash
docker ps
```

n8n container name seen during setup:

```text
n8n-automation-n8n-1
```

Test worker from inside n8n container:

```bash
docker exec n8n-automation-n8n-1 wget -qO- http://172.17.0.1:8787/health
```

Expected output:

```json
{"ok": true, "service": "exportflow-worker"}
```

## Scraper Smoke Test On VPS

Use this for a quick bounded scraper check:

```bash
cd /srv/exportflow
./venv/bin/python "final scrapper.py" --region USA --industry "apparel importers wholesalers private label clothing buyers" --limit 1 --max-analyzed 8 --min-score 0 --format csv --output exports/smoke/smoke_leads.csv --audit-output exports/smoke/smoke_audit.csv --status-output exports/smoke/events.jsonl --test-mode --allow-no-email --allow-weak-buyer-evidence
```

Check smoke outputs:

```bash
ls -la exports/smoke
```

Expected files:

```text
events.jsonl
smoke_audit.csv
smoke_leads.csv
```

## Troubleshooting

If website stays `queued`:

1. Check n8n latest execution.
2. Make sure HTTP Request node is green.
3. Make sure HTTP Request URL is exactly:

```text
http://172.17.0.1:8787/run-job
```

4. Check worker logs:

```bash
journalctl -u exportflow-worker --since "15 minutes ago" --no-pager
```

Good logs should include:

```text
[worker] /run-job hit
[worker] accepted job JOB_ID
```

If logs show `=JOB_ID` or `=https://...`, the n8n body is wrong. Remove `=` from the expressions and use the body JSON shown above.

If worker health fails:

```bash
systemctl restart exportflow-worker
sleep 3
curl http://127.0.0.1:8787/health
journalctl -u exportflow-worker -n 100 --no-pager
```

If n8n cannot reach worker:

```bash
docker exec n8n-automation-n8n-1 wget -qO- http://172.17.0.1:8787/health
```

If this fails, the Docker host IP may be different and must be found again.

If job becomes `failed`:

1. Copy the error message from admin.
2. Run:

```bash
journalctl -u exportflow-worker -n 200 --no-pager
```

3. Check the job events:

```bash
tail -n 80 /srv/exportflow/exports/worker-runs/JOB_ID/events.jsonl
```

## Important Reminder

The system should be considered operational after one admin-bypass demo job reaches:

```text
delivered
```

and the dashboard export download buttons work.

After that, tune paid-pack targets/settings before selling 10+ lead packs.
