import csv
import json
from datetime import datetime

class LeadExport:
    def __init__(self, output_file="leads.csv"):
        self.output_file = output_file
        self.headers = [
            "company_name", "country", "website", "linkedin_url", 
            "social_urls", "emails", "source", "score", "tier", 
            "qualification_reasons", "scraped_at"
        ]

    def _format_lead(self, lead, country):
        return {
            "company_name": lead.get('domain', 'Unknown').split('.')[0].title(),
            "country": country,
            "website": lead.get('url', ''),
            "linkedin_url": lead.get('linkedin_url', ''),
            "social_urls": ", ".join(lead.get('social_urls', [])),
            "emails": ", ".join(lead.get('emails', [])),
            "source": lead.get('source_query', ''),
            "score": lead.get('score', 0),
            "tier": lead.get('tier', 'C'),
            "qualification_reasons": lead.get('qualification_reasons', ''),
            "scraped_at": datetime.now().isoformat()
        }

    def save_to_csv(self, leads, country):
        """Saves leads to a CSV file."""
        if not leads:
            print("No leads to save.")
            return

        formatted_leads = [self._format_lead(lead, country) for lead in leads]

        with open(self.output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=self.headers)
            writer.writeheader()
            writer.writerows(formatted_leads)
            
        print(f"Saved {len(leads)} leads to {self.output_file}")
