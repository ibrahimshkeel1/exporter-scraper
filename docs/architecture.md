# Exporter Scraper Architecture

## Current Architecture (Legacy — Parallel Pipeline)

```
┌─────────────────────────────────────────────────────────────┐
│                    RUNNING IN PARALLEL                        │
│                                                              │
│  ┌──────────────────────┐     ┌───────────────────────────┐ │
│  │   DISCOVERY LANES     │     │   ENRICHMENT WORKERS (x4)  │ │
│  │   (Playwright)        │     │   (aiohttp + browser)      │ │
│  │                       │     │                           │ │
│  │  Search engines ──────┼──► │  Fetch homepage            │ │
│  │  Seed URLs      ──────┼──► │  Crawl ~12 internal pages  │ │
│  │  Directory scrapes    │     │  Extract emails, socials   │ │
│  │                       │     │  Score & rank             │ │
│  │  Pushes candidates ───┼──► │  Check: target hit? ──► STOP│ │
│  │  into asyncio.Queue   │     │                           │ │
│  └──────────────────────┘     └───────────────────────────┘ │
│                                                              │
│  Discovery depth: FIXED (1 page per query, all industries)   │
│  Filters at intake: EXCLUDED_HOST_PARTS, EXCLUDED_ROOT_      │
│    DOMAINS, EXCLUDED_PATH_PARTS, EXPORTER_COUNTRY_SUFFIXES,  │
│    EXCLUDED_DOMAIN_SUFFIXES, dynamic blocklists               │
│  Stop condition: qualified_count >= limit (mid-stream!)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LEAD PACK ASSEMBLY (post-discovery, one-shot)               │
│                                                              │
│  Stage 1: Strict        (min_score=75)                      │
│  Stage 2: Relaxed       (75→70→65→60→35 thresholds)        │
│  Stage 3: Hard backfill (passes_hard_checks, score≥soft_   │
│                           floor, no noisy domain hits)      │
│  Stage 4: Exploratory   (fetch_ok, score≥exploratory_floor) │
│  Stage 5: Forced        (any non-empty domain)              │
│  Stage 6: Repeat pad    (clone existing leads if still short)│
│                                                              │
│  Key problem: Works from whatever pool was collected during  │
│  the parallel phase. No ability to go back and search more/  │
│  better. No introspection on why discovery performed poorly. │
└─────────────────────────────────────────────────────────────┘
```

### Key Flaws in Current Architecture

1. **Discovery and enrichment run in parallel** — enrichment workers consume candidates while discovery is still running. The `hit_target` check stops discovery mid-stream based on partial results, before the full picture is known.

2. **Aggressive intake filtering** — candidates are filtered at ingestion time (EXCLUDED_HOST_PARTS, blocked domains, path exclusions). Once rejected, they're gone forever. No second chance if filters were too strict.

3. **Fixed search depth** — all queries run at the same depth regardless of quality. If a query returns junk on page 1 but gold on page 2, we never see it.

4. **No feedback loop** — the system has no mechanism to say "this approach isn't working, let me try something different." It just exhausts its sources and assembles whatever it has.

5. **Backfill is desperation, not adaptation** — forced backfill and repeat padding accept garbage rather than trying to find better leads.

---

## Proposed Architecture (Layered Adaptive Pipeline)

```
╔═══════════════════════════════════════════════════════════════╗
║  PHASE 1 — BROAD SHALLOW DISCOVERY                           ║
║  "Cast the widest net, commit nothing"                       ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Input:    region, industry, signal_map, search_terms        ║
║                                                               ║
║  Searches: All engines (Bing, DuckDuckGo, Yahoo)             ║
║            All query templates (signal + buyer + seed)       ║
║            Depth = 1 page per query                          ║
║                                                               ║
║  Filters:  MINIMAL at intake — only exclude:                 ║
║            • Search engines themselves (google.com, bing,    ║
║              duckduckgo, yahoo)                              ║
║            • Common social media (facebook, instagram,       ║
║              twitter/x, linkedin, youtube, pinterest)        ║
║            • Known non-commercial (wikipedia, quora, reddit) ║
║            • Shopping carts, login pages, CDN paths          ║
║                                                               ║
║            REMOVED from intake (moved to Phase 2 scoring):   ║
║            • dictionary., github., docs., gitlab.            ║
║            • .edu, .gov, .mil, .ac.uk TLDs                   ║
║            • Supplier country suffixes (.cn, .in, .bd)      ║
║            • dnb., zoominfo., crunchbase., glassdoor.        ║
║                                                               ║
║  Output:   Raw candidate list (domain + source metadata)     ║
║            Phase stats: query performance, filter hit rates  ║
║                                                               ║
║  Target:   Collect 500-3000 raw domains. No quality gates.   ║
╚═══════════════════════════════════════════════════════════════╝
                              │
                              ▼
╔═══════════════════════════════════════════════════════════════╗
║  PHASE 2 — DEEP QUALIFYING ANALYSIS                          ║
║  "Now that we have candidates, figure out who's real"        ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  For each candidate (4 concurrent workers):                  ║
║                                                               ║
║  ┌─ Surface Crawl ───────────────────────────────────────┐  ║
║  │ Fetch homepage → extract emails, social links, meta   │  ║
║  │ Crawl internal pages: /about, /contact, /wholesale,   │  ║
║  │ /vendors, /suppliers, /trade, /b2b, /brands           │  ║
║  │ Extract buyer intent keywords from page text          │  ║
║  └───────────────────────────────────────────────────────┘  ║
║                          │                                    ║
║                          ▼                                    ║
║  ┌─ Social Verification ─────────────────────────────────┐  ║
║  │ Found LinkedIn? Instagram? Facebook?                  │  ║
║  │ → Extract social profile URLs                         │  ║
║  │ → Presence check (does the company have socials?)    │  ║
║  │ → This is a lightweight signal; full social crawl     │  ║
║  │   is deferred (costly, rarely needed for scoring)     │  ║
║  └───────────────────────────────────────────────────────┘  ║
║                          │                                    ║
║                          ▼                                    ║
║  ┌─ Deep Site Crawl (progressive) ──────────────────────┐  ║
║  │ Follow internal links beyond initial 12 pages        │  ║
║  │ Priority: /brands, /collections, /new-arrivals,      │  ║
║  │ /store-locator, /careers, /about, /team              │  ║
║  │ Extract: product count, physical locations, team     │  ║
║  │ size signals, "we buy from" language, certifications │  ║
║  └───────────────────────────────────────────────────────┘  ║
║                          │                                    ║
║                          ▼                                    ║
║  ┌─ Composite Scoring ──────────────────────────────────┐  ║
║  │ Buyer Evidence (60pts): "wholesale buyer", "vendor   │  ║
║  │   application", "supplier portal", "procurement",     │  ║
║  │   "importer", "trade account", "sourcing"            │  ║
║  │ Product Fit (25pts): keyword density vs industry     │  ║
║  │ Credibility (15pts): about page, contact page,       │  ║
║  │   domain age indicators, SSL, social presence        │  ║
║  │ Penalties: noise keywords, blocked TLDs, supplier    │  ║
║  │   country markers (now applied HERE, not at intake)  │  ║
║  │                                                      │  ║
║  │ Output: scored_candidates with all metadata          │  ║
║  │ Categories: "confirmed_buyer" / "likely" /           │  ║
║  │             "needs_review" / "junk"                  │  ║
║  └───────────────────────────────────────────────────────┘  ║
║                                                               ║
║  Stop if: qualified_count >= limit (all candidates scored)   ║
╚═══════════════════════════════════════════════════════════════╝
                              │
                    ┌─────────┴──────────┐
                    │  Target filled?    │
                    └─────────┬──────────┘
                    YES │          │ NO
                        ▼          ▼
                  ┌──────────┐  ╔═══════════════════════════════════╗
                  │  EXPORT  │  ║  PHASE 3 — ADAPTIVE LOOP          ║
                  └──────────┘  ║  "Something's wrong. Fix it."     ║
                                ╠═══════════════════════════════════╣
                                ║                                   ║
                                ║  ITERATION 1 (heuristic):         ║
                                ║  ┌───────────────────────────┐   ║
                                ║  │ 3a. INCREASE DEPTH        │   ║
                                ║  │ Resume queries that       │   ║
                                ║  │ returned ≥1 valid domain  │   ║
                                ║  │ at page_depth=2           │   ║
                                ║  │ → Phase 1 → Phase 2       │   ║
                                ║  └───────────────────────────┘   ║
                                ║                                   ║
                                ║  If still short after depth=2:    ║
                                ║  ┌───────────────────────────┐   ║
                                ║  │ 3b. SELF-DIAGNOSE         │   ║
                                ║  │ Analyze Phase 1 stats:    │   ║
                                ║  │ • Which queries returned  │   ║
                                ║  │   0 viable candidates?    │   ║
                                ║  │ • Which filters blocked   │   ║
                                ║  │   the most domains?       │   ║
                                ║  │ • Are we in a "dead zone" │   ║
                                ║  │   (wrong terms/market)?   │   ║
                                ║  │ → Heuristic adjustments   │   ║
                                ║  └───────────────────────────┘   ║
                                ║                                   ║
                                ║  ITERATION 2 (heuristic + depth): ║
                                ║  ┌───────────────────────────┐   ║
                                ║  │ 3c. SELF-CORRECT         │   ║
                                ║  │ • Drop dead queries       │   ║
                                ║  │ • Generate variant        │   ║
                                ║  │   queries (broader terms) │   ║
                                ║  │ • Try alternate markets   │   ║
                                ║  │ • Relax problematic       │   ║
                                ║  │   scoring filters         │   ║
                                ║  │ • Increase to depth=3     │   ║
                                ║  │ → Phase 1 → Phase 2       │   ║
                                ║  └───────────────────────────┘   ║
                                ║                                   ║
                                ║  ITERATION 3 (AI-assisted):       ║
                                ║  ┌───────────────────────────┐   ║
                                ║  │ Only if API key present   │   ║
                                ║  │ and still below target    │   ║
                                ║  │                           │   ║
                                ║  │ Feed AI a structured      │   ║
                                ║  │ report:                   │   ║
                                ║  │ • Industry + region       │   ║
                                ║  │ • Queries tried + results │   ║
                                ║  │ • Filter rejection stats  │   ║
                                ║  │ • Competing search terms  │   ║
                                ║  │ • Gap remaining           │   ║
                                ║  │                           │   ║
                                ║  │ AI returns new search     │   ║
                                ║  │ parameters (queries,      │   ║
                                ║  │ filters, market focus)    │   ║
                                ║  │ → Phase 1 → Phase 2       │   ║
                                ║  └───────────────────────────┘   ║
                                ║                                   ║
                                ║  COST CONTROL:                    ║
                                ║  • Max 1 AI call per job          ║
                                ║  • Only after 2 heuristic         ║
                                ║    iterations fail                ║
                                ║  • Prompt under 500 tokens input  ║
                                ║  • Response under 200 tokens      ║
                                ║  • No AI if no OPENAI_API_KEY set ║
                                ║                                   ║
                                ║  LOOP EXIT:                       ║
                                ║  • Target filled OR               ║
                                ║  • Max iterations (3) exhausted   ║
                                ║  • Falls through to safety net    ║
                                ╚═══════════════════════════════════╝
                                           │
                                           ▼
╔═══════════════════════════════════════════════════════════════╗
║  SAFETY NET — GUARANTEED COMPLETION                           ║
║  "We will never return fewer leads than requested"           ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  After all phases and iterations have run:                   ║
║                                                               ║
║  1. Build lead pack from entire scored pool                  ║
║     (strict → relaxed thresholds → hard backfill →           ║
║      exploratory → forced backfill)                          ║
║                                                               ║
║  2. Domain suppression (dedupe against recently delivered)   ║
║                                                               ║
║  3. If still short: pad with repeat backfill                 ║
║     (clones existing leads, marks them for manual review)    ║
║                                                               ║
║  Result: ALWAYS returns exactly `limit` leads.               ║
║  Low-quality backfills are flagged with `pack_fill_stage`    ║
║  and `manual_review_required: true`.                         ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Phase Flow Diagram

```
                    START
                      │
                      ▼
            ┌─────────────────┐
            │   PHASE 1       │  Shallow discovery (depth=1)
            │   Broad intake  │  Minimal filters at intake
            │   All queries   │  Collect raw domain pool
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │   PHASE 2       │  Enrichment + deep crawl
            │   Deep qualify  │  Social verification
            │   Score & rank  │  Buyer intent analysis
            └────────┬────────┘
                     │
               ┌─────┴──────┐
               │  Target    │
               │  filled?   │
               └─────┬──────┘
               YES   │    NO
                │    │     │
                │    │     ▼
                │    │  ┌──────────────────────────┐
                │    │  │   PHASE 3: ITERATION 1   │
                │    │  │   Increase depth → 2     │
                │    │  │   Re-search promising    │
                │    │  │   queries at depth 2     │
                │    │  │   → Phase 1 → Phase 2    │
                │    │  └──────────┬───────────────┘
                │    │             │
                │    │        ┌────┴──────┐
                │    │        │ Target    │
                │    │        │ filled?   │
                │    │        └────┬──────┘
                │    │       YES   │    NO
                │    │        │    │     │
                │    │        │    │     ▼
                │    │        │    │  ┌──────────────────────────┐
                │    │        │    │  │   PHASE 3: ITERATION 2   │
                │    │        │    │  │   Self-diagnose + correct│
                │    │        │    │  │   Drop dead queries      │
                │    │        │    │  │   Generate variants      │
                │    │        │    │  │   Deepen to depth=3      │
                │    │        │    │  │   Relax filters if needed│
                │    │        │    │  │   → Phase 1 → Phase 2    │
                │    │        │    │  └──────────┬───────────────┘
                │    │        │    │             │
                │    │        │    │        ┌────┴──────┐
                │    │        │    │        │ Target    │
                │    │        │    │        │ filled?   │
                │    │        │    │        └────┬──────┘
                │    │        │    │       YES   │    NO
                │    │        │    │        │    │     │
                │    │        │    │        │    │     ▼
                │    │        │    │        │    │  ┌──────────────────────────┐
                │    │        │    │        │    │  │   PHASE 3: ITERATION 3   │
                │    │        │    │        │    │  │   AI-assisted (if key)   │
                │    │        │    │        │    │  │   Or: aggressive relax   │
                │    │        │    │        │    │  │   → Phase 1 → Phase 2    │
                │    │        │    │        │    │  └──────────┬───────────────┘
                │    │        │    │        │    │             │
                │    │        │    │        │    │        ┌────┴──────┐
                │    │        │    │        │    │        │ EXHAUSTED │
                │    │        │    │        │    │        │ (always)  │
                │    │        │    │        │    │        └────┬──────┘
                │    │        │    │        │    │             │
                ▼    ▼        ▼    ▼        ▼    ▼             ▼
            ┌─────────────────────────────────────────────────┐
            │           SAFETY NET                            │
            │  Build lead pack (all stages)                   │
            │  Domain suppression                             │
            │  Repeat padding if needed                       │
            │  EXPORT (guaranteed `limit` leads)              │
            └─────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Sequential phases, not parallel
Discovery completes fully before enrichment starts. This lets us see the full picture before deciding to stop. The cost is time (can't overlap phases), but the benefit is quality (better decisions, adaptive search).

### 2. Intake filters are minimal
Only truly useless domains are blocked at intake (search engines, social media, shopping carts). Everything else — noise domains, supplier countries, edu/gov TLDs — passes through to Phase 2 where they receive scoring penalties instead of outright rejection. This means:
- A .edu domain that actually imports goods (e.g., a university bookstore) isn't killed prematurely
- A github.io page for a real brand isn't blocked
- Supplier country domains get penalized but can still pass if they show strong buyer signals

### 3. Progressive search depth
Instead of fixed depth per industry, the system starts at depth=1 and only deepens queries that showed promise (returned at least one valid domain). Dead queries are dropped. This preserves proxy health while maximizing coverage of productive queries.

### 4. AI is a last-resort strategy consultant
AI is expensive and slow. It's only invoked after 2 iterations of heuristic adjustments have failed. When invoked, it receives a structured report and returns structured parameters — no free-form text, no conversation. The system validates AI suggestions before using them.

### 5. Guaranteed completion
No matter what, the system returns exactly `limit` leads. If all discovery + adaptation fails, the safety net (backfill cascade + repeat padding) ensures completion. Low-quality fills are clearly flagged.

---

## Module Map

```
scraper/
├── main.py                 # Phase orchestration, CLI, safety net
├── modules/
│   ├── discovery.py        # Phase 1: search, seed URLs, intake filtering, stats
│   ├── enrichment.py       # Phase 2: website fetch, email extraction, socials
│   ├── scoring.py          # Phase 2: candidate scoring, ranking, filtering
│   ├── signal_map.py       # Industry-specific signals, keywords, routing
│   ├── diagnostics.py      # Phase 3: stats collection, heuristic analysis, AI integration (NEW)
│   └── export.py           # CSV/JSON/XLSX formatting
├── tests/
│   ├── test_discovery.py
│   ├── test_enrichment.py
│   ├── test_scoring.py
│   └── test_diagnostics.py (NEW)
└── tools/
    └── (future: AI prompt templates, query templates)
```

---

## AI Integration (Cost-Conscious)

### Trigger conditions
```
if iteration_count >= 2
   AND qualified_count < limit
   AND os.environ.get("OPENAI_API_KEY") exists
   AND not already_called_ai_this_job:
    → invoke AI
```

### API call
```
POST https://api.openai.com/v1/chat/completions
Model: gpt-4o-mini (cheapest capable model)
Input:  ~400 tokens (structured diagnosis JSON)
Output: ~150 tokens (structured adjustments JSON)
Cost:   ~$0.0001 per call
```

### Prompt structure
```json
{
  "system": "You are a lead generation search strategist. Given a diagnosis report, suggest concrete search query adjustments to find more buyer/importer leads. Return only valid JSON.",
  "user": {
    "industry": "apparel importers wholesalers private label clothing",
    "region": "USA",
    "target_market": "United States",
    "leads_found": 3,
    "leads_needed": 10,
    "query_performance": [
      {"query": "...", "returned": 47, "passed_intake": 5, "scored_above_35": 0},
      ...
    ],
    "top_blocking_filters": [
      {"filter": "EXPORTER_COUNTRY_SUFFIXES", "count": 89},
      {"filter": "noise_keywords", "count": 34}
    ],
    "dead_queries": ["query that returned 0 candidates"]
  }
}
```

### Response format
```json
{
  "new_queries": ["alternate query 1", "alternate query 2"],
  "filters_to_relax": ["EXPORTER_COUNTRY_SUFFIXES"],
  "scoring_adjustments": {"min_score": 55},
  "reasoning": "Brief explanation of strategy change"
}
```

### Fallback
If no API key or API call fails: continue with heuristic adjustments (drop dead queries, broaden terms mechanically, increase depth to max).

---

## Guaranteed Completion Flow

```
After all phases and iterations:

1. Collect ALL scored_candidates across all iterations
2. Deduplicate by domain
3. Sort by score descending
4. Attempt build_lead_pack():
   Stick (min_score=75) → Relaxed thresholds → Hard backfill
   → Exploratory backfill → Forced backfill → Repeat padding

Result: Always exactly `limit` leads.
```

The system logs each stage of fill clearly in the status output so operators can see when quality was sacrificed for completion.
