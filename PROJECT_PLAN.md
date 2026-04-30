# ExportFlow AI: Export Lead Gen & Outreach Automation System

## 1. Business Overview
- **Product**: Managed Lead Generation + Automated Cold Outreach.
- **Niche**: Pakistani Exporters targeting EU/UK/USA buyers.
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
- **Scraper**: Python (Playwright/BeautifulSoup).
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

## 5. Scraper Logic (Python)
- **Input**: Industry, Country, Limit.
- **Process**: Google Search Dorking (`site:linkedin.com/company/`) -> Visit Website -> Regex Email Extraction.
- **Output**: JSON/CSV to n8n.

## 6. Security & Risks
- **IP Blocks**: Implement random delays in scraper.
- **Spam**: Limit SMTP sending to 50 emails/day per account.
- **Payments**: Manual verification via Telegram to avoid payment gateway fees.
