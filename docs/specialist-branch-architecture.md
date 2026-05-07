# Specialist Branch Architecture — Router-Worker + Per-Industry Configs

## Problem Statement

The current system has all industry-specific logic hardcoded across 4 files:
- `scraper/modules/signal_map.py` — 5 hardcoded clusters, signal catalog
- `scraper/modules/discovery.py` — 20 hardcoded apparel queries, 100+ seed URLs, directory sources
- `scraper/modules/scoring.py` — hardcoded keyword lists, scoring weights, tier thresholds
- `scraper/modules/enrichment.py` — hardcoded path hints, email classification

The textile/apparel case was A+ because the pipeline WAS apparel. Every other industry gets a generic fallback that performs at C-tier. The "Layered Adaptive Pipeline" in `docs/architecture.md` improves execution flow (sequential phases, adaptive retry) but doesn't solve the specialization problem — it's still one generalist.

## Goal

Convert the monolith into a **Router-Worker architecture** where:
1. A **Router** classifies the incoming request's industry
2. It routes to a **specialist config file** (YAML) tuned for that niche
3. Adding a new industry = adding a new YAML file (no code changes)
4. A **feedback loop** stores successful patterns and retrieves them for new/similar industries (RAG-style)

---

## Architecture: Tree with Branches

```
                         ┌──────────────────┐
                         │   USER REQUEST    │
                         │ "Find me heavy    │
                         │  machinery        │
                         │  importers in UK" │
                         └────────┬─────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │     ROUTER (Trunk)       │
                    │  - Classifies industry   │
                    │  - Maps to config file   │
                    │  - Queries feedback DB   │
                    │    for similar past runs │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │ TEXTILE  │   │ AUTOMOTV │   │ HEAVY   │
       │ CONFIG   │   │ CONFIG   │   │ MACHIN  │
       │ (A+ tier)│   │ (new)    │   │ (new)   │
       └────┬─────┘   └────┬─────┘   └────┬─────┘
            │              │              │
            └──────────────┼──────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │  ADAPTIVE PIPELINE      │
              │  (same Phases 1-3)      │
              │  but config-driven      │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │  VERIFICATION AGENT     │
              │  (Critic: scores leads) │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌──────────────┐         ┌──────────────┐
       │  DELIVER     │         │  FEEDBACK DB │
       │  LEADS       │         │  (Supabase)  │
       └──────────────┘         │  Store what  │
                                │  worked      │
                                └──────────────┘
```

---

## What Goes in a Config File

Each industry gets a YAML file at `scraper/configs/{industry_slug}.yml`. Here's what it contains — extracted from what's currently hardcoded:

```yaml
# scraper/configs/textile-apparel.yml
slug: textile-apparel
display_name: "Textile & Apparel Importers"
version: 1

# What triggers this config? Keyword matching
triggers:
  keywords:
    - activewear
    - apparel
    - boutique
    - clothing
    - denim
    - fabric
    - fashion
    - garment
    - jeans
    - private label
    - sportswear
    - streetwear
    - textile
    - towel
    - leather

# ---- DISCOVERY ----
discovery:
  # Search query templates (replaces _buyer_search_queries in discovery.py)
  search_queries:
    - '{base} importer wholesaler distributor "{market}" contact -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter'
    - '{base} wholesale buyer retailer "{market}" contact email -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter'
    # ... all 20+ apparel queries extracted here

  # Seed URLs — known buyer/retailer sites (replaces seed_urls() in discovery.py)
  seed_urls:
    usa:
      buyer_intent:
        - url: "https://www.ssactivewear.com"
          label: "S&S Activewear (wholesale clothing)"
        - url: "https://www.alphabroder.com"
          label: "Alphabroder (wholesale distributor)"
        # ... all 19 USA buyer-intent URLs
      apparel_buyers:
        - url: "https://www.urbanoutfitters.com"
          label: "Urban Outfitters"
        # ... all 30 USA apparel buyer URLs
    uk:
      # ... all UK URLs
    europe:
      # ... all Europe URLs

  # Directory sources per region (replaces generate_sources() in discovery.py)
  directory_sources:
    usa:
      - type: yellow_pages
        search: "importers, wholesalers, distributors"
      - type: la_fashion_district
        pages: [1, 2, 3, 4]
    uk:
      - type: yell
        search: "buyer"
    europe:
      - type: europages
        search: "buyer"

  # Exclusion lists (replaces EXCLUDED_HOST_PARTS, EXCLUDED_ROOT_DOMAINS, etc.)
  exclusions:
    host_parts:
      - google.
      - bing.
      - facebook.
      - instagram.
      # ...
    root_domains:
      - cambridge.org
      - github.com
      # ...
    domain_suffixes:
      - .edu
      - .gov
      - .mil
    exporter_country_suffixes:
      - .bd
      - .cn
      - .com.pk
      - .in
      - .pk
      - .tr
      - .vn

  # Product seed terms (for directory/profile resolution)
  product_seeds:
    - denim
    - jeans
    - home textile
    - activewear
    - sportswear
    - streetwear
    - garment
    - fabric
    - fashion
    - apparel
    - clothing
    - textile
    - towel
    - leather

# ---- SCORING ----
scoring:
  weights:
    product_fit: 20
    buyer_intent: 30
    reachability: 20
    commercial_readiness: 15
    evidence_depth: 15
    negative_penalty: 45

  keywords:
    product_keywords:
      - activewear
      - apparel
      - clothing
      - denim
      - fabric
      - fashion
      - garment
      - textile
      - towel
      # ... all 21 product keywords
    strong_buyer_keywords:
      - become a supplier
      - vendor portal
      - vendor registration
      - importer
      - import
      - procurement
      - sourcing
      - supplier registration
      - wholesale buyer
      - trade account
      - buying office
      - purchasing department
      # ... all 27 strong buyer keywords
    moderate_buyer_keywords:
      - boutique
      - brand
      - retail
      - retailer
      - stockist
      - trade
      - wholesale
      # ... all 11
    negative_keywords:
      - careers
      - job opening
      - magazine
      - news
      - editorial
      - advertising
      # ... all 18
    platform_keywords:
      - advertise with us
      - directory
      - marketplace
      - platform
      - sponsored listings
    supplier_country_markers:
      - bangladesh
      - china
      - faisalabad
      - india
      - karachi
      - lahore
      - pakistan
      - sialkot
      - vietnam
    noisy_domain_markers:
      - apparelnews.net
      - fashionnetwork.com
      - fiber2fashion.com
      - cambridge.org
      # ... all 11

  tiers:
    a_plus:
      min_score: 85
      require_hard_checks: true
      require_buyer_evidence: true
      require_email: decision  # decision | business | any | none
    a:
      min_score: 75
      require_hard_checks: true
      require_email: any
    c:
      min_score: 55

  pitch_angles:
    importer: "We are a {origin} based manufacturer of {product}. We're reaching out because we see you actively import {category} and would love to discuss becoming one of your suppliers."
    distributor: "..."
    wholesaler: "..."
    # ... all pitch templates

# ---- ENRICHMENT ----
enrichment:
  likely_paths:
    - /contact
    - /contact-us
    - /wholesale
    - /trade
    - /b2b
    - /vendors
    - /vendor-registration
    - /suppliers
    - /supplier-portal
    - /procurement
    - /sourcing
    - /private-label
    # ... all 42 paths
  high_value_path_hints:
    - b2b
    - become-a-vendor
    - buyers
    - distributor
    - import
    - procurement
    - sourcing
    - supplier
    - trade
    - vendor
    - wholesale
    - line-sheet
  contact_path_hints:
    - about
    - b2b
    - become-a-vendor
    - business
    - buyers
    - contact
    - distributor
    - import
    - procurement
    - sourcing
    - stockist
    - supplier
    - trade
    - vendor
    - wholesale
  email_classification:
    high_quality_prefixes:
      - b2b
      - buyer
      - export
      - import
      - partnerships
      - procurement
      - purchasing
      - sales
      - sourcing
      - supplier
      - trade
      - vendor
      - wholesale
    rejected_prefixes:
      - abuse
      - careers
      - donotreply
      - hr
      - jobs
      - legal
      - no-reply
      - noreply
      - press
      - privacy
      - recruiting
      - webmaster

# ---- SIGNAL MAP (formerly in signal_map.py) ----
signals:
  cluster: manufacturing_expansion  # or d2c_growth, local_services_expansion, etc.
  quality_mode: balanced
  signal_catalog:
    - name: trade-show-activity
      why_now: "Trade show season drives buyer-seller matching"
      confidence: 0.85
      query_templates:
        - '{industry} trade show "{market}" buyer exhibitor'
        - '{industry} fashion week "{market}" buyer list'
    - name: import-export-data
      why_now: "Import/export records reveal active buyers"
      confidence: 0.9
      query_templates:
        - '{industry} import data "{market}" panjiva'
        - '{industry} customs shipment "{market}" importer'
    # ... extract all signals from _signal_catalog() in signal_map.py

  search_intent: manufacturing_expansion

# ---- REGION OVERRIDES ----
# Per-region adjustments (currently hardcoded in discovery.py and scoring.py)
region_overrides:
  uk:
    exporter_country_suffixes:
      - .bd
      - .cn
      - .com.pk
      - .in
      - .pk
      - .tr
      - .vn
    seed_urls:  # region-specific seed list
      # ...
  europe:
    # ...
```

---

## New Module: Router (`scraper/modules/router.py`)

The Router is the "trunk" of the tree. It has one job: classify the industry and pick the right config.

```python
class IndustryRouter:
    """Classifies incoming requests and routes to specialist configs."""

    def __init__(self, config_dir: str = "scraper/configs"):
        self.config_dir = Path(config_dir)
        self.configs: dict[str, dict] = {}  # slug → parsed YAML
        self._load_all_configs()

    def classify(self, industry: str, region: str) -> tuple[str, dict]:
        """
        Given an industry string + region, return:
        - config_slug (str): which config file to use
        - config (dict): the full parsed YAML
        - confidence (float): how good the match is
        """
        # 1. Try deterministic keyword matching against all config triggers
        # 2. If no match > threshold, use Gemini to classify
        # 3. Fall back to generic catch-all config

    def get_config(self, slug: str) -> dict:
        """Return the full config for a given slug."""

    def merge_with_job_config(self, config: dict, job_config: dict) -> dict:
        """Merge specialist config with per-run overrides from job_config."""
```

### Classification strategy (3-tier fallback):

**Tier 1 — Deterministic keyword matching (free, instant, works offline):**
- Tokenize the user's industry string
- Score each config by how many trigger keywords match
- If top match > threshold (e.g., 3+ keyword hits): use it

**Tier 2 — Gemini classification (when deterministic is ambiguous):**
- Only called if top match has < 3 keyword hits OR two configs tie
- Send Gemini: "Classify this industry: '{industry}' into one of: [list of available config slugs and their descriptions]"
- Returns a JSON with `best_match_slug` and `confidence`
- Cost: ~$0.00005 per call. Cached per unique industry string.

**Tier 3 — Generic fallback + Discovery Worker:**
- If Gemini also can't classify: use `generic_b2b.yml` config
- Flag the job for review. After the run, if results are good enough, the operator can promote it to a new specialist config.

### Feedback DB integration:
Before routing, the Router queries Supabase for similar past runs:

```sql
SELECT metadata->'report'->'strongestPatterns',
       metadata->'report'->'recommendedFollowUpSearches'
FROM job_events
WHERE status = 'report_ready'
  AND metadata->'config_slug' = 'textile-apparel'
ORDER BY created_at DESC
LIMIT 5;
```

These patterns get injected into the config as additional search queries and scoring hints.

---

## New Module: Config Loader (`scraper/modules/config_loader.py`)

```python
class ConfigLoader:
    """Loads, validates, and merges specialist configs."""

    def load(self, slug: str) -> dict:
        """Load a single config YAML, validate structure."""

    def merge(self, base_config: dict, job_config_overrides: dict) -> dict:
        """
        Deep merge job_config.scoring_context into the specialist config.
        Job config can ADD keywords, ADD blocked domains, ADD search terms.
        Job config can NEVER remove specialist config entries.
        """

    def validate(self, config: dict) -> list[str]:
        """Validate required fields exist. Return list of validation errors."""

    def list_available(self) -> list[dict]:
        """Return all available configs with their display names and trigger keywords."""
```

---

## Changes to Existing Modules

### `scraper/modules/signal_map.py`
**Current:** Hardcoded clusters, signal catalog, scoring context.
**After:** Becomes a thin wrapper.

```python
def build_signal_map(region, industry, search_terms, config_slug=None):
    # If config_slug is provided, load specialist config
    # Otherwise, use Router to classify
    router = IndustryRouter()
    slug, config = router.classify(industry, region)
    # Return the config's signals + scoring_context
    return config.get("signals", {}), config.get("scoring", {})
```

The `_cluster_for_industry()` and `_signal_catalog()` functions get replaced by config lookups. We keep them as fallback for when no config matches.

### `scraper/modules/discovery.py`
**Current:** Hardcoded `_buyer_search_queries()`, `_is_apparel_industry()`, `seed_urls()`, `generate_sources()`, exclusion lists.
**After:** All accept a `config` parameter.

```python
class LeadDiscovery:
    def __init__(self, config: dict = None):
        self.config = config or {}
        # Use config.discovery.search_queries instead of _buyer_search_queries()
        # Use config.discovery.seed_urls instead of seed_urls()
        # Use config.discovery.directory_sources instead of generate_sources()
        # Use config.discovery.exclusions instead of EXCLUDED_HOST_PARTS etc.

    def generate_sources(self, region, industry, depth):
        # Load from self.config instead of hardcoded

    def _buyer_search_queries(self, base, market, region):
        # Use self.config.discovery.search_queries templates
```

The old hardcoded functions remain as `_buyer_search_queries_legacy()` for backward compatibility with the `--legacy` flag.

### `scraper/modules/scoring.py`
**Current:** Hardcoded keyword dictionaries, weights, tier thresholds.
**After:** Accepts a `config` parameter.

```python
class LeadScoring:
    def __init__(self, config: dict = None):
        self.config = config or {}
        # Use config.scoring.keywords instead of hardcoded lists
        # Use config.scoring.weights instead of hardcoded weights
        # Use config.scoring.tiers instead of hardcoded thresholds
```

### `scraper/modules/enrichment.py`
**Current:** Hardcoded `LIKELY_PATHS`, `HIGH_VALUE_PATH_HINTS`, email prefixes.
**After:** Accepts a `config` parameter.

```python
class LeadEnrichment:
    def __init__(self, config: dict = None):
        self.config = config or {}
        # Use config.enrichment.likely_paths
        # Use config.enrichment.high_value_path_hints
        # Use config.enrichment.email_classification
```

### `scraper/main.py`
**Current:** Calls `build_signal_map()`, hardcoded region normalization.
**After:** Integrates Router at startup.

```python
def run_scraper_adaptive(job_config=None, ...):
    # 1. Router classifies the request
    router = IndustryRouter()
    slug, config = router.classify(
        industry=job_config.get("targeting", {}).get("industry", ""),
        region=job_config.get("targeting", {}).get("region", "USA")
    )
    # 2. Merge specialist config with job_config overrides
    merged_config = router.merge_with_job_config(config, job_config)

    # 3. Query feedback DB for similar past patterns
    feedback = query_feedback_db(slug, region)

    # 4. Inject feedback into config (additional search queries, scoring hints)
    merged_config = inject_feedback(merged_config, feedback)

    # 5. Pass config to all pipeline stages
    discovery = LeadDiscovery(config=merged_config)
    enrichment = LeadEnrichment(config=merged_config)
    scoring = LeadScoring(config=merged_config)

    # ... rest of pipeline unchanged
```

### `frontend/src/lib/gemini.ts`
**Current:** Preflight prompt is generic "AI lead-generation strategist."
**After:** Enhanced to include industry classification.

The preflight now also asks Gemini to classify the industry:
```typescript
// Add to the TargetingPreflight response:
{
  // ... existing fields
  "configClassified": "textile-apparel",  // ← NEW: Gemini's best guess at which specialist config
  "classificationConfidence": 0.85,
  "industryProfile": {
    "sector": "manufacturing",
    "buyerChain": "b2b_wholesale",
    "keyPlatforms": ["trade shows", "import/export databases"]
  }
}
```

The frontend `ConfigWidget` can show which specialist config was matched and let the user override it.

---

## Feedback Loop: "Roots Pulling Water to the Tree"

### Database Schema Addition

```sql
-- supabase/migrations/add_specialist_configs.sql

CREATE TABLE specialist_configs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text UNIQUE NOT NULL,          -- "textile-apparel"
    display_name text NOT NULL,
    config_yaml text NOT NULL,                 -- full YAML snapshot
    version     integer DEFAULT 1,
    status      text DEFAULT 'active',         -- active|draft|archived
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE TABLE specialist_feedback (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    config_slug text NOT NULL,                 -- which specialist config
    job_id      uuid REFERENCES lead_jobs(id),
    pattern_type text NOT NULL,                -- search_query|seed_url|scoring_keyword|filter_relax
    pattern_value text NOT NULL,               -- the actual query/URL/keyword
    pattern_context jsonb,                     -- {region, industry, score_impact, lead_count}
    confidence  float DEFAULT 0.5,
    source      text DEFAULT 'run',            -- run|manual|ai_review
    promoted    boolean DEFAULT false,         -- promoted to config?
    created_at  timestamptz DEFAULT now()
);

-- Index for RAG-style retrieval: "give me patterns from similar configs"
CREATE INDEX idx_feedback_config_slug ON specialist_feedback(config_slug);
CREATE INDEX idx_feedback_created ON specialist_feedback(created_at DESC);
```

### Feedback Collection (automatic, post-job)

After every job completes and the Gemini job review runs:

1. Parse `strongestPatterns` and `recommendedFollowUpSearches` from the review report
2. Extract specific search queries that performed well, seed URLs that yielded leads, keywords that correlated with high scores
3. Insert into `specialist_feedback` with the config_slug

```python
# In worker_api.py or a post-job hook
def collect_feedback(job_id: str, config_slug: str, report: dict):
    for pattern in report.get("strongestPatterns", []):
        db.insert("specialist_feedback", {
            "config_slug": config_slug,
            "job_id": job_id,
            "pattern_type": classify_pattern(pattern),  # search_query|seed_url|...
            "pattern_value": pattern["description"],
            "pattern_context": {"region": ..., "score_impact": ...},
            "confidence": pattern.get("confidence", 0.5)
        })
```

### Feedback Retrieval (before each new job)

When the Router picks a config for a new job, it also queries feedback:

```python
def query_feedback_db(config_slug: str, region: str, limit: int = 10) -> list[dict]:
    """Get successful patterns from past runs for this config+region combo."""
    return supabase.table("specialist_feedback") \
        .select("*") \
        .eq("config_slug", config_slug) \
        .eq("promoted", True) \
        .order("confidence", desc=True) \
        .limit(limit) \
        .execute()
```

These patterns get injected as additional search queries and scoring boosts.

### Pattern Promotion (manual or automatic)

When a feedback pattern has been used successfully across 3+ jobs, it can be "promoted" — meaning it gets merged into the actual config YAML file. This is initially manual (operator reviews and runs a script) but can be automated later.

```python
# scripts/promote_feedback.py
def promote_patterns(config_slug: str, min_confidence: float = 0.7):
    """Merge promoted feedback patterns into the config YAML."""
    feedback = query_feedback_db(config_slug, promoted=True)
    config = load_yaml(f"scraper/configs/{config_slug}.yml")

    for pattern in feedback:
        if pattern["pattern_type"] == "search_query":
            if pattern["pattern_value"] not in config["discovery"]["search_queries"]:
                config["discovery"]["search_queries"].append(pattern["pattern_value"])

    save_yaml(f"scraper/configs/{config_slug}.yml", config)
```

---

## Verification Agent (Critic)

A lightweight post-scoring filter that catches C-tier fluff before delivery.

```python
# scraper/modules/verification.py

class VerificationAgent:
    """Critic agent that re-evaluates leads before delivery."""

    def __init__(self, config: dict):
        self.config = config
        self.rejection_reasons = []

    def verify_lead(self, lead: dict) -> tuple[bool, str]:
        """
        Returns (approved, reason).
        Only runs Gemini for borderline cases (score 55-74).
        """
        if lead["score"] >= 75:
            return True, "Above threshold"

        if lead["score"] < 55:
            return False, "Below minimum"

        # Borderline: ask Gemini
        prompt = f"""
        Lead: {lead['domain']}
        Industry: {self.config['display_name']}
        Evidence: {lead.get('buyer_evidence', '')}
        Content excerpt: {lead.get('content', '')[:500]}

        Is this lead a genuine {self.config['display_name']} buyer/importer?
        Return JSON: {{"approved": true/false, "reason": "..."}}
        """
        result = call_gemini(prompt)
        return result["approved"], result["reason"]
```

Cost control: Only called for borderline leads (score 55-74), max 10 per job. Uses `gemini-2.0-flash` at ~$0.00002 per call.

---

## Implementation Plan

### Phase 1: Extract Textile Config (A+ baseline)

1. **Create `scraper/configs/` directory**
2. **Create `scraper/configs/textile-apparel.yml`** — extract ALL hardcoded apparel values from:
   - `discovery.py`: `_buyer_search_queries()` apparel queries, `seed_urls()` USA/UK/Europe lists, `generate_sources()` directory sources, all exclusion lists, `_product_seed()` apparel terms
   - `scoring.py`: All keyword lists, weights, tier thresholds, pitch angles
   - `enrichment.py`: LIKELY_PATHS, HIGH_VALUE_PATH_HINTS, CONTACT_PATH_HINTS, email classification
   - `signal_map.py`: Signal catalog for manufacturing_expansion cluster, search intent, quality_mode
3. **Create `scraper/configs/generic-b2b.yml`** — the current catch-all fallback
4. **Create `scraper/modules/config_loader.py`** — YAML loading, validation, merge logic
5. **Test**: Run `final scrapper.py` with `--config textile-apparel` and verify identical results to current code

### Phase 2: Build Router

1. **Create `scraper/modules/router.py`** — `IndustryRouter` class with 3-tier classification
2. **Integrate into `scraper/main.py`** — Router runs at pipeline startup, selects config
3. **Modify `discovery.py`** — accept config param, use config for queries/seeds/exclusions (keep legacy as fallback)
4. **Modify `scoring.py`** — accept config param, use config for keywords/weights/tiers
5. **Modify `enrichment.py`** — accept config param, use config for paths/email classification
6. **Modify `signal_map.py`** — delegate to config; keep as fallback wrapper
7. **Test**: Run the same textile job through Router, verify identical results
8. **Test**: Run a non-textile job (e.g., automotive), verify it at least matches current generic behavior

### Phase 3: Add 2-3 New Specialist Configs

1. **Create `scraper/configs/automotive-parts.yml`** — research: what queries work for car parts importers? What directories? What keywords?
2. **Create `scraper/configs/heavy-machinery.yml`** — same process
3. **Create `scraper/configs/food-beverage.yml`** — for the food chain requests you mentioned
4. **Test**: Run real jobs for each. Tune until each hits A-tier quality.
5. **Document**: Write `scraper/configs/README.md` explaining the config format and how to add a new industry

### Phase 4: Feedback Loop

1. **Run migration** to add `specialist_configs` and `specialist_feedback` tables
2. **Modify `worker_api.py`** or `scraper/main.py` — post-job hook that parses the Gemini review report and inserts feedback
3. **Modify Router** to query feedback DB before each job and inject patterns
4. **Create `scripts/promote_feedback.py`** — manual promotion script
5. **Test**: Run textile job once, verify feedback is collected. Run again, verify it uses previous feedback.

### Phase 5: Verification Agent + Frontend Integration

1. **Create `scraper/modules/verification.py`** — Critic agent for borderline leads
2. **Integrate into `build_lead_pack()`** — verification runs before final pack assembly
3. **Enhance preflight in `gemini.ts`** — add `configClassified` field, show matched config in ConfigWidget
4. **Add config override UI** — user can see which config was matched and pick a different one
5. **Test**: Run full pipeline with verification enabled

---

## Files Changed (Summary)

| File | Action | What Changes |
|------|--------|-------------|
| `scraper/configs/textile-apparel.yml` | **NEW** | All textile-specific config extracted from code |
| `scraper/configs/generic-b2b.yml` | **NEW** | Catch-all fallback config |
| `scraper/configs/automotive-parts.yml` | **NEW** | Example new specialist config |
| `scraper/configs/heavy-machinery.yml` | **NEW** | Example new specialist config |
| `scraper/configs/README.md` | **NEW** | Config format documentation |
| `scraper/modules/router.py` | **NEW** | IndustryClassifier, config selection, 3-tier fallback |
| `scraper/modules/config_loader.py` | **NEW** | YAML parse, validate, merge with job_config |
| `scraper/modules/verification.py` | **NEW** | Critic agent for borderline lead filtering |
| `scraper/modules/signal_map.py` | **MODIFY** | Delegate to config; keep legacy wrapper |
| `scraper/modules/discovery.py` | **MODIFY** | Accept config param; use config for queries/seeds/sources/exclusions |
| `scraper/modules/scoring.py` | **MODIFY** | Accept config param; use config for keywords/weights/tiers |
| `scraper/modules/enrichment.py` | **MODIFY** | Accept config param; use config for paths/email classification |
| `scraper/main.py` | **MODIFY** | Integrate Router at startup; pass config to all modules |
| `frontend/src/lib/gemini.ts` | **MODIFY** | Add `configClassified` to preflight response |
| `frontend/src/components/AgenticChat.tsx` | **MODIFY** | Show matched config; allow override |
| `supabase/schema.sql` | **MODIFY** | Add `specialist_configs` and `specialist_feedback` tables |
| `worker_api.py` | **MODIFY** | Post-job feedback collection hook |
| `scripts/promote_feedback.py` | **NEW** | Manual promotion of feedback patterns to config YAML |

---

## Verification: How to Test

1. **Regression test**: Run `final scrapper.py --config textile-apparel` for a textile job. Output must match current code EXACTLY (same leads, same scores, same order).
2. **New industry test**: Add `automotive-parts.yml` config with initial queries/seeds. Run a job. Iterate on the YAML until results match A-tier quality. No code changes needed between iterations.
3. **Router accuracy test**: Feed 20 different industry strings to the Router. Verify it picks the correct config each time. Measure misclassification rate.
4. **Feedback test**: Run the same textile job twice. Second run should include feedback from the first run as additional queries/scoring hints.
5. **Config override test**: In the frontend, manually select a different config than what Gemini classified. Verify the scraper uses the override.
6. **Verification agent test**: Run a job with `min_score=55`. Verify the verification agent filters borderline leads and only delivers genuinely relevant ones.
