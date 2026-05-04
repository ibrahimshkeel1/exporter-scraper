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
        self.assertLess(
            [source.name for source in sources].index("seed-usa-apparel-buyers"),
            next(
                index
                for index, source in enumerate(sources)
                if source.name.startswith("bing-p1-apparel-importer-wholesaler-distributor")
            ),
            )

    def test_united_states_alias_maps_to_usa_sources(self):
        sources = self.discovery.generate_sources("United States", "apparel")
        names = [source.name for source in sources]

        self.assertEqual(names[0], "seed-usa-buyer-intent-pages")
        self.assertIn("seed-usa-apparel-buyers", names)

    def test_denim_seed_prefers_specific_product_over_generic_apparel(self):
        self.assertEqual(self.discovery._product_seed("Apparel & Textile - Denim & Jeans"), "denim")

    def test_search_sources_skip_duckduckgo_to_avoid_vps_timeouts(self):
        sources = self.discovery._search_sources("USA", "denim")
        self.assertFalse(any(source.name.startswith("duckduckgo") for source in sources))

    def test_seed_urls_are_source_specific(self):
        buyer_intent_urls = self.discovery.seed_urls("USA", "seed-usa-buyer-intent-pages")
        generic_urls = self.discovery.seed_urls("USA", "seed-usa-apparel-buyers")

        self.assertIn("https://corporate.target.com/suppliers", buyer_intent_urls)
        self.assertIn("https://www.bedheadpjs.com/", generic_urls)
        self.assertNotIn("https://www.bedheadpjs.com/", buyer_intent_urls)

    def test_search_terms_are_prioritized(self):
        discovery = LeadDiscovery(limit=10, search_terms=["socks importer USA"])
        queries = discovery._buyer_search_queries("USA", "apparel")

        self.assertTrue(queries[0].startswith("socks importer USA"))

    def test_uk_sources_include_curated_seeds_before_search(self):
        sources = self.discovery.generate_sources("UK", "denim")
        names = [source.name for source in sources]

        self.assertEqual(names[0], "seed-uk-buyer-intent-pages")
        self.assertEqual(names[1], "seed-uk-apparel-buyers")
        self.assertLess(names.index("seed-uk-apparel-buyers"), names.index("yell-buyer-search"))
        self.assertGreater(len(self.discovery.seed_urls("UK", "seed-uk-apparel-buyers")), 10)

    def test_europe_sources_include_buyer_intent_seeds(self):
        sources = self.discovery.generate_sources("Europe", "apparel")

        self.assertEqual(sources[0].name, "seed-europe-buyer-intent-pages")
        self.assertGreater(len(self.discovery.seed_urls("Europe", "seed-europe-buyer-intent-pages")), 10)

    def test_international_sources_combine_seed_regions(self):
        sources = self.discovery.generate_sources("International", "web design agencies")
        names = [source.name for source in sources]

        self.assertEqual(names[:3], [
            "seed-usa-buyer-intent-pages",
            "seed-uk-buyer-intent-pages",
            "seed-europe-buyer-intent-pages",
        ])
        self.assertGreater(len(self.discovery.seed_urls("International", "seed-uk-buyer-intent-pages")), 5)


if __name__ == "__main__":
    unittest.main()
