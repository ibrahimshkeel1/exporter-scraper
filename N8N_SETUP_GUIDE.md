# n8n Workflows Setup Guide

## Overview
Two complete n8n workflows ready to import:
1. **Lead Generation Workflow** - Form → Admin Approval → Python Scraper → Google Sheets → Email
2. **Outreach & Tracking Workflow** - Scheduled → Read Sheet → Filter Pending → Send Email → Wait 3 Days → Check Replies → Follow-up

---

## Import Instructions

### Step 1: Open n8n
- Go to your n8n instance (e.g., `http://your-vps-ip:5678`)
- Navigate to **Workflows** → **Create Workflow** (or **Import from File**)

### Step 2: Import Lead Generation Workflow
1. Click **Import** → Select `n8n_lead_generation_workflow.json`
2. Review the nodes and connections
3. Save as "ExportFlow - Lead Generation"

### Step 3: Import Outreach Workflow
1. Click **Import** → Select `n8n_outreach_tracking_workflow.json`
2. Review the nodes and connections
3. Save as "ExportFlow - Outreach & Tracking"

---

## Required Configuration

### Credentials to Set Up

#### 1. **Telegram API**
- **Provider**: Telegram Bot API
- **Get Bot Token**: [BotFather on Telegram](https://t.me/botfather)
- **In n8n**: 
  - Add credential: `Telegram`
  - Paste your Bot Token
  - Name it: `telegram_api`

#### 2. **Google Sheets Service Account**
- **Setup**: Create Service Account in Google Cloud Console
  - Project: ExportFlow
  - Download JSON key file
- **In n8n**:
  - Add credential: `Google Sheets`
  - Upload the service account JSON
  - Name it: `google_sheets_service_account`
- **Share your sheets** with the service account email

#### 3. **SMTP Credentials** (for sending emails)
- **Provider**: Gmail, SendGrid, or your email server
- **In n8n**:
  - Add credential: `SMTP`
  - Enter host, port, username, password
  - Name it: `smtp_credentials`

#### 4. **IMAP Credentials** (for checking replies)
- **Provider**: Gmail, Outlook, or your email server
- **In n8n**:
  - Add credential: `IMAP`
  - Enter host, port, username, password
  - Name it: `imap_credentials`

---

## Workflow 1: Lead Generation

### Configuration Steps

1. **Webhook Node**
   - Path: `lead-generation` (publicly exposed)
   - Your webhook URL: `https://your-vps-ip:5678/webhook/lead-generation`

2. **Telegram - Send Approval Request**
   - Set your **Telegram Chat ID** for admin notifications
   - Keep the message template or customize

3. **If - Approved Node**
   - Condition: `$json.approved` equals `true`
   - This filters approved requests only

4. **Execute - Python Scraper**
   - Adjust command path if needed:
     ```
     python scraper/main.py --region {{ $json.region }} --limit {{ $json.limit }} --output /tmp/leads.csv
     ```
   - Ensure Python and dependencies are installed on the n8n server

5. **Google Sheets - Append Data**
   - Create a spreadsheet and share it with service account
   - Update `spreadsheetId` in the node
   - Sheet name should be `Sheet1`

6. **Send Email - Leads Ready**
   - From email: `noreply@exportflow.io` (configure in SMTP)
   - Template uses client email from webhook data

### Expected Webhook Payload
```json
{
  "industry": "Clothing Brands",
  "region": "USA",
  "limit": 500,
  "clientEmail": "buyer@company.com",
  "clientName": "John Doe",
  "telegramChatId": "123456789",
  "approved": true,
  "googleSheetId": "your-sheet-id"
}
```

---

## Workflow 2: Outreach & Tracking

### Configuration Steps

1. **Schedule - Every Hour**
   - Runs automatically every hour
   - Adjust timing: Change `unit` to `minutes`, `hours`, `days`

2. **Google Sheets - Read Pending Leads**
   - Update `spreadsheetId`
   - Expected columns:
     - A: Contact Name
     - B: Company Name
     - C: Email
     - D: Proof Link (product sample)
     - E: Calendly Link
     - F: Status (pending/sent/replied/followup_sent)
     - G: Row number

3. **Filter - Only Pending**
   - Filters rows where `status = "pending"`
   - Adjust the condition if column name is different

4. **Send Email - Outreach**
   - From: `outreach@exportflow.io`
   - Subject and body use lead data from sheet
   - Customize template as needed

5. **Wait - 3 Days**
   - Set to 72 hours (can adjust to 24, 48 hours, etc.)

6. **Check Email - Look For Replies**
   - Mailbox: `outreach@exportflow.io`
   - Looks for new emails from contacts

7. **If - Reply Received**
   - Condition: Email sender matches lead email
   - Yes path: Update sheet to "replied"
   - No path: Send follow-up email

---

## Environment Variables

Create these on your n8n server (`.env` or system):

```
TELEGRAM_BOT_TOKEN=your-bot-token
GOOGLE_SHEETS_KEY_FILE=/path/to/service-account.json
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=outreach@exportflow.io
SMTP_PASS=your-app-password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=outreach@exportflow.io
IMAP_PASS=your-app-password
```

---

## Activation & Testing

### Test Lead Generation
1. Send POST request to webhook:
```bash
curl -X POST https://your-vps-ip:5678/webhook/lead-generation \
  -H "Content-Type: application/json" \
  -d '{
    "industry": "Clothing",
    "region": "USA",
    "limit": 100,
    "clientEmail": "test@test.com",
    "approved": true
  }'
```

2. Check Telegram for approval message
3. Verify scraper runs and data appends to Google Sheet

### Test Outreach Workflow
1. Ensure Google Sheet has sample data with `status = "pending"`
2. Manually trigger the workflow
3. Check emails sent
4. Verify sheet updates with `status = "sent"`

---

## Troubleshooting

### Webhook not receiving data
- Check firewall/VPS security groups (port 5678)
- Verify `responseMode: "onReceived"` in Webhook node
- Check n8n logs: `pm2 logs n8n`

### Google Sheets not updating
- Verify service account has edit access
- Check spreadsheet ID format
- Ensure sheet names match (`Sheet1`, `Outreach`)

### Emails not sending
- Test SMTP credentials separately
- Check `From` email is verified in your email provider
- Gmail: Use [App Passwords](https://support.google.com/accounts/answer/185833)

### Python scraper not executing
- Ensure `scrapers/main.py` path is correct
- Check Python is in PATH: `which python`
- Verify dependencies: `pip install -r scraper/requirements.txt`

---

## Next Steps

1. Deploy both workflows to production
2. Configure cron jobs for periodic maintenance
3. Set up Telegram alerts for failures
4. Monitor conversion rates and adjust follow-up timing
5. Add webhook error handling and retries
