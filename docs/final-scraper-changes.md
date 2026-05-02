# Final Scraper Changes

## Goal

Convert the scraper from a broad apparel website collector into a paid-lead generator that can produce exporter-useful buyer leads.

## Main Changes

1. Added buyer-intent discovery seeds.
2. Prioritized supplier, vendor, procurement, sourcing, importer, distributor, and retailer intake signals.
3. Moved generic apparel brand seeds later in discovery so they do not dominate the first results.
4. Added deeper enrichment for contact, wholesale, vendor, supplier, sourcing, procurement, purchasing, and about pages.
5. Added contact form detection.
6. Filtered out cart, checkout, login, search, and newsletter forms so they are not counted as outreach routes.
7. Removed active reliance on stealth scraping behavior.
8. Added candidate-owned email filtering.
9. Rejected placeholder, system, third-party, careers, press, legal, privacy, and junk emails.
10. Added decision-email classification for prefixes such as vendor, supplier, sourcing, procurement, purchasing, buyer, imports, sales, and wholesale.
11. Added strict A+ logic.
12. A+ now requires buyer-side evidence, hard-check pass, score threshold, and usable candidate-owned email.
13. Wholesale-only or sales-side leads are marked manual review instead of A+.
14. Added `lead_pack_status` values: `sellable_a_plus`, `sellable_a`, `manual_review`, and `reject`.
15. Added `contact_route`, `outreach_contact`, `lead_summary`, and `closeability_notes` to the output.
16. Added `evidence_url` so every lead shows why it qualified.
17. Added audit-mode exports for rejected and manual-review candidates.
18. Fixed a scoring artifact where generated probe URLs could create fake buyer evidence.
19. Added tests for discovery ordering, source-specific seeds, contact form extraction, scoring, A+ qualification, and export formatting.
20. Updated README with the current CLI and output schema.

## Final A+ Criteria

A lead is A+ only when all of these are true:

1. The company has apparel/textile product fit.
2. The site shows buyer-side evidence such as vendor relations, supplier application, procurement, sourcing, imports, distributor, or purchasing.
3. The scraper finds a usable company-owned email.
4. The contact route is a decision or business email, not only a form.
5. The lead passes hard disqualification checks.
6. The score is at least `85`.

## Latest Validation Result

Command used:

```bash
python "final scrapper.py" --region USA --industry "apparel importers wholesalers private label clothing buyers" --hunt-first-a-plus --hunt-max-analyzed 25 --a-plus-score 85 --format csv --output usa_apparel_first_a_plus_quality_check.csv --audit-output usa_apparel_first_a_plus_quality_check_audit.csv
```

Result:

- A+ found: yes
- Analyzed candidates: `14`
- Runtime: about `207` seconds
- A+ company: `burlington.com`
- Score: `95`
- Outreach contact: `vendor.relations@burlington.com`
- Evidence URL: `https://www.burlington.com/vendors`

## Files Changed

- `final scrapper.py`
- `README.md`
- `scraper/main.py`
- `scraper/modules/discovery.py`
- `scraper/modules/enrichment.py`
- `scraper/modules/scoring.py`
- `scraper/modules/export.py`
- `scraper/requirements.txt`
- `scraper/tests/test_discovery.py`
- `scraper/tests/test_enrichment.py`
- `scraper/tests/test_export.py`
- `scraper/tests/test_scoring.py`

## Verification

Local verification passed:

```bash
python -m unittest discover -s scraper/tests -v
python -m py_compile scraper/main.py scraper/modules/discovery.py scraper/modules/enrichment.py scraper/modules/scoring.py scraper/modules/export.py
```

