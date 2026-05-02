import unittest
import os
import sys

SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from modules.discovery import LeadDiscovery


class LeadDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.discovery = LeadDiscovery(limit=10)

    def test_normalize_domain_handles_standard_and_multilevel(self):
        self.assertEqual(
            self.discovery._normalize_domain("https://www.example.com/path"),
            "example.com",
        )
        self.assertEqual(
            self.discovery._normalize_domain("https://shop.brand.co.uk/products"),
            "brand.co.uk",
        )

    def test_normalize_domain_handles_ip(self):
        self.assertEqual(
            self.discovery._normalize_domain("http://192.168.1.10:8080/home"),
            "192.168.1.10",
        )

    def test_redirect_target_is_extracted(self):
        redirect_url = (
            "https://www.yellowpages.com/redirect?"
            "url=https%3A%2F%2Fsamplebrand.com%2Fcontact&target=unknown"
        )
        cleaned = self.discovery._clean_candidate_url(redirect_url, "https://www.yellowpages.com")
        self.assertEqual(cleaned, "https://samplebrand.com/contact")

    def test_bing_base64_redirect_target_is_extracted(self):
        redirect_url = "https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9zYW1wbGVicmFuZC5jb20vY29udGFjdA"
        cleaned = self.discovery._clean_candidate_url(redirect_url, "https://www.bing.com")
        self.assertEqual(cleaned, "https://samplebrand.com/contact")

    def test_usa_discovery_rejects_supplier_country_domains(self):
        self.assertFalse(self.discovery._is_target_region_domain("supplier.com.pk", "USA"))
        self.assertFalse(self.discovery._is_target_region_domain("factory.pk", "USA"))
        self.assertTrue(self.discovery._is_target_region_domain("buyerbrand.com", "USA"))

    def test_usa_sources_prioritize_buyer_intent_before_generic_seeds(self):
        sources = self.discovery.generate_sources("USA", "apparel")
        self.assertEqual(sources[0].name, "seed-usa-buyer-intent-pages")
        self.assertLess(
            [source.name for source in sources].index("seed-usa-buyer-intent-pages"),
            [source.name for source in sources].index("seed-usa-apparel-buyers"),
        )

    def test_seed_urls_are_source_specific(self):
        buyer_intent_urls = self.discovery.seed_urls("USA", "seed-usa-buyer-intent-pages")
        generic_urls = self.discovery.seed_urls("USA", "seed-usa-apparel-buyers")

        self.assertIn("https://corporate.target.com/suppliers", buyer_intent_urls)
        self.assertIn("https://www.bedheadpjs.com/", generic_urls)
        self.assertNotIn("https://www.bedheadpjs.com/", buyer_intent_urls)


if __name__ == "__main__":
    unittest.main()
