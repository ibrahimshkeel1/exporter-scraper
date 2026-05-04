import os
import sys
import unittest


SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from main import compute_discovery_limit, relaxed_score_thresholds


class MainConfigTests(unittest.TestCase):
    def test_max_analyzed_caps_normal_discovery(self):
        self.assertEqual(compute_discovery_limit(limit=10, max_analyzed=25), 25)

    def test_max_analyzed_never_drops_below_requested_limit(self):
        self.assertEqual(compute_discovery_limit(limit=10, max_analyzed=5), 10)

    def test_test_mode_respects_smaller_explicit_cap(self):
        self.assertEqual(compute_discovery_limit(limit=1, test_mode=True, max_analyzed=8), 8)

    def test_default_limits_are_preserved_without_explicit_cap(self):
        self.assertEqual(compute_discovery_limit(limit=10, test_mode=True), 120)
        self.assertEqual(compute_discovery_limit(limit=10), 3000)

    def test_relaxed_thresholds_step_down_toward_floor(self):
        self.assertEqual(relaxed_score_thresholds(55), [55, 50, 45, 40, 35])
        self.assertEqual(relaxed_score_thresholds(30), [35])


if __name__ == "__main__":
    unittest.main()
