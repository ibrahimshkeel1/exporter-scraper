# VPS Worker Deploy

Use this when updating the worker on the VPS.

## 1. Upload Code

From your local machine:

```bash
rsync -av --delete \
  --exclude ".git" \
  --exclude "frontend/node_modules" \
  --exclude "frontend/.next" \
  --exclude "exports" \
  --exclude "supabase" \
  --exclude "worker.env" \
  ./ root@YOUR_VPS_IP:/srv/exportflow/
```

`worker.env` is a production-only secret file. Keep it on the VPS and exclude it from
`rsync --delete`; otherwise a local deploy can remove `/srv/exportflow/worker.env`
and systemd will fail with `Failed to load environment files`.

If you do not have `rsync`, use:

```bash
scp -r worker_api.py "final scrapper.py" scraper docs worker.env.example root@YOUR_VPS_IP:/srv/exportflow/
```

## 2. Install Worker Dependencies

On the VPS:

```bash
cd /srv/exportflow
python3 -m venv venv
./venv/bin/python -m pip install --upgrade pip
./venv/bin/python -m pip install -r scraper/requirements.txt
./venv/bin/python -m playwright install chromium
```

## 3. Configure Secrets

Create `/srv/exportflow/worker.env` from `worker.env.example`:

```bash
cp worker.env.example worker.env
nano worker.env
```

Required values:

```env
WORKER_PORT=8787
WORKER_API_SECRET=same-value-as-n8n-secret
N8N_WEBHOOK_SECRET=same-value-as-n8n-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_EXPORT_BUCKET=lead-exports
```

## 4. Run As A Service

Create `/etc/systemd/system/exportflow-worker.service`:

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

Start or restart:

```bash
systemctl daemon-reload
systemctl enable exportflow-worker
systemctl restart exportflow-worker
systemctl status exportflow-worker --no-pager
```

## 5. Test The Worker

Health check:

```bash
curl http://127.0.0.1:8787/health
```

n8n should call:

```text
POST http://127.0.0.1:8787/run-job
Header: x-exportflow-secret: same-value-as-n8n-secret
```

The worker writes each job under:

```text
/srv/exportflow/exports/worker-runs/<job_id>/
```

## 6. Frontend Log Streaming

The frontend streams worker stdout through its own API route:

```text
GET /api/jobs/<job_id>/logs
```

Set this frontend environment variable to the worker base URL that the frontend server can reach:

```env
WORKER_API_URL=https://your-worker-domain.example
```

Use `http://127.0.0.1:8787` only when the frontend server and worker run on the same machine. If the frontend is deployed on Vercel, this must be a public HTTPS worker/Nginx URL, not localhost.
