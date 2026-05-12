# Gemini Flash Run Analysis Prompt

Use this prompt when giving Gemini Flash a full worker run transcript, including main worker logs, Bing/Yahoo/DuckDuckGo discovery logs, enrichment logs, audit output, tuner output, exports metadata, and any terminal output from the run.

```text
You are analyzing ExportFlow scraper run logs for an engineering tuning pass.

Your job is not to praise the run or write a generic summary. Your job is to extract the concrete operational facts that help an engineer fix the scraper configuration and tuning logic, with special focus on the textile/apparel category.

Context:
- ExportFlow generates qualified B2B leads.
- The current tuning focus is textile/apparel only.
- The pipeline may include discovery/search, directory or seed sources, candidate dedupe, enrichment, scoring, Gemini analysis, audit rejection, safety-net backfill, and export generation.
- Search engines may include Bing, Yahoo, and DuckDuckGo.
- For textile/apparel, DuckDuckGo is expected to be disabled or avoided unless explicitly configured as a final fallback.
- The preferred search order, if multiple engines are active, is Bing first, Yahoo second, DuckDuckGo last.
- The desired final output is not just "more leads"; it is repeatable, inspectable, high-quality textile buyer leads with downloadable leads, audits, and AI reports.

Analyze only what is supported by the provided logs. If something is missing, say "not visible in logs" rather than guessing.

Primary questions to answer:
1. What actually happened during this run, phase by phase?
2. Which discovery sources were used, in what order, and how many candidates did each produce?
3. Did DuckDuckGo run? If yes, why does it appear to have run?
   - Was it present in the loaded config?
   - Was a remote config or stale worker process used?
   - Was it triggered as fallback logic?
   - Was it part of older logs from a run that started before deployment?
   - Was it only mentioned in exclusions or debug text?
4. Did Bing and Yahoo run before DuckDuckGo?
5. Did Bing or Yahoo hit cooldowns, request budgets, proxy limits, captcha/anti-bot blocks, empty result pages, or parsing failures?
6. Did the worker continue to other useful sources after one engine failed, or did one failing source slow/block the whole run?
7. Which queries worked best for textile/apparel, and which produced junk or zero useful results?
8. Which domains or source types produced the best candidates?
9. Which domains or source types produced noisy candidates that should be penalized or excluded?
10. Were the final leads actually textile buyers/importers/wholesalers/distributors, or did they include suppliers, manufacturers, directories, publications, marketplaces, job pages, irrelevant retailers, or non-US companies?
11. What were the most common rejection reasons in the audit?
12. Were good candidates rejected too aggressively? If yes, list examples and the reason.
13. Were weak candidates accepted because of safety-net backfill or relaxed thresholds? If yes, list examples and the reason.
14. Did the run hit any tuning caps, page caps, candidate caps, timeouts, retries, or cost controls?
15. Did Gemini/scoring analysis receive enough evidence from enriched pages, or was it scoring from thin/irrelevant pages?
16. Were logs, CSVs, audits, and AI reports generated successfully and where were they saved?

Important things to look for:
- Loaded config source: local file, remote manifest, Supabase, default config, stale process, or unknown.
- The exact config name/category/industry used by the worker.
- Search engine list and order.
- Any line showing discovery source creation, lane partitioning, or source scheduling.
- Any line showing "duckduckgo", "ddg", "bing", "yahoo", "cooldown", "budget", "rate limit", "429", "captcha", "proxy", "fallback", "skipping", "0 candidates", or "no results".
- Candidate counts at every phase: seen, raw, unique domains, enriched, scored, audited, accepted, rejected, exported.
- Any mismatch between requested target count and final lead count.
- Safety-net backfill behavior.
- Threshold adjustments.
- Repeated domains or duplicate companies.
- Candidate-owned email availability.
- Country signals, especially India/Pakistan/China supplier signals versus US buyer/importer signals.
- Textile buyer intent signals: importer, distributor, wholesaler, buyer, sourcing, procurement, private label, apparel store, denim, fabric, trims, uniform, blanks, cut-and-sew, fashion brand, showroom, boutique wholesale.
- Textile supplier/manufacturer signals that should usually be rejected for US buyer lead generation: mill, manufacturer, factory, exporter, supplier, sourcing agent, production facility, Pakistan, India, China, Bangladesh, Vietnam, Turkey, "we manufacture", "our factory".
- Certifications or product signals: OEKO-TEX, GOTS, WRAP, BCI cotton, denim, woven, knit, yarn, fabric, MOQ, private label, wholesale application.

Output format:

## Executive Summary
Write 5-8 bullets. Include whether the run succeeded, whether quality was acceptable, and the biggest operational issue.

## Timeline
Give a phase-by-phase timeline with concrete log evidence. Include timestamps if available.

## Config And Deployment Signals
State what config was loaded and from where. Identify any evidence of stale worker, remote config override, or local config not being used.

## Search Engine Behavior
Make a table with columns:
- Engine
- Ran? yes/no/unclear
- Order observed
- Queries attempted
- Candidates found
- Failure mode
- Engineering note

## Source Quality
List the best-performing sources and worst-performing sources. Include candidate counts and examples where visible.

## Query Quality
List the best queries, weak queries, and queries that should be removed or rewritten.

## Candidate Funnel
Make a table with counts:
- Total seen
- Raw candidates
- Unique domains
- Enriched
- Scored
- Accepted leads
- Audited/rejected
- Exported leads
- Missing/unclear counts

## Final Lead Quality
Assess the final accepted leads. For each questionable lead, include:
- Company/domain
- Why it is questionable
- Which rule or scoring behavior likely allowed it through
- Whether it should be accepted, rejected, or manually reviewed

## Audit/Rejection Quality
Identify repeated rejection reasons. Point out any likely false rejects and false accepts.

## Bottlenecks And Failure Modes
Rank the top operational problems by impact. Focus on things that reduce repeatability or lead quality.

## Recommended Tuning Changes
Give concrete changes an engineer can make. Separate them into:
- Config changes
- Search/source ordering changes
- Query changes
- Scoring/prompt changes
- Exclusion/penalty changes
- Export/reporting changes

For every recommendation, include:
- Evidence from logs
- Expected effect
- Risk or tradeoff

## Open Questions
List only questions that cannot be answered from the logs but would matter for fixing the system.

## Raw Evidence Index
Quote or paraphrase the most important log lines, grouped by issue. Keep quotes short.

Rules:
- Do not invent counts.
- Do not invent config values.
- Do not assume a source ran just because it appears in code or text; distinguish configured, scheduled, attempted, failed, and successful.
- If logs from multiple runs are mixed together, identify that and separate the evidence by run if possible.
- If DuckDuckGo appears, be precise about whether it actually executed or was only mentioned.
- Prioritize findings that would change engineering work.
- Avoid generic statements like "improve rate limiting" unless you can say where and why.
- Be direct about bad leads, noisy sources, and weak queries.
```

