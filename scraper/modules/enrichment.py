import asyncio
import aiohttp
import re
from bs4 import BeautifulSoup

class LeadEnrichment:
    def __init__(self, concurrency=10):
        self.semaphore = asyncio.Semaphore(concurrency)
        self.email_regex = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

    async def fetch_page(self, session, url):
        """Fetch page content with aiohttp."""
        try:
            async with session.get(url, timeout=15, ssl=False) as response:
                if response.status == 200:
                    return await response.text()
                return None
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    def extract_data(self, html, url):
        """Extract emails, socials, and readable text from HTML."""
        if not html:
            return set(), set(), ""

        soup = BeautifulSoup(html, 'html.parser')
        text_content = soup.get_text(separator=' ', strip=True).lower()
        
        # Extract emails
        emails = set(self.email_regex.findall(html))
        emails = {e for e in emails if not any(x in e.lower() for x in ['.png', '.jpg', '.jpeg', '.gif', 'sentry.io', 'example.com', 'wix.com', 'sentry'])}
        
        # Extract socials
        socials = set()
        for link in soup.find_all('a', href=True):
            href = link['href']
            if any(platform in href for platform in ['linkedin.com', 'instagram.com', 'facebook.com', 'tiktok.com']):
                socials.add(href)
                
        return emails, socials, text_content

    async def enrich_candidate(self, session, candidate):
        """Process a single candidate."""
        async with self.semaphore:
            print(f"Enriching: {candidate['url']}")
            html = await self.fetch_page(session, candidate['url'])
            emails, socials, text_content = self.extract_data(html, candidate['url'])
            
            candidate['emails'] = list(emails)
            candidate['social_urls'] = list(socials)
            candidate['content'] = text_content
            
            # Extract LinkedIn specifically
            candidate['linkedin_url'] = next((s for s in socials if 'linkedin.com' in s), None)
            return candidate

    async def run_enrichment(self, candidates):
        """Run enrichment concurrently on all candidates."""
        connector = aiohttp.TCPConnector(limit_per_host=1)
        async with aiohttp.ClientSession(connector=connector, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}) as session:
            tasks = [self.enrich_candidate(session, c) for c in candidates]
            enriched = await asyncio.gather(*tasks)
            return enriched
