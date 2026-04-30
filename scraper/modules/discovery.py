import random
import re
import asyncio
from urllib.parse import unquote
import tldextract

class LeadDiscovery:
    def __init__(self, limit=30):
        self.limit = limit
        self.seen_domains = set()
        
        # New target configuration
        self.target_markets = {
            "USA": ["United States", "USA", "New York", "Los Angeles"],
            "UK": ["UK", "United Kingdom", "London"],
            "Europe": ["Germany", "France", "Italy", "Spain", "Netherlands", "Belgium", "Sweden", "Denmark", "Poland"]
        }

    def _normalize_domain(self, url):
        """Extract root domain to deduplicate companies."""
        ext = tldextract.extract(url)
        return f"{ext.domain}.{ext.suffix}".lower()

    def generate_queries(self, region):
        """Generate search/directory URLs for the region."""
        if region == "USA":
            return [
                "https://www.yellowpages.com/search?search_terms=clothing+brands&geo_location_terms=USA",
                "https://www.yellowpages.com/search?search_terms=apparel+retailers&geo_location_terms=USA"
            ]
        elif region == "UK":
            return [
                "https://www.yell.com/ucs/UcsSearchAction.do?keywords=clothing+brands&location=UK",
            ]
        else: # Europe
            return [
                "https://www.europages.co.uk/companies/clothing%20brands.html",
            ]

    async def run_discovery(self, page, region):
        """Discovers candidate URLs using directories or search engines."""
        print(f"Starting discovery for region: {region} (Limit: {self.limit})")
        urls = self.generate_queries(region)
        
        candidates = []
        for url in urls:
            if len(candidates) >= self.limit:
                break
                
            print(f"Visiting discovery source: {url}")
            try:
                await page.goto(url, timeout=45000)
                await page.wait_for_timeout(random.randint(5000, 8000))
                
                title = await page.title()
                print(f"Page Title: {title}")
                
                # Try to extract links using common directory selectors and generic approach
                all_links = await page.query_selector_all('a')
                found_in_iteration = 0
                
                for link in all_links:
                    href = await link.get_attribute('href')
                    if not href: continue
                    
                    # Clean the URL
                    clean_url = href
                    if clean_url.startswith('/'):
                        # Handle relative links if we are on a directory that links internally to company sites
                        # But usually we want external links.
                        continue
                        
                    if not clean_url.startswith('http'): continue
                    
                    # Filter out search engines and common junk
                    if any(x in clean_url for x in [
                        'google.com', 'bing.com', 'duckduckgo.com', 'microsoft.com',
                        'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
                        'youtube.com', 'wikipedia.org', 'amazon.', 'ebay.', 'yelp.',
                        'yellowpages.com', 'yell.com', 'europages.co.uk'
                    ]):
                        continue
                        
                    domain = self._normalize_domain(clean_url)
                    if domain and domain not in self.seen_domains:
                        self.seen_domains.add(domain)
                        candidates.append({
                            'url': clean_url,
                            'source_url': url,
                            'domain': domain
                        })
                        found_in_iteration += 1
                        
                    if len(candidates) >= self.limit:
                        break
                
                print(f"Progress: {len(candidates)} candidates found (+{found_in_iteration}).")
            except Exception as e:
                print(f"Error visiting {url}: {e}")
            
        return candidates[:self.limit]
