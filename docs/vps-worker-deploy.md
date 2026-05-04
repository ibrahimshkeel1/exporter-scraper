# VPS Worker Deploy and Runbook

## 1) Upload Code

Run from local project root:

```bash
rsync -av --delete \
  --exclude ".git" \
  --exclude "frontend/node_modules" \
  --exclude "frontend/.next" \
  --exclude "exports" \
  --exclude "supabase" \
  --exclude "worker.env" \
  --exclude "venv" \
  ./ root@YOUR_VPS_IP:/srv/exportflow/
```

`worker.env` stays server-side and is intentionally excluded.

## 2) Install/Update Worker Runtime

On VPS:

```bash
cd /srv/exportflow
python3 -m venv venv
./venv/bin/python -m pip install --upgrade pip
./venv/bin/python -m pip install -r scraper/requirements.txt
./venv/bin/python -m playwright install chromium
```

## 3) Configure Worker Secrets

Create or edit `/srv/exportflow/worker.env`:

```env
WORKER_PORT=8787
WORKER_API_SECRET=<same-as-n8n-secret>
N8N_WEBHOOK_SECRET=<same-as-n8n-secret>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_EXPORT_BUCKET=lead-exports
EXPORTFLOW_PROXY_POOL=http://user:pass@host:port,http://user:pass@host2:port
EXPORTFLOW_PROXY_HEALTHCHECK_URL=https://ip.oxylabs.io/location
EXPORTFLOW_PROXY_HEALTHCHECK_TIMEOUT_SECONDS=12
EXPORTFLOW_PROXY_MIN_HEALTHY=1
```

Validation:

```bash
grep -E "^(WORKER_PORT|WORKER_API_SECRET|N8N_WEBHOOK_SECRET|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_EXPORT_BUCKET|EXPORTFLOW_PROXY_POOL|EXPORTFLOW_PROXY_HEALTHCHECK_URL|EXPORTFLOW_PROXY_HEALTHCHECK_TIMEOUT_SECONDS|EXPORTFLOW_PROXY_MIN_HEALTHY)=" /srv/exportflow/worker.env
```

Important:

- `SUPABASE_SERVICE_ROLE_KEY` must be `role=service_role`, not anon.

## 4) systemd Service

Service file:

```ini
[Unit]
Description=ExportFlow Worker API
After=network.target

[Service]
WorkingDirectory=/srv/exportflow
EnvironmentFile=/srv/exportflow/worker.env
ExecStart=/srv/exportflow/venv/bin/python /srv/exportflow/worker_api.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Apply/restart:

```bash
systemctl daemon-reload
systemctl enable exportflow-worker
systemctl restart exportflow-worker
systemctl status exportflow-worker --no-pager -l
```

## 5) Health and Logs

```bash
curl -s http://127.0.0.1:8787/health
journalctl -u exportflow-worker -n 200 --no-pager
ls -lt /srv/exportflow/exports/worker-runs | head
```

## 6) Delivery Failure: Fast Recovery

If job says export delivery failed, inspect:

```bash
journalctl -u exportflow-worker --since "20 minutes ago" --no-pager
```

Common error:

- `signature verification failed` means wrong `SUPABASE_SERVICE_ROLE_KEY` (usually anon key used by mistake).

After fixing `worker.env`, restart worker and retry delivery for a completed scrape:

```bash
cd /srv/exportflow
set -a
source /srv/exportflow/worker.env
set +a
/srv/exportflow/venv/bin/python - <<'PY'
import asyncio, json
from pathlib import Path
import worker_api

job_id = "REPLACE_JOB_ID"
run_dir = Path("/srv/exportflow/exports/worker-runs") / job_id
with (run_dir / "job_config.json").open() as f:
    job_config = json.load(f)

async def main():
    await worker_api._deliver_exports(job_id, job_config, {})
    print("RETRY_OK")

asyncio.run(main())
PY
```

Verify delivery state:

```bash
set -a
source /srv/exportflow/worker.env
set +a
curl -s "$SUPABASE_URL/rest/v1/lead_jobs?id=eq.REPLACE_JOB_ID&select=id,status,error_message,updated_at" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
curl -s "$SUPABASE_URL/rest/v1/lead_exports?job_id=eq.REPLACE_JOB_ID&select=format,storage_path,row_count" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

