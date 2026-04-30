# Exporter Scraper (ExportFlow AI)

A Python-based lead generation scraper designed to find exporters and extract verified contact emails using Playwright and multi-engine search strategies.

## Features

- **Multi-Engine Search**: Utilizes Bing, Google, and DuckDuckGo to find LinkedIn company pages.
- **Lead Qualification**: Automatically scores leads based on export intent, operational scale, and digital presence.
- **Stealth Mode**: Integrates `playwright-stealth` and human-like browsing patterns to minimize bot detection.
- **Email Extraction**: Surgical regex-based email extraction from official websites and contact pages.
- **CSV Export**: Clean output ready for outreach or CRM integration.

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ibrahimshkeel1/exporter-scraper.git
   cd exporter-scraper
   ```

2. **Install dependencies**:
   ```bash
   pip install -r scraper/requirements.txt
   python -m playwright install chromium
   ```

## Usage

Run the scraper by specifying the industry and country:

```bash
python scraper/main.py --industry "Textile" --country "Pakistan" --limit 10 --output leads.csv
```

### Arguments:
- `--industry`: Target industry (e.g., "Textile", "Surgical Instruments").
- `--country`: Target country (e.g., "Pakistan").
- `--limit`: Number of leads to generate (default: 10).
- `--output`: Output CSV filename (default: test_leads.csv).

## Qualification Scoring (1-10)

- **Email Density (+3-4 pts)**: Variety of contact emails found.
- **Export Intent (+3 pts)**: Presence of keywords like "export", "international", "global".
- **Operational Scale (+2 pts)**: Certifications like "ISO", "quality", "certified".
- **Digital Presence (+1 pt)**: Verification of LinkedIn profile.

## Security & Ethics

This tool is intended for professional B2B lead generation. Please ensure compliance with local anti-spam laws (e.g., GDPR, CAN-SPAM) and the robots.txt policies of target websites.
