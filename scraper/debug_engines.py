import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def debug_search(query, engine_url):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await Stealth().apply_stealth_async(page)
        
        search_url = f"{engine_url}{query}"
        print(f"Testing: {search_url}")
        
        await page.goto(search_url)
        await page.wait_for_timeout(5000)
        
        content = await page.content()
        title = await page.title()
        print(f"Title: {title}")
        
        if "captcha" in content.lower() or "unusual traffic" in content.lower():
            print("BLOCKED: Captcha/Unusual Traffic detected")
        else:
            print("NOT EXPLICITLY BLOCKED")
            
        # Extract links 50 to 100 for inspection
        links = await page.query_selector_all('a')
        print(f"Found {len(links)} links total.")
        for i, link in enumerate(links[50:100]):
            href = await link.get_attribute('href')
            text = await link.inner_text()
            print(f"Link {i+50}: {href} | Text: {text[:30]}")
                
        await browser.close()

if __name__ == "__main__":
    import sys
    q = "clothing brands in USA"
    asyncio.run(debug_search(q, "https://www.bing.com/search?q="))
    asyncio.run(debug_search(q, "https://www.google.com/search?q="))
