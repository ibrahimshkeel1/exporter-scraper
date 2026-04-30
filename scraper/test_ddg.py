import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def test_ddg():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        await page.goto("https://duckduckgo.com/?q=clothing+brands+in+USA")
        await page.wait_for_timeout(5000)
        
        links = await page.query_selector_all('a[data-testid="result-title-a"]')
        print(f"DDG found {len(links)} results")
        for i, link in enumerate(links[:5]):
            href = await link.get_attribute('href')
            text = await link.inner_text()
            print(f"Result {i}: {text} -> {href}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_ddg())
