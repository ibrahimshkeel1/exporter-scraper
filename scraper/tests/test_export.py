import csv
import json
import os
import unittest
import sys

SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from modules.export import LeadExport


class LeadExportTests(unittest.TestCase):
    def test_save_both_writes_csv_and_json_with_source_url(self):
        lead = {
            "domain": "samplebrand.com",
            "url": "https://samplebrand.com",
            "source_name": "yellowpages-clothing",
            "source_url": "https://www.yellowpages.com/search?search_terms=sample",
            "discovery_method": "directory",
            "emails": ["info@samplebrand.com"],
            "high_quality_emails": ["info@samplebrand.com"],
            "email_quality": "high",
            "social_urls": ["https://linkedin.com/company/samplebrand"],
            "linkedin_url": "https://linkedin.com/company/samplebrand",
            "fetch_ok": True,
            "fetch_status_codes": [200, 200],
            "fetch_errors": [],
            "crawled_pages": ["https://samplebrand.com", "https://samplebrand.com/contact"],
            "score": 92,
            "tier": "A",
            "qualification_reasons": "Strong signals",
            "score_breakdown": {"icp_fit": 30},
        }

        csv_path = os.path.join(os.path.dirname(__file__), "_tmp_buyer_leads.csv")
        json_path = os.path.join(os.path.dirname(__file__), "_tmp_buyer_leads.json")
        for path in (csv_path, json_path):
            if os.path.exists(path):
                os.remove(path)

        try:
            output_file = csv_path
            exporter = LeadExport(output_file=output_file)
            exporter.save(
                [lead],
                region="USA",
                industry="clothing brands",
                run_id="run-123",
                output_format="both",
            )

            self.assertTrue(os.path.exists(csv_path))
            self.assertTrue(os.path.exists(json_path))

            with open(csv_path, newline="", encoding="utf-8") as file_handle:
                rows = list(csv.DictReader(file_handle))
            self.assertEqual(rows[0]["source_url"], lead["source_url"])
            self.assertEqual(rows[0]["run_id"], "run-123")

            with open(json_path, encoding="utf-8") as file_handle:
                json_rows = json.load(file_handle)
            self.assertEqual(json_rows[0]["source_name"], "yellowpages-clothing")
        finally:
            for path in (csv_path, json_path):
                if os.path.exists(path):
                    os.remove(path)


if __name__ == "__main__":
    unittest.main()
