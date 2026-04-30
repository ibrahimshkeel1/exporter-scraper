import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def debug_bing():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        await page.goto("https://www.bing.com/search?q=clothing+brands+in+USA")
        await page.wait_for_timeout(5000)
        
        # Look for result headers
        results = await page.query_selector_all('li.b_algo h2 a')
        print(f"Found {len(results)} b_algo results")
        for i, res in enumerate(results):
            href = await res.get_attribute('href')
            text = await res.inner_text()
            print(f"Result {i}: {text} -> {href}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_bing())
