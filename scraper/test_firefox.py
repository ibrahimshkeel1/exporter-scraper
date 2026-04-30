import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def test_stealth_google():
    async with async_playwright() as p:
        # Try Firefox - sometimes less flagged than Chromium
        browser = await p.firefox.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0"
        )
        page = await context.new_page()
        # Stealth is primarily for Chromium, but let's try it or just headers
        
        url = "https://www.google.com/search?q=clothing+brands+USA"
        print(f"Testing Google with Firefox: {url}")
        
        await page.goto(url)
        await page.wait_for_timeout(5000)
        
        title = await page.title()
        print(f"Title: {title}")
        
        content = await page.content()
        if "captcha" in content.lower() or "unusual traffic" in content.lower():
            print("STILL BLOCKED ON GOOGLE")
        else:
            print("GOOGLE MIGHT BE OPEN!")
            links = await page.query_selector_all('a h3')
            print(f"Found {len(links)} result headers")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_stealth_google())
