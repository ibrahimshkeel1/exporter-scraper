# ExportFlow Project Overview

## What This Is

ExportFlow is an AI-assisted lead generation system. It takes a client brief (industry, target buyer type, region), discovers candidate companies, enriches and scores them, and delivers qualified lead exports (CSV/JSON/XLSX).

The product has two major parts:

- `frontend/`: Next.js SaaS app for chat intake, live logs, job tracking, and downloads.
- `scraper/` + `worker_api.py`: backend execution path for discovery, enrichment, scoring, and export delivery.

## Runtime Architecture

1. User submits a lead request in the frontend.
2. Frontend sends a job payload to n8n webhook.
3. n8n calls `POST /run-job` on `worker_api.py`.
4. Worker launches `final scrapper.py` with `--job-config`.
5. Scraper pipeline runs:
   - Signal map generation (`scraper/modules/signal_map.py`)
   - Source routing by lane (`bing`, `duckduckgo`, `yahoo`, plus non-search sources)
   - Discovery -> enrichment queue
   - Candidate enrichment + scoring
   - Qualified pack + audit exports
6. Worker uploads exports to Supabase Storage and registers files in `lead_exports`.
7. Frontend job status becomes `delivered` and download buttons appear.

## Key Pipeline Behavior

- Discovery and enrichment are separate concurrent stages.
- Discovery emits lane-level lifecycle messages, including `Discovery lane completed: <lane>`.
- Proxy rotation is supported per discovery lane when throttle/block signals are detected.
- Duplicate domains are suppressed after enrichment.
- Recent delivered-domain memory (`recent_delivered_domains.json`) suppresses repeats across runs.
- If `fill_until_complete=true`, quality threshold can relax to fill more leads.

Important current behavior:

- If target count is still not reached, the scraper does not automatically start a second discovery pass. It finishes current routed sources and finalizes.

## Delivery and Status Semantics

- Scraper `delivered` event means scraping/export files finished.
- Worker then uploads files; during this phase job status is `exporting`.
- Final success is when worker registers exports and updates job to `delivered`.
- If upload fails, job can show: `Worker finished but export delivery failed.`

## Output Artifacts

Per job, worker run artifacts are stored under:

```text
exports/worker-runs/<job_id>/
```

Typical files:

- `job_config.json`
- `events.jsonl`
- `stdout.log`
- `exports/<job_id>_leads.csv|json|xlsx`
- `exports/<job_id>_audit.csv|json|xlsx`

