import os
import sys
import unittest
from tempfile import TemporaryDirectory
from types import SimpleNamespace


SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from main import (
    apply_job_config,
    apply_recent_dedupe,
    compute_discovery_limit,
    load_recent_domains,
    relaxed_score_thresholds,
    save_recent_domains,
)


class MainConfigTests(unittest.TestCase):
    def _base_args(self):
        return SimpleNamespace(
            region="USA",
            industry="apparel",
            limit=10,
            min_score=75,
            output="buyer_leads.csv",
            audit_output=None,
            format="csv",
            test_mode=False,
            max_analyzed=None,
            search_terms=[],
            hunt_first_a_plus=False,
            hunt_max_analyzed=150,
            a_plus_score=85,
            allow_no_email=False,
            allow_weak_buyer_evidence=False,
            fill_until_complete=False,
            status_output=None,
            job_id=None,
            scoring_context=None,
        )

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

    def test_apply_job_config_reads_fill_until_complete_and_string_bools(self):
        args = self._base_args()
        configured = apply_job_config(
            args,
            {
                "lead_pack": {"fill_until_complete": "true"},
                "quality": {
                    "allow_no_email": "false",
                    "allow_weak_buyer_evidence": "1",
                },
            },
        )

        self.assertTrue(configured.fill_until_complete)
        self.assertFalse(configured.allow_no_email)
        self.assertTrue(configured.allow_weak_buyer_evidence)

    def test_recent_domain_memory_roundtrip(self):
        with TemporaryDirectory() as tmp_dir:
            memory_path = os.path.join(tmp_dir, "recent_domains.json")
            saved = save_recent_domains(
                memory_path,
                existing_domains=["alpha.com", "www.beta.com"],
                new_domains=["beta.com", "gamma.com", "www.alpha.com"],
                max_items=500,
            )
            loaded = load_recent_domains(memory_path, max_items=500)

        self.assertEqual(saved, ["beta.com", "gamma.com", "alpha.com"])
        self.assertEqual(loaded, ["beta.com", "gamma.com", "alpha.com"])

    def test_apply_recent_dedupe_drops_seen_domains(self):
        class DummyScoring:
            @staticmethod
            def rank_and_filter(candidates, limit, min_score):
                return list(candidates)[:limit]

        scored_candidates = [
            {"domain": "repeat.com", "score": 90},
            {"domain": "newco.com", "score": 89},
            {"domain": "fresh.com", "score": 88},
        ]
        filtered, dropped = apply_recent_dedupe(
            scoring=DummyScoring(),
            scored_candidates=scored_candidates,
            min_score=70,
            limit=2,
            recent_domains=["repeat.com"],
        )

        self.assertEqual(dropped, 1)
        self.assertEqual([lead["domain"] for lead in filtered], ["newco.com", "fresh.com"])


if __name__ == "__main__":
    unittest.main()
