import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def test_yellowpages():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        url = "https://www.yellowpages.com/search?search_terms=clothing+brands&geo_location_terms=USA"
        print(f"Testing YellowPages: {url}")
        
        await page.goto(url)
        await page.wait_for_timeout(5000)
        
        title = await page.title()
        print(f"Title: {title}")
        
        # Extract website links from results
        links = await page.query_selector_all('a.track-visit-website')
        print(f"Found {len(links)} website links")
        for i, link in enumerate(links[:5]):
            href = await link.get_attribute('href')
            print(f"Result {i}: {href}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_yellowpages())
