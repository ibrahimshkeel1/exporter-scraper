# Specialist Configs

Each `.yml` file in this directory defines a complete, self-contained search and scoring configuration for a specific industry niche.

## Adding a New Industry

1. Copy `generic-b2b.yml` as a starting template:
```bash
cp generic-b2b.yml your-industry.yml
```

2. Edit the file — fill in:
   - `slug` and `display_name`
   - `triggers.keywords` — what words in the user's prompt should route to this config?
   - `discovery.search_queries` — what Google/Bing/DuckDuckGo queries find this industry's leads?
   - `discovery.seed_urls` — known buyer/retailer sites for this industry per region
   - `discovery.directory_sources` — regional directories (Yellow Pages, Yell, Europages, etc.)
   - `scoring.keywords` — what keywords indicate a lead is a genuine buyer in this niche?
   - `signals.signal_catalog` — domain-specific signals (trade shows, import data, etc.)

3. Tune iteratively via the admin panel at `/admin/config-tuning`

## Config File Structure

```yaml
slug: your-industry-slug
display_name: "Human-Readable Name"
version: 1
quality_tier: "C"  # C, B, A, or A+

triggers:
  keywords: [word1, word2, "multi word phrase"]

discovery:
  product_seeds: [term1, term2]
  search_queries: ['{base} "{market}" contact email']
  seed_urls:
    usa:
      buyer_intent: [{url: "...", label: "..."}]
  directory_sources:
    usa: [{type: yellow_pages, search: "...", description: "..."}]
  exclusions:
    host_parts: [...]
    root_domains: [...]
    exporter_country_suffixes: [...]

scoring:
  weights:
    product_fit: 20
    buyer_intent: 30
    reachability: 20
    commercial_readiness: 15
    evidence_depth: 15
    negative_penalty: 45
  keywords:
    product_keywords: [...]
    strong_buyer_keywords: [...]
    ...
  tiers:
    a_plus: {min_score: 85}
    a: {min_score: 75}
    manual_review: {min_score: 55}

enrichment:
  likely_paths: [/contact, /about, ...]
  high_value_path_hints: [b2b, vendor, ...]
  email_classification:
    high_quality_prefixes: [procurement, sourcing, ...]

signals:
  cluster: generic_b2b
  signal_catalog:
    - name: active-growth-intent
      confidence: 0.7
      query_templates: ['{industry} {market} expansion contact']
```

## Template Variables

In `search_queries` and `signal_catalog.query_templates`, use:
- `{base}` → resolved to the primary `product_seed` term
- `{market}` → resolved to the target market (e.g., "United States", "United Kingdom")
- `{industry}` → the user's original industry description

## Tuning Workflow

1. Go to `/admin/config-tuning`
2. Select the config to tune
3. Run a test job ("Test Run" button)
4. Paste the job results (strongest patterns + audit/rejects) into the context boxes
5. Click "Gemini Analyze" — Gemini will suggest search query additions, keyword additions, and filter adjustments
6. Click individual suggestions to accept/reject them
7. "Apply" merges accepted suggestions into the YAML
8. Re-run the test to verify improvement
9. Click "Critic Check" for final approval
10. Repeat until approved

## Available Configs

| Slug | Tier | Description |
|------|------|-------------|
| `textile-apparel` | A+ | Textile & Apparel Importers — the original, best-performing config |
| `generic-b2b` | C | Catch-all fallback for unrecognized industries |
