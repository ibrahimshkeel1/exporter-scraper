import unittest
import os
import sys

SCRAPER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

from modules.scoring import LeadScoring


class LeadScoringTests(unittest.TestCase):
    def setUp(self):
        self.scoring = LeadScoring()

    def test_strong_candidate_scores_high(self):
        candidate = {
            "domain": "samplebrand.com",
            "url": "https://samplebrand.com",
            "content": (
                "Clothing brand focused on wholesale sourcing and private label trade. "
                "Shop catalog and checkout available."
            ),
            "emails": ["sales@samplebrand.com"],
            "high_quality_emails": ["sales@samplebrand.com"],
            "email_quality": "decision",
            "social_urls": ["https://linkedin.com/company/samplebrand"],
            "linkedin_url": "https://linkedin.com/company/samplebrand",
            "fetch_ok": True,
            "fetch_status_codes": [200, 200, 200],
            "crawled_pages": [
                "https://samplebrand.com",
                "https://samplebrand.com/wholesale",
                "https://samplebrand.com/contact",
            ],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertGreaterEqual(scored["score"], 80)
        self.assertEqual(scored["tier"], "A")
        self.assertTrue(scored["qualified"])
        self.assertTrue(scored["passes_hard_checks"])
        self.assertEqual(scored["buyer_type"], "wholesaler")
        self.assertEqual(scored["contact_route"], "decision_email")
        self.assertEqual(scored["outreach_contact"], "sales@samplebrand.com")
        self.assertIn("score_breakdown", scored)

    def test_negative_signals_apply_penalty(self):
        candidate = {
            "content": "We are hiring for internship and recruitment roles.",
            "emails": [],
            "high_quality_emails": [],
            "social_urls": [],
            "linkedin_url": None,
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertLess(scored["score"], 20)
        self.assertEqual(scored["tier"], "C")
        self.assertFalse(scored["qualified"])

    def test_known_false_positive_domain_is_disqualified(self):
        candidate = {
            "domain": "cloudflare.com",
            "url": "https://cloudflare.com",
            "content": "Apparel wholesale platform with contact information.",
            "emails": ["sales@cloudflare.com"],
            "high_quality_emails": ["sales@cloudflare.com"],
            "email_quality": "decision",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200],
            "crawled_pages": ["https://cloudflare.com"],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertFalse(scored["qualified"])
        self.assertIn("known false-positive domain", scored["disqualification_reasons"])

    def test_rank_marks_below_threshold_as_not_export_eligible(self):
        candidate = {
            "domain": "samplebrand.com",
            "url": "https://samplebrand.com",
            "content": "Clothing wholesale trade brand with procurement sourcing contact.",
            "emails": ["info@samplebrand.com"],
            "high_quality_emails": [],
            "email_quality": "business",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200],
            "crawled_pages": ["https://samplebrand.com"],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertTrue(scored["passes_hard_checks"])
        results = self.scoring.rank_and_filter([scored], limit=10, min_score=95)
        self.assertEqual(results, [])
        self.assertFalse(scored["qualified"])
        self.assertFalse(scored["export_eligible"])
        self.assertIn("below minimum score threshold", scored["disqualification_reasons"])

    def test_supplier_country_domain_is_disqualified_for_buyer_leads(self):
        candidate = {
            "domain": "factory.com.pk",
            "url": "https://factory.com.pk",
            "content": "Apparel wholesale purchasing clothing catalog.",
            "emails": ["sales@factory.com.pk"],
            "high_quality_emails": ["sales@factory.com.pk"],
            "email_quality": "decision",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200],
            "crawled_pages": ["https://factory.com.pk"],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertFalse(scored["qualified"])
        self.assertIn("supplier-country domain", scored["disqualification_reasons"])

    def test_supplier_country_domain_is_allowed_for_local_market_jobs(self):
        candidate = {
            "domain": "factory.com.pk",
            "region": "Lahore",
            "url": "https://factory.com.pk",
            "content": "Coffee shop expansion branch opening with contact details.",
            "emails": ["info@factory.com.pk"],
            "high_quality_emails": ["info@factory.com.pk"],
            "email_quality": "business",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200],
            "crawled_pages": ["https://factory.com.pk"],
        }
        scoring = LeadScoring(
            require_email=False,
            require_buyer_evidence=False,
            scoring_context={
                "product_keywords": ["coffee shop", "cafe", "espresso"],
                "buyer_keywords": ["branch opening", "expansion", "new outlet"],
            },
            industry="coffee shops",
        )
        scored = scoring.evaluate_candidate(candidate)
        self.assertNotIn("supplier-country domain", scored["disqualification_reasons"])

    def test_blocked_domain_marker_from_context_disqualifies_noise_site(self):
        scoring = LeadScoring(
            require_email=False,
            require_buyer_evidence=False,
            scoring_context={
                "blocked_host_markers": ["dictionary."],
            },
        )
        candidate = {
            "domain": "dictionary.example.com",
            "url": "https://dictionary.example.com",
            "content": "Coffee definition and example sentence.",
            "emails": [],
            "high_quality_emails": [],
            "email_quality": "none",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200],
            "crawled_pages": ["https://dictionary.example.com"],
        }
        scored = scoring.evaluate_candidate(candidate)
        self.assertIn("blocked noisy domain class", scored["disqualification_reasons"])

    def test_failed_followup_paths_do_not_create_buyer_evidence(self):
        candidate = {
            "domain": "samplebrand.com",
            "url": "https://samplebrand.com",
            "content": "Clothing homepage only.",
            "emails": ["info@samplebrand.com"],
            "high_quality_emails": [],
            "email_quality": "business",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200, 404],
            "crawled_pages": [
                "https://samplebrand.com",
                "https://samplebrand.com/become-a-vendor",
            ],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertFalse(scored["passes_hard_checks"])
        self.assertNotIn("become a vendor", scored["buyer_evidence"])

    def test_generated_successful_followup_paths_do_not_create_buyer_evidence(self):
        candidate = {
            "domain": "samplebrand.com",
            "url": "https://samplebrand.com",
            "content": "Clothing homepage only.",
            "emails": ["info@samplebrand.com"],
            "high_quality_emails": [],
            "email_quality": "business",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200, 200],
            "crawled_pages": [
                "https://samplebrand.com",
                "https://samplebrand.com/vendor-registration",
            ],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertFalse(scored["passes_hard_checks"])
        self.assertNotIn("vendor registration", scored["buyer_evidence"])

    def test_supplier_country_location_evidence_is_disqualified(self):
        candidate = {
            "domain": "supplierbrand.com",
            "region": "USA",
            "url": "https://supplierbrand.com",
            "content": "Apparel clothing wholesale purchasing office in Karachi Pakistan.",
            "emails": ["sales@supplierbrand.com"],
            "high_quality_emails": ["sales@supplierbrand.com"],
            "email_quality": "decision",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200],
            "crawled_pages": ["https://supplierbrand.com"],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertFalse(scored["qualified"])
        self.assertIn("supplier-country location evidence", scored["disqualification_reasons"])

    def test_is_a_plus_requires_export_eligible_a_tier_and_email(self):
        candidate = {
            "export_eligible": True,
            "tier": "A",
            "score": 90,
            "email_quality": "business",
            "emails": ["info@buyer.com"],
            "buyer_side_evidence": "procurement",
            "lead_pack_status": "sellable_a_plus",
        }
        self.assertTrue(self.scoring.is_a_plus(candidate, min_score=85))

        candidate["emails"] = []
        self.assertFalse(self.scoring.is_a_plus(candidate, min_score=85))

    def test_wholesale_only_is_manual_review_not_a_plus(self):
        candidate = {
            "domain": "sleepwearbrand.com",
            "url": "https://sleepwearbrand.com",
            "content": "Sleepwear clothing wholesale account catalog retail brand.",
            "emails": ["wholesale@sleepwearbrand.com"],
            "high_quality_emails": ["wholesale@sleepwearbrand.com"],
            "email_quality": "decision",
            "social_urls": ["https://instagram.com/sleepwearbrand"],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200, 200],
            "crawled_pages": [
                "https://sleepwearbrand.com",
                "https://sleepwearbrand.com/pages/wholesale-account",
            ],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertFalse(scored["passes_hard_checks"])
        self.assertEqual(scored["lead_pack_status"], "manual_review")
        self.assertFalse(self.scoring.is_a_plus(scored))

    def test_generic_context_words_do_not_create_buyer_evidence(self):
        scoring = LeadScoring(
            scoring_context={
                "product_keywords": ["apparel"],
                "buyer_keywords": [
                    "contact",
                    "email",
                    "pricing",
                    "vendor",
                    "supplier",
                    "procurement",
                ],
            },
        )
        candidate = {
            "domain": "genericstore.com",
            "url": "https://genericstore.com",
            "content": "Apparel catalog with contact email pricing for customers and supplier notes.",
            "emails": ["info@genericstore.com"],
            "high_quality_emails": ["info@genericstore.com"],
            "email_quality": "decision",
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200, 200],
            "crawled_pages": ["https://genericstore.com", "https://genericstore.com/contact"],
        }
        scored = scoring.evaluate_candidate(candidate)

        self.assertNotIn("contact", scored["buyer_side_evidence"])
        self.assertNotIn("email", scored["buyer_side_evidence"])
        self.assertNotIn("supplier", scored["buyer_side_evidence"])
        self.assertFalse(scored["passes_hard_checks"])

    def test_supplier_application_with_decision_email_can_be_a_plus(self):
        candidate = {
            "domain": "nationalretailer.com",
            "url": "https://nationalretailer.com",
            "content": (
                "Apparel clothing supplier application for new vendors. "
                "Our purchasing and sourcing teams review textile categories. "
                "Shop collections and catalog information are available."
            ),
            "emails": ["vendor@nationalretailer.com"],
            "high_quality_emails": ["vendor@nationalretailer.com"],
            "email_quality": "decision",
            "social_urls": ["https://linkedin.com/company/nationalretailer"],
            "linkedin_url": "https://linkedin.com/company/nationalretailer",
            "fetch_ok": True,
            "fetch_status_codes": [200, 200, 200],
            "crawled_pages": [
                "https://nationalretailer.com",
                "https://nationalretailer.com/supplier-application",
                "https://nationalretailer.com/contact",
            ],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertTrue(scored["passes_hard_checks"])
        self.assertEqual(scored["lead_pack_status"], "sellable_a_plus")
        self.assertTrue(self.scoring.is_a_plus(scored))

    def test_form_only_buyer_lead_is_not_a_plus(self):
        candidate = {
            "domain": "formretailer.com",
            "url": "https://formretailer.com",
            "content": "Apparel supplier application purchasing sourcing vendor portal.",
            "emails": [],
            "high_quality_emails": [],
            "email_quality": "none",
            "contact_form_urls": ["https://formretailer.com/supplier-application"],
            "social_urls": [],
            "linkedin_url": None,
            "fetch_ok": True,
            "fetch_status_codes": [200, 200],
            "crawled_pages": [
                "https://formretailer.com",
                "https://formretailer.com/supplier-application",
            ],
        }
        scored = self.scoring.evaluate_candidate(candidate)
        self.assertEqual(scored["contact_route"], "contact_form")
        self.assertFalse(scored["passes_hard_checks"])
        self.assertFalse(self.scoring.is_a_plus(scored))

    def test_generic_scoring_context_qualifies_non_apparel_lead(self):
        scoring = LeadScoring(
            require_email=False,
            require_buyer_evidence=False,
            scoring_context={
                "product_keywords": ["dental clinic website redesign patient booking"],
                "buyer_keywords": ["dental clinic", "dentist", "appointment booking"],
                "negative_keywords": ["job board"],
            },
        )
        candidate = {
            "domain": "smileclinic.co.uk",
            "url": "https://smileclinic.co.uk",
            "content": (
                "Private dental clinic accepting new patients. "
                "Book an appointment online and contact our dentist team for cosmetic dentistry."
            ),
            "emails": [],
            "high_quality_emails": [],
            "email_quality": "none",
            "contact_form_urls": ["https://smileclinic.co.uk/contact"],
            "social_urls": ["https://linkedin.com/company/smileclinic"],
            "linkedin_url": "https://linkedin.com/company/smileclinic",
            "fetch_ok": True,
            "fetch_status_codes": [200, 200],
            "crawled_pages": ["https://smileclinic.co.uk", "https://smileclinic.co.uk/contact"],
        }

        scored = scoring.evaluate_candidate(candidate)
        results = scoring.rank_and_filter([scored], limit=10, min_score=45)

        self.assertTrue(scored["passes_hard_checks"])
        self.assertEqual(results, [scored])
        self.assertIn("dental", scored["product_evidence"])


if __name__ == "__main__":
    unittest.main()
