import unittest
import os
import sys

SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from modules.discovery import DiscoverySource, LeadDiscovery


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

    def test_search_sources_include_non_bing_engines(self):
        sources = self.discovery._search_sources("USA", "denim")
        self.assertTrue(any(source.name.startswith("duckduckgo-p1-") for source in sources))
        self.assertTrue(any(source.name.startswith("yahoo-p1-") for source in sources))

    def test_search_source_pages_prioritize_bing_then_yahoo_then_duckduckgo(self):
        sources = self.discovery._search_source_pages(
            "textile importer",
            "textile-importer",
            page_depth=1,
            yahoo_depth=1,
            search_engines=["duckduckgo", "bing", "yahoo"],
        )
        self.assertEqual(
            [source.name for source in sources],
            [
                "bing-p1-textile-importer",
                "yahoo-p1-textile-importer",
                "duckduckgo-p1-textile-importer",
            ],
        )

    def test_config_can_disable_duckduckgo_search_sources(self):
        discovery = LeadDiscovery(
            limit=10,
            config={
                "discovery": {
                    "search_engines": ["bing", "yahoo"],
                    "search_queries": ['{base} importer "{market}"'],
                }
            },
        )
        sources = discovery._search_sources("USA", "denim")
        names = [source.name for source in sources]

        self.assertTrue(any(name.startswith("bing-p1-") for name in names))
        self.assertTrue(any(name.startswith("yahoo-p1-") for name in names))
        self.assertFalse(any(name.startswith("duckduckgo-p1-") for name in names))

    def test_config_search_terms_are_prioritized_before_templates(self):
        discovery = LeadDiscovery(
            limit=10,
            search_terms=["jeans private label brand"],
            config={
                "discovery": {
                    "search_queries": ['{base} vendor portal "{market}"'],
                    "noise_exclusion_suffixes": ["-dictionary"],
                    "supplier_country_exclusions": ["-Pakistan"],
                }
            },
        )
        queries = discovery._buyer_search_queries("USA", "denim")

        self.assertTrue(queries[0].startswith('jeans private label brand "United States"'))
        self.assertIn("contact email", queries[0])
        self.assertIn("-Pakistan", queries[0])
        self.assertIn("denim vendor portal", queries[1])

    def test_config_search_term_templates_override_raw_contact_queries(self):
        discovery = LeadDiscovery(
            limit=10,
            search_terms=["denim importers"],
            config={
                "discovery": {
                    "search_term_query_templates": ['{base} brand "our story" "{market}"'],
                    "search_queries": ['{base} vendor portal "{market}"'],
                    "noise_exclusion_suffixes": ["-dictionary"],
                    "supplier_country_exclusions": ["-Pakistan"],
                }
            },
        )
        queries = discovery._buyer_search_queries("USA", "denim")

        self.assertEqual(
            queries[0],
            'denim brand "our story" "United States" -Pakistan -dictionary',
        )
        self.assertNotIn("contact email", queries[0])
        self.assertIn("denim vendor portal", queries[1])

    def test_config_search_engine_runtime_overrides_defaults(self):
        discovery = LeadDiscovery(
            limit=10,
            config={
                "discovery": {
                    "search_engines": ["bing"],
                    "search_engine_runtime": {
                        "bing": {
                            "max_requests": 16,
                            "min_delay_seconds": 9,
                            "cooldown_seconds": 75,
                            "failure_threshold": 3,
                        }
                    },
                }
            },
        )
        policy = discovery._engine_runtime_policy("bing")
        state = discovery._build_engine_runtime_state()

        self.assertEqual(policy["max_requests"], 16)
        self.assertEqual(policy["min_delay_seconds"], 9)
        self.assertEqual(policy["cooldown_seconds"], 75)
        self.assertEqual(policy["failure_threshold"], 3)
        self.assertEqual(list(state.keys()), ["bing"])

    def test_config_search_directory_sources_expand_to_urls(self):
        discovery = LeadDiscovery(
            limit=10,
            config={
                "discovery": {
                    "directory_sources": {
                        "usa": [
                            {
                                "type": "yellow_pages",
                                "search": "importers",
                                "description": "Yellow Pages",
                            }
                        ]
                    }
                }
            },
        )
        sources = discovery._generate_sources_from_config("USA", "denim")

        self.assertEqual(len(sources), 1)
        self.assertIn("yellowpages.com/search", sources[0].url)
        self.assertIn("denim+importers", sources[0].url)

    def test_config_can_disable_seed_url_sources(self):
        discovery = LeadDiscovery(
            limit=10,
            config={
                "discovery": {
                    "seed_urls_enabled": False,
                    "seed_urls": {
                        "usa": {
                            "buyer_intent": ["https://example.com/suppliers"],
                        }
                    },
                    "directory_sources": {
                        "usa": [
                            {
                                "type": "thomasnet",
                                "url": "https://www.thomasnet.com/search.html?what={base_query}",
                                "selectors": ["a[href*='/profile/']"],
                            }
                        ]
                    },
                }
            },
        )
        sources = discovery._generate_sources_from_config("USA", "denim")

        self.assertEqual(len(sources), 1)
        self.assertTrue(sources[0].name.startswith("thomasnet-usa"))
        self.assertFalse(any(source.name.startswith("seed-") for source in sources))

    def test_directory_profile_candidates_keep_profile_url_for_resolution(self):
        source = DiscoverySource(
            name="kompass",
            url="https://www.kompass.com/search",
            selectors=("a[href]",),
            include_directory_links=True,
            discovery_method="directory",
            candidate_kind="directory_profile",
        )
        first = self.discovery._candidate_from_url(
            "https://www.kompass.com/c/acme/us123/",
            source,
            "USA",
            "denim",
        )
        second = self.discovery._candidate_from_url(
            "https://www.kompass.com/c/bravo/us456/",
            source,
            "USA",
            "denim",
        )

        self.assertEqual(first["url"], "https://www.kompass.com/c/acme/us123/")
        self.assertTrue(first["needs_website_resolution"])
        self.assertIsNotNone(second)

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

    def test_international_apparel_sources_combine_seed_regions(self):
        sources = self.discovery.generate_sources("International", "apparel")
        names = [source.name for source in sources]

        self.assertEqual(names[:3], [
            "seed-usa-buyer-intent-pages",
            "seed-uk-buyer-intent-pages",
            "seed-europe-buyer-intent-pages",
        ])
        self.assertGreater(len(self.discovery.seed_urls("International", "seed-uk-buyer-intent-pages")), 5)

    def test_non_apparel_sources_do_not_use_apparel_seeds_or_queries(self):
        sources = self.discovery.generate_sources("USA", "architecture projects")
        names = [source.name for source in sources]
        urls = [source.url.lower() for source in sources]
        queries = self.discovery._buyer_search_queries("USA", "architecture projects")
        query_text = " ".join(queries).lower()

        self.assertIn("yellowpages-usa-business-search", names)
        self.assertFalse(any("fashion" in name or "apparel" in name for name in names))
        self.assertTrue(any("yellowpages" in url for url in urls))
        self.assertNotIn("private label clothing", query_text)
        self.assertNotIn("wholesaler", query_text)
        self.assertIn("projects contact email", query_text)

    def test_uk_architecture_sources_include_non_bing_fallbacks(self):
        sources = self.discovery.generate_sources("UK", "architecture planning")
        names = [source.name for source in sources]
        self.assertIn("yell-uk-business-search", names)
        self.assertLess(
            names.index("yell-uk-business-search"),
            next(index for index, name in enumerate(names) if name.startswith("bing-p1-")),
        )

    def test_architecture_search_sources_limit_bing_pages(self):
        sources = self.discovery._search_sources("UK", "architecture planning")
        names = [source.name for source in sources]
        self.assertTrue(any(name.startswith("bing-p1-") for name in names))
        self.assertFalse(any(name.startswith("bing-p2-") for name in names))
        self.assertTrue(any(name.startswith("duckduckgo-p1-") for name in names))
        self.assertTrue(any(name.startswith("yahoo-p1-") for name in names))

    def test_signal_map_adds_signal_sources(self):
        signal_map = {
            "signals": [
                {
                    "signal": "fit-out-rfp",
                    "confidence": 0.9,
                    "why_now": "RFP activity indicates immediate buying intent.",
                    "queries": ["architecture UK fit out rfp"],
                    "source_urls": ["https://example.com/contact"],
                }
            ]
        }
        discovery = LeadDiscovery(limit=10, signal_map=signal_map)
        sources = discovery.generate_sources("UK", "architecture planning")
        names = [source.name for source in sources]
        self.assertIn("signal-seed-fit-out-rfp", names)
        self.assertTrue(any(name.startswith("signal-bing-p1-fit-out-rfp") for name in names))

    def test_signal_search_sources_respect_configured_engines(self):
        signal_map = {
            "signals": [
                {
                    "signal": "buyer-intent",
                    "confidence": 0.9,
                    "queries": ["denim importer USA"],
                }
            ]
        }
        discovery = LeadDiscovery(
            limit=10,
            signal_map=signal_map,
            config={"discovery": {"search_engines": ["bing", "yahoo"]}},
        )
        sources = discovery._signal_search_sources("USA", "denim")
        names = [source.name for source in sources]

        self.assertTrue(any(name.startswith("signal-bing-p1-buyer-intent") for name in names))
        self.assertTrue(any(name.startswith("signal-yahoo-p1-buyer-intent") for name in names))
        self.assertFalse(any(name.startswith("signal-duckduckgo-p1-buyer-intent") for name in names))

    def test_signal_fields_are_carried_to_candidates(self):
        signaled_source = DiscoverySource(
            name="signal-seed-test",
            url="https://example.com/contact",
            selectors=(),
            discovery_method="signal_seed",
            candidate_kind="direct_url",
            signal_detected="new-location-openings",
            signal_confidence=0.88,
            why_now="Recent expansion signal.",
        )
        candidate = self.discovery._candidate_from_url(
            "https://example.com/contact",
            signaled_source,
            "USA",
            "architecture projects",
        )
        self.assertEqual(candidate["signal_detected"], "new-location-openings")
        self.assertEqual(candidate["signal_confidence_score"], 0.88)
        self.assertEqual(candidate["why_now"], "Recent expansion signal.")

    def test_local_services_queries_focus_on_location_and_leasing(self):
        discovery = LeadDiscovery(limit=10, search_terms=["coffee shops in lahore"])
        queries = discovery._buyer_search_queries("Lahore", "coffee shops")
        query_text = " ".join(queries).lower()

        self.assertIn("for lease", query_text)
        self.assertIn("new outlet", query_text)
        self.assertNotIn("request proposal", query_text)

    def test_local_services_sources_include_pagination(self):
        discovery = LeadDiscovery(limit=10, search_terms=["coffee shops in lahore"])
        sources = discovery._search_sources("Lahore", "coffee shops")
        names = [source.name for source in sources]

        self.assertFalse(any(name.startswith("bing-p2-") for name in names))
        self.assertFalse(any(name.startswith("duckduckgo-p2-") for name in names))
        self.assertFalse(any(name.startswith("yahoo-p2-") for name in names))

    def test_local_services_sources_respect_depth_override(self):
        discovery = LeadDiscovery(limit=10, search_terms=["coffee shops in lahore"])
        sources = discovery._search_sources("Lahore", "coffee shops", depth=3)
        names = [source.name for source in sources]

        self.assertTrue(any(name.startswith("bing-p2-") for name in names))
        self.assertTrue(any(name.startswith("duckduckgo-p3-") for name in names))
        self.assertTrue(any(name.startswith("yahoo-p2-") for name in names))

    def test_discovery_respects_dynamic_blocklist_from_scoring_context(self):
        discovery = LeadDiscovery(
            limit=10,
            scoring_context={
                "blocked_domains": ["cambridge.org"],
                "blocked_host_markers": ["docs."],
            },
        )
        source = DiscoverySource(
            name="bing-p1-test",
            url="https://www.bing.com/search?q=coffee+shops",
            selectors=("a[href]",),
            discovery_method="search",
            candidate_kind="website",
        )
        self.assertFalse(discovery._is_valid_candidate_url("https://cambridge.org/dictionary/english/coffee", source))
        self.assertFalse(discovery._is_valid_candidate_url("https://docs.example.com/contact", source))


if __name__ == "__main__":
    unittest.main()
