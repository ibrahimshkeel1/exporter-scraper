# ExportFlow Gmail N8N Automation

## Decision
Use Google OAuth + Gmail API for outreach automation instead of asking clients for SMTP credentials.

Clients will connect Gmail from the website with a `Connect Gmail` button. They will not give ExportFlow their Gmail password or app password.

## Core Flow
1. User logs into ExportFlow.
2. User opens the Outreach page.
3. User connects Gmail through Google OAuth.
4. Website stores the Google refresh token securely.
5. User enters business plan, offer, target buyer, tone, CTA, and signature.
6. Gemini creates outreach templates and sample personalized emails.
7. User approves the template and samples.
8. Website triggers a separate n8n outreach workflow.
9. n8n personalizes each lead email with Gemini.
10. n8n sends email through the Gmail API using the user's connected Gmail account.
11. Supabase stores campaign status, sent emails, follow-up state, failures, and totals.

## N8N Role
n8n is the automation brain.

It should use HTTP Request nodes to call:
- Supabase for campaign, lead, and status data.
- Gemini for personalization.
- Gmail API for sending emails.

Do not use the existing scraper n8n workflow. Outreach must be a separate workflow.

## Gmail Access
Use this scope first:

```text
https://www.googleapis.com/auth/gmail.send
```

This allows sending emails from the user's Gmail account without reading their mailbox.

Reply tracking should be added later because reading Gmail requires broader scopes such as Gmail metadata or readonly access, which creates more Google verification work.

## Website Requirements
Add an Outreach page where the user can:
- Connect Gmail.
- Enter business plan and email instructions.
- Pick tone such as bold, convincing, warm, premium, direct, or professional.
- Review Gemini-generated templates and sample personalized emails.
- Approve and launch the campaign.
- Track each lead as drafted, queued, sent, follow-up pending, follow-up sent, failed, or replied later.

## Test Mode
Before real sending is enabled, force all outbound emails to:

```text
ibrahimshkeel1@gmail.com
```

The real lead email should be stored and shown inside the test email body, but it must not be used as the recipient in test mode.

## Stats
Track and display:
- Total scraped emails per user.
- Total outreach emails sent per user.
- Global total scraped emails on the homepage.
- Global total outreach emails sent on the homepage.

## Notes
SMTP credentials are not the recommended path for Gmail users.

For v1, use Gmail sending only. Add non-Gmail providers later with either SMTP or provider-specific OAuth.
