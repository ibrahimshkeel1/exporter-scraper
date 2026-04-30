# ExportFlow AI: Export Lead Gen & Outreach Automation System

## 1. Business Overview
- **Product**: Managed Lead Generation + Automated Cold Outreach.
- **Niche**: Finding **Buyer Leads (Clothing Brands/Retailers/Importers)** for Pakistani Exporters in EU/UK/USA.
- **Pricing**: 
  - $50 for 500 verified leads (One-time).
  - $30/month for Outreach Automation (Subscription).

## 2. Website Structure
- **Homepage**: Hero, 3-step process, Pricing.
- **Lead Purchase Page**: Industry/Country selection form.
- **Payment Page**: Manual Transaction ID + Screenshot upload (EasyPaisa/JazzCash).
- **Automation Dashboard**: SMTP/Template configuration.
- **Order Tracking**: Status of scraping/sending.

## 3. Tech Stack (Self-Hosted/Free)
- **Automation**: n8n (Self-hosted on VPS).
- **Scraper**: Python (Playwright + aiohttp + BeautifulSoup).
- **Database/Storage**: Google Sheets (via Service Account).
- **Communication**: Telegram Bot (for payment approvals).

## 4. n8n Workflows
### A. Lead Generation
1. Webhook (Form Submit) -> Telegram (Admin Approval).
2. Approval -> Execute Command (Python Scraper).
3. Scraper Output -> Create/Append Google Sheet.
4. Final Sheet -> Email to Client.

### B. Outreach & Tracking
1. Schedule (Hourly) -> Read Sheet.
2. Filter (Pending) -> SMTP Send.
3. Wait (3 Days) -> IMAP Check (Reply Detection).
4. Logic: If Replied (Stop) else (Follow-up 1).

## 5. Scraper Architecture (Python)
- **Target Profiles**: Clothing brands, private label buyers, retailers, and importers in USA, UK, and Europe.
- **Phase 1 (Discovery)**: Google/Bing search dorking targeting LinkedIn, Instagram, and official websites using dynamic queries. Evades bot detection with Playwright.
- **Phase 2 (Enrichment)**: High-speed concurrent fetching via `aiohttp` to extract emails, social links, and website text.
- **Phase 3 (Scoring)**: Evaluates leads out of 100 based on ICP Fit (30), Buying Intent (30), Reachability (20), and Commercial Readiness (20). Assigns Tiers (A, B, C).
- **Phase 4 (Export)**: Exports top qualified leads (up to a limit) to CSV/JSON format for ingestion by n8n.
- **Inputs**: `--region`, `--limit`, `--test-mode`.

## 6. Security & Risks
- **IP Blocks**: Use Stealth Playwright for search engines, concurrent aiohttp for standard websites.
- **Spam**: Limit SMTP sending to 50 emails/day per account.
- **Payments**: Manual verification via Telegram to avoid payment gateway fees.
