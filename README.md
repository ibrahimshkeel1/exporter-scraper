# ExportFlow Buyer Lead Scraper

Python scraper for discovering and qualifying clothing/apparel buyer leads in `USA`, `UK`, and `Europe`.

## What It Does

1. Discovers candidate company websites from buyer-intent seeds, search results, and regional directories.
2. Enriches each candidate by crawling homepage plus contact, wholesale, vendor, supplier, sourcing, procurement, purchasing, and about pages.
3. Extracts and classifies candidate-owned emails, rejecting placeholder, third-party, careers, and system emails.
4. Detects contact forms and supplier/vendor intake paths, but reserves A+ status for leads with usable candidate-owned email.
5. Scores leads on product fit, buyer/importer/procurement evidence, reachability, commercial activity, and evidence depth.
6. Exports only qualified leads to CSV, JSON, or both.

## Installation

```bash
pip install -r scraper/requirements.txt
python -m playwright install chromium
```

## Usage

```bash
python scraper/main.py --region USA --industry "private label clothing importers wholesalers" --limit 20 --output buyer_leads.csv --format both
```

SaaS job config mode:

```bash
python "final scrapper.py" --job-config scraper/job_config.example.json --status-output exports/demo/events.jsonl
```

## CLI Arguments

- `--region`: `USA`, `UK`, or `Europe` (default: `USA`)
- `--industry`: discovery query seed (default: `clothing brands`)
- `--limit`: final number of leads to export (default: `10`)
- `--min-score`: minimum score threshold from `0` to `100` (default: `75`)
- `--max-analyzed`: candidate analysis hard cap for filling a requested lead pack
- `--search-term`: prioritized discovery query from SaaS targeting preflight; can be repeated
- `--output`: output base file name (default: `buyer_leads.csv`)
- `--audit-output`: optional output base file for all scored candidates, including rejected leads
- `--format`: `csv`, `json`, `xlsx`, `both`, or `all` (default: `csv`)
- `--job-config`: optional JSON config used by the SaaS/n8n worker flow
- `--status-output`: optional JSONL file for machine-readable progress events
- `--job-id`: optional external job id included in progress events
- `--test-mode`: lower internal discovery limits for quicker runs
- `--hunt-first-a-plus`: analyze candidates one by one until the first A+ lead is found
- `--hunt-max-analyzed`: hard stop for A+ hunt mode (default: `150`)
- `--a-plus-score`: minimum score for A+ hunt success (default: `85`)
- `--allow-no-email`: allow otherwise qualified leads without candidate-owned emails
- `--allow-weak-buyer-evidence`: allow product-fit leads with weak buyer/importer/procurement evidence
- `--proxy`: discovery proxy URL; repeat flag for a proxy pool
- `--proxy-file`: file with one proxy URL per line

Proxy pool can also be passed by environment variable:

- `EXPORTFLOW_PROXY_POOL=http://user:pass@host:port,http://user:pass@host2:port`

## Output Fields

Exports include:

- run metadata: `run_id`, `scraped_at`, `region`, `industry`
- company metadata: `company_name`, `domain`, `website`
- provenance: `discovery_url`, `source_name`, `source_url`, `discovery_method`
- quality evidence: `qualified`, `passes_hard_checks`, `export_eligible`, `buyer_type`, `lead_pack_status`, `manual_review_required`, `product_fit`, `product_evidence`, `buyer_evidence`, `buyer_side_evidence`, `sales_side_evidence`, `contact_evidence`, `contact_route`, `outreach_contact`, `evidence_url`, `negative_evidence`, `disqualification_reasons`, `recommended_pitch_angle`, `lead_summary`, `closeability_notes`
- reachability: `emails`, `high_quality_emails`, `email_quality`, `linkedin_url`, `social_urls`, `contact_form_urls`
- crawl telemetry: `fetch_ok`, `fetch_status_codes`, `fetch_errors`, `crawled_pages`
- scoring: `score`, `tier`, `qualification_reasons`, `score_breakdown`

## Tests

```bash
python -m unittest discover -s scraper/tests -v
```

## SaaS Frontend

The Next.js frontend lives in `frontend/`.

```bash
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env.local`, fill Supabase, Gemini, n8n, admin, and `WORKER_API_URL` values, then run the Supabase schema in `supabase/schema.sql`.

See `docs/saas-implementation.md` for the n8n/VPS handoff and `docs/vps-worker-deploy.md` for upload/restart commands.

The optional VPS worker API lives at `worker_api.py`. It accepts approved jobs from n8n, forwards scraper progress to the app, uploads private exports to Supabase Storage, and registers delivery. Worker exports default to `exports/worker-runs/<job_id>/exports` unless `WORKER_OUTPUT_BASE_DIR` is set in the frontend environment.

## Ethics and Compliance

Use this tool only where your workflow complies with local anti-spam, privacy, and website usage policies.
