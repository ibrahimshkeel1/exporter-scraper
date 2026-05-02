import unittest
import os
import sys

SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from modules.enrichment import LeadEnrichment


class LeadEnrichmentTests(unittest.TestCase):
    def setUp(self):
        self.enrichment = LeadEnrichment(concurrency=1)

    def test_extract_data_finds_emails_socials_and_contact_pages(self):
        html = """
        <html>
            <body>
                <a href="/contact-us">Contact</a>
                <a href="https://www.linkedin.com/company/sample-brand">LinkedIn</a>
                <a href="https://www.instagram.com/samplebrand">Instagram</a>
                <form action="/contact-submit">
                    <input name="email">
                    <textarea name="message"></textarea>
                </form>
                <form action="/cart/add">
                    <input name="quantity">
                </form>
                Reach us at info@samplebrand.com and careers@samplebrand.com.
                Ignore me: noreply@samplebrand.com
            </body>
        </html>
        """
        emails, socials, text, contact_pages, contact_forms = self.enrichment.extract_data(
            html, "https://samplebrand.com"
        )
        self.assertIn("info@samplebrand.com", emails)
        self.assertIn("careers@samplebrand.com", emails)
        self.assertNotIn("noreply@samplebrand.com", emails)
        self.assertTrue(any("linkedin.com" in url for url in socials))
        self.assertIn("https://samplebrand.com/contact-us", contact_pages)
        self.assertIn("https://samplebrand.com/contact-submit", contact_forms)
        self.assertNotIn("https://samplebrand.com/cart/add", contact_forms)
        self.assertIn("reach us at", text)

    def test_email_quality_classification(self):
        quality, high_quality = self.enrichment.classify_email_quality(
            ["sales@samplebrand.com", "info@samplebrand.com"],
            "samplebrand.com",
        )
        self.assertEqual(quality, "decision")
        self.assertIn("sales@samplebrand.com", high_quality)

    def test_filter_emails_keeps_candidate_owned_and_rejects_junk(self):
        accepted, rejected = self.enrichment.filter_emails_for_candidate(
            [
                "sales@samplebrand.com",
                "careers@samplebrand.com",
                "team@agency-site.com",
                "info@mysite.com",
                "samplebrand@gmail.com",
            ],
            "samplebrand.com",
        )
        self.assertIn("sales@samplebrand.com", accepted)
        self.assertIn("samplebrand@gmail.com", accepted)
        self.assertIn("careers@samplebrand.com", rejected)
        self.assertIn("team@agency-site.com", rejected)
        self.assertIn("info@mysite.com", rejected)


if __name__ == "__main__":
    unittest.main()
