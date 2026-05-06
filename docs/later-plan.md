# Later Plan

Use this when resuming the ExportFlow scraper/SaaS work.

## Current State

- Website is deployed on Vercel.
- n8n is connected to the VPS worker.
- VPS worker health check works.
- Scraper can run on VPS.
- Strict 10-lead jobs failed because the target only produced 1 qualified lead before the cap.
- Admin-bypass demo jobs were changed to run as 1-lead relaxed proof jobs.

## Do Later

1. Run one fresh admin-bypass demo job and confirm it reaches `delivered`.
2. Confirm dashboard export buttons download files after delivery.
3. Tune paid-pack targets before selling 10+ lead packs.
4. Add guardrails to avoid duplicate retries while a job is already running.
5. Consider adding a lower-risk starter paid pack or a partial-delivery/manual-review flow.

## Useful Context

Detailed deployment notes are in:

```text
docs/current-deployment-status.md
```

VPS worker deploy notes are in:

```text
docs/vps-worker-deploy.md
```
