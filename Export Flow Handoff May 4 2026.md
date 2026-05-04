**ExportFlow Handoff Notes**

*Fresh context for the next engineer \| 2026-05-04*

Scope: lead-intake chat, AI brief generation, worker fill behavior, and
AI run reports. No code edits were made for this handoff.

**Current Snapshot**

  -----------------------------------------------------------------------
  **Area**                            **Current state**
  ----------------------------------- -----------------------------------
  Latest merged code                  Commit 122882f: AI job review plus
                                      relaxed pack fill.

  Frontend intake                     Chat-driven AI lead strategist flow
                                      is live in the repo, but chat state
                                      is still ephemeral in memory.

  Worker behavior                     Worker now supports
                                      fill_until_complete and relaxed
                                      score thresholds, but the live VPS
                                      may still be on older code if
                                      effective_min_score stays fixed.

  Report generation                   Export webhook can call Gemini on
                                      final CSV + audit CSV and store the
                                      result as a report_ready job event.

  Observed failure mode               Some runs stop early with 2/10 or
                                      similar final leads even after
                                      enrichment, which means the fill
                                      path is not fully propagating in
                                      production.
  -----------------------------------------------------------------------

**What Has Already Changed**

> • LeadIntakeChat was converted from a form-heavy flow into an
> AI-guided chat that asks follow-up questions, finalizes a brief, and
> then creates the job.
>
> • The job config now carries fill_until_complete=true and a larger
> analysis budget so the worker should keep searching deeper before
> giving up.
>
> • The worker normalizes region aliases such as United States -\> USA
> and accepts a broader targeting brief from preflight.
>
> • A post-export Gemini review now reads the final CSV and audit CSV,
> then writes a report_ready event with the review payload in
> metadata.report.
>
> • JobLogViewer renders the AI report card above the terminal stream
> when the latest report_ready event exists.

**Where The Data Lives**

> • Chat messages currently live only in React state inside
> frontend/src/components/LeadIntakeChat.tsx. A refresh clears them.
>
> • The AI brief is generated in frontend/src/app/api/preflight/route.ts
> via frontend/src/lib/gemini.ts and is then attached to job creation as
> preflight and job config.
>
> • Job milestones and the AI review are stored in the job_events table.
> The report is written as status=report_ready with metadata.report.
>
> • Final lead exports and audit exports are registered in lead_exports
> by frontend/src/app/api/jobs/\[id\]/exports/route.ts after the worker
> upload completes.
>
> • Worker runtime artifacts live under exports/worker-runs/\<job_id\>/
> with stdout.log, events.jsonl, job_config.json, and the generated
> export files.

**What Is Still Broken Or Risky**

> • Refresh wipes the chat and any in-progress AI brief because there is
> no persistence layer for the conversation state yet.
>
> • If the AI report is not visible after refresh, either the
> report_ready event never got written, or the dashboard did not
> rehydrate job_events for that job.
>
> • The worker still sometimes stops short of the requested pack size.
> Example: a run exported 2 final leads, 48 audit rows, and still showed
> effective_min_score: 80, which implies the live worker was not fully
> using the relaxed fill path.
>
> • The current UI may make the AI report appear only in the logs
> drawer, not as a durable job-level artifact on the main dashboard.

**Likely Root Causes**

> • Production worker build lag: the VPS may not have received the
> latest scraper/main.py and related config updates.
>
> • Threshold relaxation is gated by the deployed fill_until_complete
> path. If that flag is absent or stale in the live config, the worker
> will stop early.
>
> • The frontend conversation is not persisted to localStorage or the
> backend, so the chat can never survive a refresh in its current form.
>
> • Gemini review is best-effort. If the webhook cannot read the
> exported CSVs or Gemini errors, the report may fall back or fail
> silently unless the event is checked.

**Recommended Next Work**

> • Persist the chat transcript and the latest brief so refresh does not
> erase the AI conversation.
>
> • Make the report a first-class job artifact. Store and re-render
> report_ready from the job record or job_events table on page load, not
> just in the open log drawer.
>
> • Verify the live VPS worker is running the latest scraper build and
> confirm that effective_min_score is actually relaxing during a
> fill-until-complete run.
>
> • Add explicit logs for threshold relaxation so the next engineer can
> see why the pack stops before 10.
>
> • If the objective is guaranteed 10/10 delivery, define the fallback
> policy: broaden search, relax quality, or allow partial fill with a
> clear warning.

**Files To Read First**

> • frontend/src/components/LeadIntakeChat.tsx
>
> • frontend/src/app/api/preflight/route.ts
>
> • frontend/src/lib/gemini.ts
>
> • frontend/src/app/api/jobs/\[id\]/exports/route.ts
>
> • frontend/src/components/JobLogViewer.tsx
>
> • frontend/src/components/JobReportCard.tsx
>
> • frontend/src/lib/job-config.ts
>
> • scraper/main.py
>
> • scraper/modules/discovery.py
>
> • scraper/tests/test_main_config.py

**Deployment Notes**

> • Frontend changes need a redeploy from the musa/main side to show the
> new chat and report UI.
>
> • Worker changes need the scraper folder copied to /srv/exportflow on
> the VPS, followed by systemctl restart exportflow-worker.
>
> • When checking a live job, inspect
> /srv/exportflow/exports/worker-runs/\<job_id\>/stdout.log and
> events.jsonl first, then confirm the exports and report event in
> Supabase.

**How To Read The Recent Failure**

> • If you see qualified_count stuck well below the target after
> enrichment, the worker is not continuing to relax the filter enough to
> reach the pack size.
>
> • If effective_min_score never changes from the initial score, the
> deployed code path is probably stale.
>
> • If the worker emits report_ready but the UI does not show it, the
> dashboard is not reloading persisted job_events or the report card is
> only bound to the open log viewer.

**Handoff Goal**

> The next engineer should focus on two things only: make the AI chat
> state durable across refresh, and make the worker actually continue
> searching or relaxing until the requested lead count is reached, with
> a clear fallback policy when that is impossible.
