import os
import sys
import unittest
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from pathlib import Path

import yaml

SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from main import (
    apply_job_config,
    apply_recent_domain_suppression,
    apply_recent_dedupe,
    build_lead_pack,
    compute_discovery_limit,
    load_recent_domains,
    pad_lead_pack_with_repeats,
    relaxed_score_thresholds,
    resolve_proxy_pool,
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
            proxy_pool=[],
            proxy_file=None,
        )

    def test_max_analyzed_caps_normal_discovery(self):
        self.assertEqual(compute_discovery_limit(limit=10, max_analyzed=25), 25)

    def test_max_analyzed_never_drops_below_requested_limit(self):
        self.assertEqual(compute_discovery_limit(limit=10, max_analyzed=5), 10)

    def test_test_mode_respects_smaller_explicit_cap(self):
        self.assertEqual(compute_discovery_limit(limit=1, test_mode=True, max_analyzed=8), 8)

    def test_explicit_cap_is_not_reduced_by_test_mode(self):
        self.assertEqual(compute_discovery_limit(limit=10, test_mode=True, max_analyzed=900), 900)

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

    def test_apply_job_config_reads_network_proxy_settings(self):
        args = self._base_args()
        configured = apply_job_config(
            args,
            {
                "network": {
                    "proxy_pool": ["http://user:pass@127.0.0.1:8080", "socks5://10.0.0.2:1080"],
                    "proxy_file": "/tmp/proxies.txt",
                }
            },
        )
        self.assertEqual(configured.proxy_pool, ["http://user:pass@127.0.0.1:8080", "socks5://10.0.0.2:1080"])
        self.assertEqual(configured.proxy_file, "/tmp/proxies.txt")

    def test_resolve_proxy_pool_merges_inline_and_file_entries(self):
        with TemporaryDirectory() as tmp_dir:
            proxy_file = os.path.join(tmp_dir, "proxies.txt")
            with open(proxy_file, "w", encoding="utf-8") as handle:
                handle.write("# list\n")
                handle.write("http://2.2.2.2:8080\n")
                handle.write("socks5://3.3.3.3:1080\n")
            proxies = resolve_proxy_pool(
                proxy_pool=["http://1.1.1.1:8080", "invalid-entry"],
                proxy_file=proxy_file,
            )
        self.assertEqual(
            [row["raw"] for row in proxies],
            ["http://1.1.1.1:8080", "http://2.2.2.2:8080", "socks5://3.3.3.3:1080"],
        )

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

    def test_apply_recent_domain_suppression_can_restore_for_target(self):
        leads = [
            {"domain": "repeat.com", "score": 90},
            {"domain": "newco.com", "score": 89},
        ]
        filtered, dropped, restored = apply_recent_domain_suppression(
            leads=leads,
            recent_domains=["repeat.com"],
            limit=2,
            preserve_target=True,
        )
        self.assertEqual(dropped, 1)
        self.assertEqual(restored, 1)
        self.assertEqual(len(filtered), 2)

    def test_pad_lead_pack_with_repeats_reaches_limit(self):
        leads, repeated = pad_lead_pack_with_repeats([{"domain": "alpha.com"}], limit=3)
        self.assertEqual(repeated, 2)
        self.assertEqual(len(leads), 3)
        self.assertEqual(leads[1]["pack_fill_stage"], "repeat_backfill")

    def test_build_lead_pack_uses_backfill_when_quality_is_short(self):
        class DummyScoring:
            @staticmethod
            def rank_and_filter(candidates, limit, min_score):
                return []

        scored_candidates = [
            {"domain": "alpha.com", "score": 52, "passes_hard_checks": True, "fetch_ok": True, "noisy_domain_hits": 0},
            {"domain": "beta.com", "score": 48, "passes_hard_checks": False, "fetch_ok": True, "noisy_domain_hits": 0},
        ]
        leads, effective_min_score, events = build_lead_pack(
            scoring=DummyScoring(),
            scored_candidates=scored_candidates,
            limit=2,
            min_score=75,
            fill_until_complete=True,
        )
        self.assertEqual(effective_min_score, 75)
        self.assertEqual(len(leads), 2)
        self.assertTrue(any(event[0] in {"hard_check_backfill", "exploratory_backfill", "forced_backfill"} for event in events))

    def test_build_lead_pack_conservative_mode_does_not_backfill_tuning_runs(self):
        class DummyScoring:
            @staticmethod
            def rank_and_filter(candidates, limit, min_score):
                return []

        scored_candidates = [
            {"domain": "alpha.com", "score": 52, "passes_hard_checks": True, "fetch_ok": True, "noisy_domain_hits": 0},
        ]
        leads, _, events = build_lead_pack(
            scoring=DummyScoring(),
            scored_candidates=scored_candidates,
            limit=2,
            min_score=75,
            fill_until_complete=False,
            backfill_mode="conservative",
        )

        self.assertEqual(leads, [])
        self.assertEqual(events, [("strict", 75, 0)])

    def test_build_lead_pack_conservative_mode_only_uses_hard_check_backfill(self):
        class DummyScoring:
            @staticmethod
            def rank_and_filter(candidates, limit, min_score):
                return []

        scored_candidates = [
            {"domain": "alpha.com", "score": 62, "passes_hard_checks": True, "fetch_ok": True, "noisy_domain_hits": 0},
            {"domain": "beta.com", "score": 58, "passes_hard_checks": False, "fetch_ok": True, "noisy_domain_hits": 0},
        ]
        leads, _, events = build_lead_pack(
            scoring=DummyScoring(),
            scored_candidates=scored_candidates,
            limit=2,
            min_score=75,
            fill_until_complete=True,
            backfill_mode="conservative",
        )

        self.assertEqual([lead["domain"] for lead in leads], ["alpha.com"])
        self.assertTrue(any(event[0] == "hard_check_backfill" for event in events))
        self.assertFalse(any(event[0] in {"exploratory_backfill", "forced_backfill"} for event in events))

    def test_textile_config_does_not_enable_duckduckgo(self):
        config_path = Path(SCRAPER_DIR) / "configs" / "textile-apparel.yml"
        with config_path.open("r", encoding="utf-8") as handle:
            config = yaml.safe_load(handle)

        discovery = config.get("discovery", {})
        self.assertEqual(discovery.get("search_engines"), ["bing", "yahoo"])
        self.assertNotIn("duckduckgo.", discovery.get("exclusions", {}).get("host_parts", []))


if __name__ == "__main__":
    unittest.main()
