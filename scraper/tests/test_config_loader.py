import os
import sys
import unittest
from tempfile import TemporaryDirectory
from textwrap import dedent
from unittest.mock import patch


SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from modules.config_loader import ConfigLoader


LOCAL_YAML = dedent(
    """
    slug: textile-apparel
    display_name: Local textile
    version: 1
    triggers:
      keywords:
        - textile
    discovery:
      search_queries:
        - textile importer USA
      seed_urls:
        usa:
          buyer_intent: []
      exclusions:
        host_parts: []
    scoring:
      weights:
        buyer_intent: 1
      keywords:
        product_keywords:
          - textile
        strong_buyer_keywords:
          - buyer
        negative_keywords: []
      tiers:
        a_plus:
          min_score: 85
    signals:
      cluster: local-textile
      signal_catalog: []
    """
).strip()

REMOTE_YAML = dedent(
    """
    slug: textile-apparel
    display_name: Remote textile
    version: 1
    triggers:
      keywords:
        - textile
    discovery:
      search_queries:
        - textile importer USA
      seed_urls:
        usa:
          buyer_intent: []
      exclusions:
        host_parts: []
    scoring:
      weights:
        buyer_intent: 1
      keywords:
        product_keywords:
          - textile
        strong_buyer_keywords:
          - buyer
        negative_keywords: []
      tiers:
        a_plus:
          min_score: 85
    signals:
      cluster: remote-textile
      signal_catalog: []
    """
).strip()


class StubbedConfigLoader(ConfigLoader):
    def _download_remote_manifest(self):
        return {"configs": {"textile-apparel": {"yaml": REMOTE_YAML}}}

    def _build_local_manifest(self):
        return {"configs": {"textile-apparel": {"yaml": LOCAL_YAML}}}


class ConfigLoaderTests(unittest.TestCase):
    def test_local_manifest_wins_by_default(self):
        with TemporaryDirectory() as tmp_dir:
            with patch.dict(os.environ, {"EXPORTFLOW_CONFIG_REMOTE_FIRST": ""}, clear=False):
                loader = StubbedConfigLoader(config_dir=tmp_dir)

        self.assertEqual(loader._source, "local")
        self.assertEqual(loader.configs["textile-apparel"]["display_name"], "Local textile")


if __name__ == "__main__":
    unittest.main()
