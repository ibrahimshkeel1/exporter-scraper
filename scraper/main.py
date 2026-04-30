import asyncio
import json
import re
import random
import argparse
import csv
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from urllib.parse import unquote

class ExportFlowScraper:
    def __init__(self, industry, country, limit=10):
        self.industry = industry
        self.country = country
        self.limit = limit
        self.results = []
        self.email_regex = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

    def calculate_score(self, emails, content, linkedin_url):
        score = 0
        if emails:
            score += 3
        if len(emails) > 1:
            score += 1
        
        content_lower = content.lower()
        if any(kw in content_lower for kw in ['export', 'exporter', 'international', 'global', 'worldwide']):
            score += 3
        if any(kw in content_lower for kw in ['quality', 'iso', 'standard', 'certified']):
            score += 2
        if linkedin_url:
            score += 1
            
        return min(score, 10)

    async def get_search_results(self, page):
        """Tries multiple search engines and queries to find LinkedIn company links."""
        queries = [
            f'site:linkedin.com/company/ "{self.industry}" "{self.country}"',
            f'"{self.industry}" companies in {self.country} linkedin',
            f'top {self.industry} exporters in {self.country} linkedin'
        ]
        
        engines = [
            "https://www.bing.com/search?q=",
            "https://duckduckgo.com/?q=",
            "https://www.google.com/search?q="
        ]
        
        links = []
        for query in queries:
            for engine_base in engines:
                if len(links) >= self.limit:
                    break
                    
                url = f"{engine_base}{query}"
                print(f"Searching: {url}")
                try:
                    await page.goto(url, timeout=30000)
                    await page.wait_for_timeout(random.randint(5000, 8000))
                    
                    content = await page.content()
                    if "CAPTCHA" in content or "robot" in content.lower() or "418" in content:
                        print(f"Blocked by engine for query: {query}")
                        continue

                    all_links = await page.query_selector_all('a')
                    for link in all_links:
                        href = await link.get_attribute('href')
                        if href:
                            if "url?q=" in href: # Google
                                match = re.search(r'url\?q=([^&]+)', href)
                                if match: href = unquote(match.group(1))
                            elif "uddg=" in href: # DDG
                                match = re.search(r'uddg=([^&]+)', href)
                                if match: href = unquote(match.group(1))
                            
                            if 'linkedin.com/company/' in href and not any(x in href for x in ['/posts/', '/jobs/', '/people/']):
                                # Clean trailing slash and params
                                clean_href = href.split('?')[0].rstrip('/')
                                if clean_href not in links:
                                    links.append(clean_href)
                        if len(links) >= self.limit:
                            break
                    
                    print(f"Progress: {len(links)} links found.")
                except Exception as e:
                    print(f"Error searching: {e}")
            
            if len(links) >= self.limit:
                break
                
        return links[:self.limit]

    async def search_company_website(self, page, company_name):
        print(f"Searching website for: {company_name}")
        query = f'"{company_name}" {self.industry} {self.country} official website'
        try:
            await page.goto(f"https://www.bing.com/search?q={query}")
            await page.wait_for_timeout(random.randint(3000, 5000))
            
            search_results = await page.query_selector_all('a')
            for link_element in search_results:
                href = await link_element.get_attribute('href')
                if href and href.startswith('http') and not any(x in href for x in ['bing.com', 'google.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'wikipedia.org']):
                    return href
            return None
        except Exception as e:
            print(f"Error searching website: {e}")
            return None

    async def extract_emails_and_qualify(self, page, website_url, linkedin_url):
        print(f"Visiting: {website_url}")
        try:
            await page.goto(website_url, timeout=30000)
            await page.wait_for_timeout(random.randint(4000, 6000))
            content = await page.content()
            
            emails = set(re.findall(self.email_regex, content))
            emails = {e for e in emails if not any(x in e.lower() for x in ['.png', '.jpg', '.jpeg', '.gif', 'sentry.io', 'example.com', 'bootstrap', 'jquery', 'wix.com', 'wp.com', 'wordpress.com'])}

            if not emails:
                links = await page.query_selector_all('a')
                contact_url = None
                for link in links:
                    try:
                        text = (await link.inner_text()).lower()
                        if any(x in text for x in ['contact', 'about', 'get in touch']):
                            href = await link.get_attribute('href')
                            if href:
                                if not href.startswith('http'):
                                    base_url = "/".join(website_url.split('/')[:3])
                                    contact_url = base_url + ('/' if not href.startswith('/') else '') + href
                                else:
                                    contact_url = href
                                break
                    except: continue
                
                if contact_url:
                    print(f"Checking contact page: {contact_url}")
                    await page.goto(contact_url, timeout=30000)
                    await page.wait_for_timeout(random.randint(3000, 5000))
                    content += await page.content()
                    new_emails = set(re.findall(self.email_regex, content))
                    new_emails = {e for e in new_emails if not any(x in e.lower() for x in ['.png', '.jpg', '.jpeg', '.gif', 'sentry.io', 'example.com', 'bootstrap', 'jquery', 'wix.com'])}
                    emails.update(new_emails)
            
            score = self.calculate_score(emails, content, linkedin_url)
            return list(emails), score
        except Exception as e:
            print(f"Error visiting {website_url}: {e}")
            return [], 0

    async def run(self):
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)

            linkedin_links = await self.get_search_results(page)
            print(f"Processing {len(linkedin_links)} companies...")
            
            for link in linkedin_links:
                company_name = link.split('/company/')[-1].replace('/', '').replace('-', ' ').title()
                website = await self.get_website_from_linkedin(page, link) or await self.search_company_website(page, company_name)
                
                if website:
                    emails, score = await self.extract_emails_and_qualify(page, website, link)
                    if emails:
                        self.results.append({
                            "Company": company_name,
                            "Website": website,
                            "Emails": ", ".join(emails),
                            "LinkedIn": link,
                            "Qualification Score": score
                        })
                        print(f"Saved: {company_name} (Score: {score})")
                
                if len(self.results) >= self.limit:
                    break
                    
                await asyncio.sleep(random.uniform(3, 6))

            await browser.close()
            return self.results

    async def get_website_from_linkedin(self, page, linkedin_url):
        # We know visiting LinkedIn often fails, so we return None to trigger search
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ExportFlow AI Scraper")
    parser.add_argument("--industry", required=True)
    parser.add_argument("--country", required=True)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--output", default="test_leads.csv")
    args = parser.parse_args()

    scraper = ExportFlowScraper(args.industry, args.country, args.limit)
    results = asyncio.run(scraper.run())
    
    if results:
        keys = results[0].keys()
        with open(args.output, "w", newline="", encoding="utf-8") as f:
            dict_writer = csv.DictWriter(f, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(results)
        print(f"Scraping complete. Saved {len(results)} leads to {args.output}")
    else:
        print("No leads found with emails.")
