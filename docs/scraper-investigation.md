# Scraper Investigation and Improvement Plan

## Scope

This note summarizes the current scraper implementation in `scraper/`, the main weaknesses found during inspection, and a practical order for improving it.

## Current Shape

The scraper is split into four steps:

1. Discovery in `scraper/modules/discovery.py`
2. Enrichment in `scraper/modules/enrichment.py`
3. Scoring in `scraper/modules/scoring.py`
4. CSV export in `scraper/modules/export.py`

The entry point is `scraper/main.py`, which launches Playwright, runs discovery, enriches the candidates with `aiohttp`, scores them, and writes a CSV.

## Key Issues

### 1. CLI and docs are out of sync

- `README.md` documents `--industry` and `--country`.
- `scraper/main.py` actually accepts `--region`, `--limit`, `--output`, and `--test-mode`.
- The product direction also differs between `README.md` and `PROJECT_PLAN.md`.

### 2. The scraper is not runnable in the current environment

- `python scraper/main.py --help` fails because `tldextract` is missing.
- `aiohttp` and `pandas` are also missing locally.
- The current dependency list is not validated before import-time execution.

### 3. Discovery is brittle

- `LeadDiscovery` scans every anchor on a small set of directory pages.
- Relative links are skipped, which can drop useful directory profile paths.
- Source-specific parsing is missing for YellowPages, Yell, and Europages.
- Dedupe happens only by root domain, which is useful but too blunt for some directories.

### 4. Enrichment is shallow

- Only the candidate homepage is fetched.
- There is no follow-up crawl for `/contact`, `/about`, `/team`, or similar pages.
- Fetches use `ssl=False`, which should not be the default.
- There is no retry policy, fetch status tracking, or structured error capture.

### 5. Export has a schema bug

- Discovery writes `source_url`.
- Export reads `source_query`.
- The source field in the CSV will therefore be empty.

### 6. Scoring is simple and easy to game

- Scoring is keyword-only and case-sensitive on raw content.
- No negative signals are used.
- There is no evidence breakdown beyond a short text summary.
- Leads without email addresses are discarded entirely, even if they are otherwise strong matches.

### 7. Test coverage is mostly ad hoc

- The `scraper/test_*.py` files are live debug scripts rather than repeatable tests.
- There are no unit tests for normalization, extraction, scoring, or export formatting.

## Prioritized Improvements

### Phase 1: Make the project consistent and runnable

- Align README usage with the actual CLI or change the CLI to match the docs.
- Fix the `source_url` vs `source_query` mismatch.
- Add pinned dependencies or a lockfile.
- Make `--help` work without importing optional runtime dependencies too early.

### Phase 2: Make discovery source-aware

- Add adapters for each supported source.
- Parse result pages with source-specific selectors.
- Capture source metadata, pagination state, and candidate provenance.
- Normalize and dedupe URLs more carefully.

### Phase 3: Improve enrichment

- Crawl likely contact pages, not just the homepage.
- Add request retries and backoff.
- Record HTTP status, redirects, and fetch failures.
- Classify emails by quality instead of treating all addresses equally.

### Phase 4: Improve scoring

- Move weights and keyword lists into config.
- Use lower-case normalized content before scoring.
- Add negative signals and stronger evidence thresholds.
- Keep explainable per-feature scoring output.

### Phase 5: Add tests

- Unit test root-domain normalization.
- Unit test email extraction and social-link extraction.
- Unit test score assignment and tiering.
- Unit test CSV formatting and field mapping.

## Recommended Next Step

Start with Phase 1. It removes the current breakage, resolves the documentation drift, and exposes the real shape of the scraper before deeper refactoring.
