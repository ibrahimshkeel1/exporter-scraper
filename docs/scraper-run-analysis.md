# Scraper Run Analysis

This note records the live scraper runs, timing, scoring logic, and the lead-quality review for the USA textile/apparel tests.

## Environment

- Workspace: `C:\Users\Ibrahim\Desktop\webdev`
- Python: `3.14.4`
- Playwright: installed
- `aiohttp`: installed during the run because it was missing initially

## Run Summary

### USA textile seed, 3 leads

- Command: `python scraper/main.py --region USA --industry textile --limit 3 --min-score 60 --format csv --output usa_textile_clients.csv --test-mode`
- Duration: about `43 seconds`
- Output: [usa_textile_clients.csv](C:/Users/Ibrahim/Desktop/webdev/usa_textile_clients.csv)

Observed leads:

- `Eny Textiles`
- `BHN International`
- `Textile Industries`

Assessment:

- The first two were the strongest matches in that run.
- The third was noisier because the crawler picked up textile publication/contact data from linked pages.

### USA textile seed, 10 leads

- Command: `python scraper/main.py --region USA --industry textile --limit 10 --min-score 0 --format csv --output usa_textile_10_raw.csv --test-mode`
- Duration: about `38.6 seconds`
- Output: [usa_textile_10_raw.csv](C:/Users/Ibrahim/Desktop/webdev/usa_textile_10_raw.csv)

Result:

- Only 7 candidates were returned.
- Several were false positives or low-quality entries.
- This was useful for understanding that the textile-only seed is too narrow to consistently produce 10 good matches.

### USA apparel seed, 10 leads

- Command: `python scraper/main.py --region USA --industry apparel --limit 10 --min-score 0 --format csv --output usa_apparel_10_raw.csv --test-mode`
- Duration: about `72.9 seconds`
- Output: [usa_apparel_10_raw.csv](C:/Users/Ibrahim/Desktop/webdev/usa_apparel_10_raw.csv)

This was the most useful 10-lead run for quality review.

## Scoring Criteria

Scoring is implemented in [scraper/modules/scoring.py](C:/Users/Ibrahim/Desktop/webdev/scraper/modules/scoring.py:1) and is based on:

- `ICP fit` up to `30` points
- `Buying intent` up to `30` points
- `Reachability` up to `20` points
- `Commercial readiness` up to `20` points
- `Buyer/importer profile` up to `15` points
- `Negative penalty` up to `15` points

Examples of positive signals:

- Textile/apparel wording
- Wholesale/importer/distributor language
- Contact emails
- High-quality inboxes like `info@`, `sales@`, `hello@`
- LinkedIn/social presence
- Store/catalog/order/contact signals

Examples of negative signals:

- Job or recruiting pages
- Editorial or publication-like pages
- Subscription or advertising language
- Noisy/textile-news style domains

## Quality Verdicts From The 10-Lead Apparel Run

### Strong leads

1. `Teancup`
   - Score: `100`
   - Verdict: strong
   - Why: real site, contact email, strong buyer/importer language, strong social presence

2. `Fashiongo`
   - Score: `97`
   - Verdict: strong
   - Why: real marketplace/wholesale platform with strong buyer-side signals

3. `Spirithoods`
   - Score: `89`
   - Verdict: strong
   - Why: real brand with contact email and social activity

4. `Mezonhandbags`
   - Score: `75`
   - Verdict: good
   - Why: real brand, contact email, and usable social presence

### Moderate leads

1. `Laapparelstore`
   - Score: `71`
   - Verdict: moderate
   - Why: real apparel store, but more retail-facing than importer-facing

2. `Steven Alan`
   - Score: `70`
   - Verdict: moderate
   - Why: real brand with a usable contact path, but weak buyer/importer intent

3. `MensUSA`
   - Score: `67`
   - Verdict: moderate
   - Why: real site with contact email, but buyer-side intent is not explicit

### Noisy or unusable leads

1. `Cloudflare`
   - Score: `52`
   - Verdict: no
   - Why: false positive from directory parsing

2. `Nike`
   - Score: `42`
   - Verdict: no
   - Why: false positive and too noisy for practical outreach

3. `Localsearch`
   - Score: `5`
   - Verdict: no
   - Why: failed fetch, not usable

## Takeaway

The scraper is capable of finding real prospects, but it still needs a more explicit buyer-side target model if the goal is mainly USA textile buyers for a Pakistan-based SaaS offer. Textile-only queries tend to drift into broad brands and industry pages; apparel/importer/wholesaler seeds produce better prospects, but still need noise filtering.

## Best Next Improvement

Tune discovery around buyer-side intent first:

- importer
- wholesaler
- distributor
- retailer
- procurement

Then tighten post-processing so editorial or platform noise is pushed down before scoring.
