import re


class LeadScoring:
    def __init__(self, require_email=True, require_buyer_evidence=True, scoring_context=None, industry=None):
        self.require_email = require_email
        self.require_buyer_evidence = require_buyer_evidence
        scoring_context = scoring_context or {}
        self.industry = str(industry or "").lower()
        self.weights = {
            "product_fit": 20,
            "buyer_intent": 30,
            "reachability": 20,
            "commercial_readiness": 15,
            "evidence_depth": 15,
            "negative_penalty": 45,
        }
        self.product_keywords = [
            "activewear",
            "apparel",
            "bags",
            "boutique",
            "clothing",
            "denim",
            "dress",
            "fabric",
            "fashion",
            "garment",
            "home textile",
            "hosiery",
            "knit",
            "leather",
            "shirt",
            "sportswear",
            "streetwear",
            "textile",
            "towel",
            "uniform",
            "woven",
        ]
        self.strong_buyer_keywords = [
            "become a supplier",
            "become a vendor",
            "buying office",
            "distributor",
            "import and distribute",
            "importer",
            "imports",
            "procurement",
            "purchasing",
            "sourcing",
            "supplier application",
            "supplier code",
            "supplier diversity",
            "supplier information",
            "supplier registration",
            "supplier relations",
            "supplier requirements",
            "supplier portal",
            "vendor application",
            "vendor information",
            "vendor registration",
            "vendor relations",
            "vendor portal",
            "wholesale distributor",
            "wholesaler",
        ]
        self.ambiguous_sales_keywords = [
            "brand",
            "bulk order",
            "catalog",
            "line sheet",
            "private label",
            "retail",
            "retailer",
            "stockist",
            "store locator",
            "trade",
            "trade account",
            "wholesale",
            "wholesale account",
        ]
        self.moderate_buyer_keywords = [
            "boutique",
            "brand",
            "bulk order",
            "catalog",
            "retail",
            "retailer",
            "stockist",
            "store locator",
            "trade",
            "wholesale",
        ]
        self.commercial_keywords = [
            "cart",
            "catalog",
            "checkout",
            "collection",
            "collections",
            "new arrivals",
            "order",
            "shop",
            "store",
        ]
        self.platform_keywords = [
            "advertise with us",
            "directory",
            "marketplace",
            "platform",
            "sponsored listings",
        ]
        self.supplier_competitor_keywords = [
            "apparel manufacturer",
            "clothing manufacturer",
            "contract manufacturer",
            "cut and sew",
            "factory",
            "full package production",
            "garment manufacturer",
            "manufacturer",
            "manufacturing",
            "private label manufacturer",
            "production facility",
            "sewing",
            "we manufacture",
        ]
        self.procurement_side_keywords = [
            "become a supplier",
            "become a vendor",
            "buying office",
            "importer",
            "imports",
            "procurement",
            "purchasing",
            "supplier application",
            "supplier portal",
            "vendor application",
            "vendor portal",
        ]
        self.negative_keywords = [
            "advertising",
            "article",
            "careers",
            "editorial",
            "internship",
            "issue",
            "job opening",
            "magazine",
            "news",
            "newsletter",
            "publication",
            "recruitment",
            "staffing",
            "subscribe",
            "subscription",
            "we are hiring",
        ]
        self.blocked_domains = {
            "cloudflare.com",
            "localsearch.com",
            "networkadvertising.org",
            "nike.com",
            "thryv.com",
        }
        self.blocked_domain_markers = [
            "dictionary.",
            "gitlab.",
            "huggingface.",
            "wiktionary.",
            "wikipedia.",
        ]
        self.blocked_tlds = [
            ".ac.uk",
            ".edu",
            ".gov",
            ".mil",
        ]
        self.exporter_country_suffixes = (
            ".bd",
            ".cn",
            ".com.bd",
            ".com.cn",
            ".com.hk",
            ".com.in",
            ".com.pk",
            ".com.tr",
            ".com.vn",
            ".hk",
            ".in",
            ".pk",
            ".tr",
            ".vn",
        )
        self.supplier_country_markers = [
            "bangladesh",
            "china",
            "faisalabad",
            "india",
            "karachi",
            "lahore",
            "pakistan",
            "sialkot",
            "vietnam",
        ]
        apparel_noisy_markers = [
            "apparelnews.net",
            "fashionnetwork.com",
            "fiber2fashion.com",
            "fibre2fashion.com",
            "just-style.com",
            "textileworld.com",
        ]
        generic_noisy_markers = [
            "cambridge.org",
            "dictionary.com",
            "merriam-webster.com",
            "vocabulary.com",
            "wiktionary.org",
        ]
        self.noisy_domain_markers = (
            apparel_noisy_markers + generic_noisy_markers
            if self._is_apparel_context(self.industry)
            else generic_noisy_markers
        )
        self.soft_negative_keywords = {
            "article",
            "editorial",
            "magazine",
            "news",
            "newsletter",
            "publication",
        }
        self.quality_mode = str(scoring_context.get("quality_mode", "balanced")).strip().lower() or "balanced"
        self._apply_scoring_context(scoring_context)

    @staticmethod
    def _is_apparel_context(industry):
        apparel_terms = (
            "activewear",
            "apparel",
            "clothing",
            "fashion",
            "garment",
            "streetwear",
            "textile",
        )
        text = str(industry or "").lower()
        return any(term in text for term in apparel_terms)

    @staticmethod
    def _normalize_keywords(values):
        keywords = []
        for value in values or []:
            text = str(value).lower().strip()
            if not text:
                continue
            keywords.append(text)
            keywords.extend(piece for piece in re.split(r"[^a-z0-9]+", text) if len(piece) >= 4)
        return list(dict.fromkeys(keywords))

    @staticmethod
    def _normalize_terms(values):
        terms = []
        for value in values or []:
            text = str(value).lower().strip()
            if text and text not in terms:
                terms.append(text)
        return terms

    def _apply_scoring_context(self, scoring_context):
        product_keywords = self._normalize_keywords(scoring_context.get("product_keywords", []))
        buyer_keywords = self._normalize_keywords(scoring_context.get("buyer_keywords", []))
        negative_keywords = self._normalize_keywords(scoring_context.get("negative_keywords", []))
        blocked_domains = self._normalize_terms(scoring_context.get("blocked_domains", []))
        blocked_host_markers = self._normalize_terms(scoring_context.get("blocked_host_markers", []))
        blocked_tlds = self._normalize_terms(scoring_context.get("blocked_tlds", []))

        if product_keywords:
            self.product_keywords = list(dict.fromkeys(product_keywords + self.product_keywords))
        if buyer_keywords:
            self.strong_buyer_keywords = list(dict.fromkeys(buyer_keywords + self.strong_buyer_keywords))
            self.moderate_buyer_keywords = list(dict.fromkeys(buyer_keywords + self.moderate_buyer_keywords))
        if negative_keywords:
            self.negative_keywords = list(dict.fromkeys(negative_keywords + self.negative_keywords))
        if blocked_domains:
            self.blocked_domains = set(self.blocked_domains) | set(blocked_domains)
        if blocked_host_markers:
            self.blocked_domain_markers = list(dict.fromkeys(blocked_host_markers + self.blocked_domain_markers))
        if blocked_tlds:
            self.blocked_tlds = list(dict.fromkeys(blocked_tlds + self.blocked_tlds))

    @staticmethod
    def _keyword_hits(content, keywords):
        return sorted({kw for kw in keywords if kw in content})

    @staticmethod
    def _path_text(candidate):
        # Generated follow-up probes can return SPA fallback 200s, so only use
        # user/discovery-originated URLs as path evidence. Body text carries the
        # fetched-page evidence.
        urls = [candidate.get("url", ""), candidate.get("discovery_url", "")]
        return " ".join((url or "").replace("-", " ").replace("_", " ") for url in urls).lower()

    @staticmethod
    def _normalize_domain(domain):
        value = str(domain or "").strip().lower()
        if value.startswith("www."):
            value = value[4:]
        return value

    @staticmethod
    def _region_for_buyer_filter(region):
        value = str(region or "").strip().lower()
        if value in {"usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "america", "american"}:
            return "USA"
        if value in {"uk", "u.k.", "united kingdom", "britain", "great britain", "england"}:
            return "UK"
        if value in {"eu", "europe", "european union"}:
            return "Europe"
        return str(region or "")

    def _domain_has_blocked_marker(self, domain):
        normalized = self._normalize_domain(domain)
        return any(marker in normalized for marker in self.blocked_domain_markers)

    def _buyer_type(self, strong_hits, moderate_hits):
        all_hits = " ".join(strong_hits + moderate_hits)
        if "import" in all_hits:
            return "importer"
        if "distributor" in all_hits:
            return "distributor"
        if "wholesale" in all_hits or "wholesaler" in all_hits:
            return "wholesaler"
        if "procurement" in all_hits or "purchasing" in all_hits or "sourcing" in all_hits:
            return "procurement/sourcing"
        if "private label" in all_hits:
            return "private-label brand"
        if "retail" in all_hits or "boutique" in all_hits or "stockist" in all_hits:
            return "retailer"
        if "brand" in all_hits:
            return "brand"
        return "unknown"

    @staticmethod
    def _best_evidence_url(candidate):
        crawled_pages = candidate.get("crawled_pages", [])
        status_codes = candidate.get("fetch_status_codes", [])
        priority_terms = (
            "supplier",
            "vendor",
            "procurement",
            "sourcing",
            "purchasing",
            "import",
            "distributor",
            "wholesale",
            "trade",
            "contact",
        )
        ok_pages = [
            page_url
            for page_url, status_code in zip(crawled_pages, status_codes)
            if isinstance(status_code, int) and 200 <= status_code < 300
        ]
        for term in priority_terms:
            for page_url in ok_pages:
                if term in (page_url or "").lower():
                    return page_url
        return ok_pages[0] if ok_pages else candidate.get("url", "")

    def _pitch_angle(self, buyer_type, product_hits):
        products = ", ".join(product_hits[:3]) if product_hits else "your offer"
        if buyer_type in {"importer", "distributor", "wholesaler"}:
            return f"Open with export capacity, reliable MOQ, and landed-cost advantage for {products}."
        if buyer_type == "procurement/sourcing":
            return f"Open with compliance, sampling speed, and sourcing support for {products}."
        if buyer_type == "private-label brand":
            return f"Open with private-label production, sampling, and category-specific fabric options for {products}."
        if buyer_type == "retailer":
            return f"Open with wholesale/private-label supply options for {products}."
        return f"Open with a short capability note tied to {products}."

    def _lead_pack_status(self, score, passes_hard_checks, buyer_side_hits, emails, contact_forms):
        if passes_hard_checks and buyer_side_hits and emails and score >= 85:
            return "sellable_a_plus"
        if passes_hard_checks and buyer_side_hits and (emails or contact_forms) and score >= 75:
            return "sellable_a"
        if (emails or contact_forms) and score >= 55:
            return "manual_review"
        return "reject"

    @staticmethod
    def _contact_route(emails, high_quality_emails, contact_forms, linkedin_url):
        if high_quality_emails:
            return "decision_email"
        if emails:
            return "business_email"
        if contact_forms:
            return "contact_form"
        if linkedin_url:
            return "linkedin_only"
        return "none"

    @staticmethod
    def _outreach_contact(emails, high_quality_emails, contact_forms, linkedin_url):
        if high_quality_emails:
            return high_quality_emails[0]
        if emails:
            return emails[0]
        if contact_forms:
            return contact_forms[0]
        return linkedin_url or ""

    def _lead_summary(self, domain, buyer_type, product_hits, buyer_side_hits, contact_route):
        products = ", ".join(product_hits[:3]) if product_hits else "your offer"
        if buyer_side_hits and contact_route in {"decision_email", "business_email"}:
            return f"{domain} is a contactable {buyer_type} lead for {products} with buyer-side evidence."
        if buyer_side_hits and contact_route == "contact_form":
            return f"{domain} has buyer-side evidence for {products}, but outreach is form-only."
        if buyer_side_hits:
            return f"{domain} has buyer-side evidence for {products}, but needs contact research."
        return f"{domain} needs manual review before paid-lead use."

    def _closeability_notes(self, buyer_side_hits, ambiguous_hits, contact_route, product_hits):
        product_text = ", ".join(product_hits[:3]) if product_hits else "your offer"
        if buyer_side_hits and contact_route in {"decision_email", "business_email"}:
            return (
                f"Contactable buyer-side lead. Lead has {', '.join(buyer_side_hits[:3])} "
                f"evidence and product fit around {product_text}."
            )
        if buyer_side_hits and contact_route == "contact_form":
            return (
                f"Buyer-side lead with {', '.join(buyer_side_hits[:3])} evidence and product fit "
                f"around {product_text}, but outreach is form-only."
            )
        if ambiguous_hits:
            return (
                f"Review manually. Lead has sales/wholesale signals ({', '.join(ambiguous_hits[:3])}) "
                "but buyer-side sourcing/procurement evidence is not strong enough."
            )
        return "Reject for paid pack unless manual research finds buyer-side procurement evidence."

    def evaluate_candidate(self, candidate):
        """Score a candidate for exporter usefulness, not just keyword volume."""
        reasons = []
        disqualification_reasons = []
        domain = (candidate.get("domain") or "").lower()
        normalized_region = self._region_for_buyer_filter(candidate.get("region") or "USA")
        content = (candidate.get("content") or "").lower()
        path_text = self._path_text(candidate)
        signal_text = f"{content} {path_text}"
        emails = candidate.get("emails", [])
        high_quality_emails = candidate.get("high_quality_emails", [])
        rejected_emails = candidate.get("rejected_emails", [])
        socials = candidate.get("social_urls", [])
        contact_forms = candidate.get("contact_form_urls", [])
        email_quality = candidate.get("email_quality", "none")

        product_hits = self._keyword_hits(signal_text, self.product_keywords)
        strong_buyer_hits = self._keyword_hits(signal_text, self.strong_buyer_keywords)
        ambiguous_sales_hits = self._keyword_hits(signal_text, self.ambiguous_sales_keywords)
        moderate_buyer_hits = self._keyword_hits(signal_text, self.moderate_buyer_keywords)
        commercial_hits = self._keyword_hits(signal_text, self.commercial_keywords)
        platform_hits = self._keyword_hits(signal_text, self.platform_keywords)
        supplier_competitor_hits = self._keyword_hits(
            signal_text,
            self.supplier_competitor_keywords,
        )
        procurement_side_hits = self._keyword_hits(signal_text, self.procurement_side_keywords)
        supplier_country_hits = self._keyword_hits(signal_text, self.supplier_country_markers)
        negative_hits = self._keyword_hits(signal_text, self.negative_keywords)
        soft_negative_hits = [hit for hit in negative_hits if hit in self.soft_negative_keywords]
        hard_negative_hits = [hit for hit in negative_hits if hit not in self.soft_negative_keywords]
        noisy_domain_hits = sum(
            1
            for page_url in candidate.get("crawled_pages", [])
            if any(marker in (page_url or "").lower() for marker in self.noisy_domain_markers)
        )

        if len(product_hits) >= 2:
            product_score = self.weights["product_fit"]
            reasons.append(f"Product fit strong ({', '.join(product_hits[:5])})")
        elif len(product_hits) == 1:
            product_score = 12
            reasons.append(f"Product fit moderate ({product_hits[0]})")
        else:
            product_score = 0
            disqualification_reasons.append("no primary offer/product evidence")
            reasons.append("No primary offer/product evidence")

        has_strong_buyer_evidence = bool(strong_buyer_hits)
        has_buyer_evidence = has_strong_buyer_evidence
        if len(strong_buyer_hits) >= 2:
            buyer_score = self.weights["buyer_intent"]
            reasons.append(f"Buyer evidence strong ({', '.join(strong_buyer_hits[:5])})")
        elif len(strong_buyer_hits) == 1:
            buyer_score = 24
            reasons.append(f"Buyer evidence explicit ({strong_buyer_hits[0]})")
        elif len(ambiguous_sales_hits) >= 2:
            buyer_score = 10
            reasons.append(
                f"Sales/wholesale evidence only ({', '.join(ambiguous_sales_hits[:5])})"
            )
        else:
            buyer_score = 0
            reasons.append("No buyer/importer/procurement evidence")

        if self.require_buyer_evidence and not has_buyer_evidence:
            disqualification_reasons.append("no buyer-side procurement/import/distributor/vendor evidence")

        if high_quality_emails:
            reach_score = self.weights["reachability"]
            reasons.append("Decision-oriented business email found")
        elif emails and email_quality == "business":
            reach_score = 15
            reasons.append("Generic business email found")
        elif emails and email_quality == "branded_freemail":
            reach_score = 10
            reasons.append("Branded freemail contact found")
        elif emails:
            reach_score = 8
            reasons.append("Low-confidence email found")
        elif contact_forms:
            reach_score = 7
            reasons.append("Contact form found")
        else:
            reach_score = 0
            reasons.append("No usable email found")

        if candidate.get("linkedin_url"):
            reach_score = min(self.weights["reachability"], reach_score + 2)
            reasons.append("LinkedIn profile found")

        if self.require_email and not emails:
            disqualification_reasons.append("no usable candidate-owned email")

        if len(commercial_hits) >= 3 and socials:
            commercial_score = self.weights["commercial_readiness"]
            reasons.append("Commercial activity strong")
        elif len(commercial_hits) >= 2 or socials:
            commercial_score = 9
            reasons.append("Commercial activity moderate")
        else:
            commercial_score = 0
            reasons.append("Commercial activity weak")

        crawled_ok_pages = sum(
            1
            for code in candidate.get("fetch_status_codes", [])
            if isinstance(code, int) and 200 <= code < 300
        )
        if candidate.get("fetch_ok") and crawled_ok_pages >= 3 and (strong_buyer_hits or high_quality_emails):
            evidence_score = self.weights["evidence_depth"]
            reasons.append("Evidence depth strong")
        elif candidate.get("fetch_ok") and crawled_ok_pages >= 2:
            evidence_score = 9
            reasons.append("Evidence depth moderate")
        elif candidate.get("fetch_ok"):
            evidence_score = 5
            reasons.append("Evidence depth shallow")
        else:
            evidence_score = 0
            disqualification_reasons.append("candidate website could not be fetched")
            reasons.append("Website fetch failed")

        penalty = 0
        if domain in self.blocked_domains:
            penalty += 45
            disqualification_reasons.append("known false-positive domain")
        if self._domain_has_blocked_marker(domain) or any(
            self._normalize_domain(domain).endswith(suffix) for suffix in self.blocked_tlds
        ):
            penalty += 45
            disqualification_reasons.append("blocked noisy domain class")
        if normalized_region in {"USA", "UK", "Europe"} and domain.endswith(self.exporter_country_suffixes):
            penalty += 45
            disqualification_reasons.append("supplier-country domain, not a target buyer market")
        if normalized_region in {"USA", "UK", "Europe"} and supplier_country_hits:
            penalty += 35
            disqualification_reasons.append("supplier-country location evidence, not a target buyer market")
        if noisy_domain_hits:
            penalty += min(noisy_domain_hits * 15, 30)
            disqualification_reasons.append("noisy industry publication/directory source")
        if hard_negative_hits:
            penalty += min(len(hard_negative_hits) * 5, 20)
        if soft_negative_hits:
            soft_multiplier = 1 if self.quality_mode == "balanced_growth" else 2
            penalty += min(len(soft_negative_hits) * soft_multiplier, 8)
        if platform_hits:
            penalty += 20
            disqualification_reasons.append("platform/marketplace/directory, not a direct buyer")
        if supplier_competitor_hits and not procurement_side_hits:
            penalty += 25
            disqualification_reasons.append("manufacturer/supplier competitor signal without buyer-side procurement evidence")
        if rejected_emails and not high_quality_emails:
            penalty += min(len(rejected_emails) * 2, 10)

        penalty = min(penalty, self.weights["negative_penalty"])
        if penalty:
            reasons.append(
                f"Penalty applied ({penalty}) for negative/noisy signals"
            )

        raw_score = (
            product_score
            + buyer_score
            + reach_score
            + commercial_score
            + evidence_score
            - penalty
        )
        score = max(0, min(100, raw_score))
        buyer_type = self._buyer_type(strong_buyer_hits, moderate_buyer_hits)
        passes_hard_checks = not disqualification_reasons
        contact_route = self._contact_route(
            emails,
            high_quality_emails,
            contact_forms,
            candidate.get("linkedin_url"),
        )
        outreach_contact = self._outreach_contact(
            emails,
            high_quality_emails,
            contact_forms,
            candidate.get("linkedin_url"),
        )

        candidate["score"] = score
        candidate["score_breakdown"] = {
            "product_fit": product_score,
            "buyer_intent": buyer_score,
            "reachability": reach_score,
            "commercial_readiness": commercial_score,
            "evidence_depth": evidence_score,
            "negative_penalty": penalty,
        }
        candidate["buyer_fit"] = has_buyer_evidence and noisy_domain_hits == 0
        candidate["buyer_type"] = buyer_type
        candidate["product_fit"] = ", ".join(product_hits)
        candidate["product_evidence"] = ", ".join(product_hits)
        candidate["buyer_evidence"] = ", ".join(strong_buyer_hits + moderate_buyer_hits)
        candidate["buyer_side_evidence"] = ", ".join(strong_buyer_hits)
        candidate["sales_side_evidence"] = ", ".join(ambiguous_sales_hits)
        candidate["contact_evidence"] = email_quality
        candidate["contact_route"] = contact_route
        candidate["outreach_contact"] = outreach_contact
        candidate["evidence_url"] = self._best_evidence_url(candidate)
        candidate["negative_evidence"] = ", ".join(
            hard_negative_hits + soft_negative_hits + platform_hits + supplier_competitor_hits + supplier_country_hits
        )
        candidate["disqualification_reasons"] = "; ".join(dict.fromkeys(disqualification_reasons))
        candidate["recommended_pitch_angle"] = self._pitch_angle(buyer_type, product_hits)
        candidate["lead_summary"] = self._lead_summary(
            domain,
            buyer_type,
            product_hits,
            strong_buyer_hits,
            contact_route,
        )
        candidate["closeability_notes"] = self._closeability_notes(
            strong_buyer_hits,
            ambiguous_sales_hits,
            contact_route,
            product_hits,
        )
        candidate["lead_pack_status"] = self._lead_pack_status(
            score,
            passes_hard_checks,
            strong_buyer_hits,
            emails,
            contact_forms,
        )
        candidate["manual_review_required"] = candidate["lead_pack_status"] != "sellable_a_plus"
        candidate["passes_hard_checks"] = passes_hard_checks
        candidate["export_eligible"] = passes_hard_checks
        candidate["qualified"] = passes_hard_checks
        candidate["noisy_domain_hits"] = noisy_domain_hits

        if passes_hard_checks and score >= 85:
            candidate["tier"] = "A"
        elif passes_hard_checks and score >= 75:
            candidate["tier"] = "B"
        else:
            candidate["tier"] = "C"

        candidate["qualification_reasons"] = "; ".join(reasons)
        return candidate

    @staticmethod
    def is_a_plus(candidate, min_score=85):
        """A+ means export-eligible, tier A, and strongly contactable."""
        return (
            candidate.get("export_eligible", candidate.get("qualified", False))
            and candidate.get("tier") == "A"
            and candidate.get("score", 0) >= min_score
            and candidate.get("email_quality") in {"decision", "business"}
            and bool(candidate.get("emails"))
            and bool(candidate.get("buyer_side_evidence"))
            and candidate.get("lead_pack_status") == "sellable_a_plus"
        )

    def rank_and_filter(self, candidates, limit=10, min_score=75):
        """Rank candidates by score and return only qualified exporter-useful leads."""
        scored = [
            c if "score_breakdown" in c else self.evaluate_candidate(c)
            for c in candidates
        ]
        for candidate in scored:
            hard_checks_pass = candidate.get("passes_hard_checks", candidate.get("qualified", False))
            export_eligible = (
                hard_checks_pass
                and candidate.get("score", 0) >= min_score
                and candidate.get("noisy_domain_hits", 0) == 0
            )
            candidate["export_eligible"] = export_eligible
            candidate["qualified"] = export_eligible
            if hard_checks_pass and not export_eligible:
                reasons = [
                    reason
                    for reason in candidate.get("disqualification_reasons", "").split("; ")
                    if reason and not reason.startswith("below minimum score threshold")
                ]
                if candidate.get("score", 0) < min_score:
                    reasons.append(f"below minimum score threshold ({min_score})")
                candidate["disqualification_reasons"] = "; ".join(dict.fromkeys(reasons))

        shortlisted = [
            c
            for c in scored
            if c.get("export_eligible", False)
        ]

        sorted_candidates = sorted(
            shortlisted,
            key=lambda x: (
                x.get("tier") == "A",
                x.get("score", 0),
                x.get("lead_pack_status") == "sellable_a_plus",
                len(x.get("high_quality_emails", [])),
                len(x.get("emails", [])),
                len(x.get("buyer_evidence", "")),
            ),
            reverse=True,
        )
        return sorted_candidates[:limit]
