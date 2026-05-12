import os
import sys
import unittest
from pathlib import Path

import yaml


SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from modules.signal_map import build_signal_map


class SignalMapTests(unittest.TestCase):
    def test_architecture_signal_map_contains_five_signals(self):
        signal_map = build_signal_map(
            region="UK",
            industry="Architecture & Planning",
            search_terms=["retail expansion"],
        )
        self.assertEqual(signal_map["cluster"], "local_services_expansion")
        self.assertEqual(len(signal_map["signals"]), 5)
        self.assertGreaterEqual(len(signal_map["routed_search_terms"]), 6)

    def test_scoring_context_is_generated(self):
        signal_map = build_signal_map(
            region="International",
            industry="industrial architecture projects",
            search_terms=[],
        )
        context = signal_map["scoring_context"]
        self.assertTrue(context["product_keywords"])
        self.assertIn("expansion", context["buyer_keywords"])
        self.assertIn("github.com", context["blocked_domains"])
        self.assertIn(".edu", context["blocked_tlds"])

    def test_textile_config_signal_queries_use_product_base(self):
        config_path = Path(SCRAPER_DIR) / "configs" / "textile-apparel.yml"
        with config_path.open("r", encoding="utf-8") as handle:
            config = yaml.safe_load(handle)

        signal_map = build_signal_map(
            region="USA",
            industry="textile apparel denim importers",
            search_terms=["denim importers"],
            config=config,
        )

        first_queries = signal_map["signals"][0]["queries"]
        self.assertIn('denim brand "our story" "United States"', first_queries)
        self.assertFalse(any("textile apparel denim importers" in query for query in first_queries))


if __name__ == "__main__":
    unittest.main()
