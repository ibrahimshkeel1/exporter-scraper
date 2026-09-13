# ExportFlow

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![n8n](https://img.shields.io/badge/n8n-Automation-FF6D5A?style=flat-square)](https://n8n.io)

B2B lead generation SaaS — discover, enrich, score, and export qualified international buyer leads. Python scraper, Next.js dashboard, VPS worker API, and n8n outreach automation.

## Features

- **Lead discovery** — Find candidate companies from buyer-intent seeds and regional directories
- **Deep enrichment** — Crawl contact, wholesale, vendor, and procurement pages
- **Email classification** — Extract candidate-owned emails; reject placeholders and system addresses
- **Scoring engine** — Rank leads on product fit, buyer evidence, reachability, and commercial activity
- **SaaS dashboard** — Job management, targeting preflight, and export delivery via Next.js frontend
- **Outreach automation** — n8n workflows for email generation and campaign launch

## Stack

| Layer | Tech |
|-------|------|
| Scraper | Python (aiohttp, Playwright, BeautifulSoup) |
| Frontend | Next.js 15 + Supabase |
| Worker | Python VPS API (`worker_api.py`) |
| Automation | n8n webhooks |
| AI | Gemini for classification and verification |

## Quick start — Scraper

```bash
pip install -r scraper/requirements.txt
python -m playwright install chromium

python scraper/main.py \
  --region USA \
  --industry "private label clothing importers wholesalers" \
  --limit 20 \
  --output buyer_leads.csv \
  --format both
```

### SaaS job mode

```bash
python "final scrapper.py" \
  --job-config scraper/job_config.example.json \
  --status-output exports/demo/events.jsonl
```

## Quick start — Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # never commit this file
npm run dev
```

Set Supabase, Gemini, n8n, admin, and `WORKER_API_URL` in `.env.local`, then run [supabase/schema.sql](./supabase/schema.sql).

## Project layout

```
scraper/          Python lead discovery and scoring engine
frontend/         Next.js SaaS dashboard
worker_api.py     VPS worker for n8n job orchestration
supabase/         Database schema and migrations
docs/             Architecture, SaaS wiring, and runbooks
```

## CLI reference

| Flag | Description |
|------|-------------|
| `--region` | `USA`, `UK`, or `Europe` (default: `USA`) |
| `--industry` | Discovery query seed |
| `--limit` | Number of leads to export (default: `10`) |
| `--min-score` | Minimum score 0–100 (default: `75`) |
| `--format` | `csv`, `json`, `xlsx`, `both`, or `all` |
| `--job-config` | JSON config for SaaS/n8n worker flow |
| `--proxy` / `--proxy-file` | Proxy pool for discovery |

Proxy env vars: `EXPORTFLOW_PROXY_POOL`, `EXPORTFLOW_PROXY_HEALTHCHECK_URL`.

## Tests

```bash
python -m unittest discover -s scraper/tests -v
```

## Documentation

See [docs/README.md](./docs/README.md) for architecture, SaaS wiring, Gmail/n8n automation, and VPS runbooks.

## Security & compliance

- Never commit `.env`, `.env.local`, `worker.env`, or proxy credential files
- Use `frontend/.env.example` and `worker.env.example` as templates only
- Comply with local anti-spam, privacy, and website usage policies
