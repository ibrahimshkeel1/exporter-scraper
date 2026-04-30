import asyncio
import argparse
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from modules.discovery import LeadDiscovery
from modules.enrichment import LeadEnrichment
from modules.scoring import LeadScoring
from modules.export import LeadExport

async def run_scraper(region, limit, output, test_mode):
    print(f"Starting Scraper - Region: {region} | Limit: {limit} | Test Mode: {test_mode}")
    
    # Phase 1: Discovery (Fetch initial candidates)
    # We fetch more candidates initially because many will be filtered out.
    discovery_limit = min(30, limit * 3) if test_mode else limit * 3
    discovery = LeadDiscovery(limit=discovery_limit)
    
    candidates = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        candidates = await discovery.run_discovery(page, region)
        await browser.close()

    if not candidates:
        print("No candidates found during discovery phase.")
        return

    # Phase 2: Enrichment (Fetch content, extract emails/socials concurrently)
    enrichment = LeadEnrichment(concurrency=10)
    enriched_candidates = await enrichment.run_enrichment(candidates)

    # Phase 3: Scoring & Filtering
    scoring = LeadScoring()
    top_leads = scoring.rank_and_filter(enriched_candidates, limit=limit)

    # Phase 4: Export
    exporter = LeadExport(output_file=output)
    exporter.save_to_csv(top_leads, region)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clothing Buyer Lead Scraper")
    parser.add_argument("--region", choices=["USA", "UK", "Europe"], default="USA", help="Target market region")
    parser.add_argument("--limit", type=int, default=10, help="Final number of leads to export")
    parser.add_argument("--output", default="buyer_leads.csv", help="Output CSV file name")
    parser.add_argument("--test-mode", action="store_true", help="Run with lower internal limits for quick testing")
    
    args = parser.parse_args()

    asyncio.run(run_scraper(
        region=args.region,
        limit=args.limit,
        output=args.output,
        test_mode=args.test_mode
    ))
