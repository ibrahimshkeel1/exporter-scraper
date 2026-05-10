import re


def _canonical_region(region):
    value = str(region or "").strip().lower()
    if value in {"usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "america", "american"}:
        return "USA"
    if value in {"uk", "u.k.", "united kingdom", "britain", "great britain", "england"}:
        return "UK"
    if value in {"eu", "europe", "european union"}:
        return "Europe"
    if value in {"international", "global", "worldwide"}:
        return "International"
    return str(region or "International")


def _target_markets(region):
    if region == "USA":
        return ["United States"]
    if region == "UK":
        return ["United Kingdom"]
    if region == "Europe":
        return ["Europe", "Germany", "France", "Netherlands"]
    return ["United States", "United Kingdom", "Canada", "Australia", "UAE"]


def _normalize_queries(values):
    cleaned = []
    for value in values:
        text = str(value or "").strip()
        if text:
            cleaned.append(text)
    return list(dict.fromkeys(cleaned))


def _product_seed(industry, config=None, search_terms=None):
    text_parts = [str(industry or "")]
    text_parts.extend(str(term or "") for term in search_terms or [])
    lowered = " ".join(text_parts).lower()
    if config and isinstance(config, dict):
        product_seeds = config.get("discovery", {}).get("product_seeds", [])
        for term in product_seeds:
            value = str(term or "").strip()
            if value and value.lower() in lowered:
                return value
        for term in product_seeds:
            value = str(term or "").strip()
            if value:
                return value
    product_terms = (
        "denim",
        "jeans",
        "home textile",
        "activewear",
        "sportswear",
        "streetwear",
        "garment",
        "fabric",
        "fashion",
        "apparel",
        "clothing",
        "textile",
        "towel",
        "leather",
    )
    for term in product_terms:
        if term in lowered:
            return term
    return str(industry or "").strip() or "business services"


def _contains_any(text, terms):
    lowered = str(text or "").lower()
    return any(term in lowered for term in terms)


def _should_allow_public_sector(industry, search_terms):
    public_sector_terms = (
        "college",
        "education",
        "government",
        "municipal",
        "public sector",
        "school",
        "state agency",
        "university",
    )
    if _contains_any(industry, public_sector_terms):
        return True
    for term in search_terms or []:
        if _contains_any(term, public_sector_terms):
            return True
    return False


def _cluster_for_industry(industry):
    text = str(industry or "").lower()
    if any(term in text for term in ("architect", "interior design", "fit out", "fit-out", "planning")):
        return "local_services_expansion"
    if any(term in text for term in ("retail", "restaurant", "hospitality", "cafe", "food chain")):
        return "local_services_expansion"
    if any(term in text for term in ("d2c", "ecommerce", "e-commerce", "consumer brand")):
        return "d2c_growth"
    if any(term in text for term in ("saas", "software", "b2b software")):
        return "b2b_saas_growth"
    if any(term in text for term in ("manufacturing", "industrial", "factory", "equipment")):
        return "manufacturing_expansion"
    return "generic_b2b"


def _signal_catalog(cluster):
    if cluster == "local_services_expansion":
        return [
            {
                "signal": "new-location-openings",
                "why_now": "Expanding footprint usually triggers design and fit-out buying decisions.",
                "confidence": 0.86,
                "query_templates": [
                    "{industry} {market} opening soon contact",
                    "{industry} {market} new location announcement",
                ],
                "source_urls": [],
            },
            {
                "signal": "planning-permit-activity",
                "why_now": "Recent planning or permit filings indicate active construction pipelines.",
                "confidence": 0.82,
                "query_templates": [
                    "{industry} {market} planning application",
                    "{industry} {market} building permit project",
                ],
                "source_urls": [],
            },
            {
                "signal": "expansion-hiring",
                "why_now": "Operations and site-launch hiring often precede physical expansion work.",
                "confidence": 0.78,
                "query_templates": [
                    "{industry} {market} now hiring store opening",
                    "{industry} {market} site manager hiring",
                ],
                "source_urls": [],
            },
            {
                "signal": "franchise-growth",
                "why_now": "Franchise rollout plans create repeat design and architecture demand.",
                "confidence": 0.84,
                "query_templates": [
                    "{industry} {market} franchise expansion",
                    "{industry} {market} franchise development contact",
                ],
                "source_urls": [],
            },
            {
                "signal": "fit-out-rfp",
                "why_now": "Public procurement and RFP traces indicate immediate service buying windows.",
                "confidence": 0.9,
                "query_templates": [
                    "{industry} {market} fit out rfp",
                    "{industry} {market} design tender contact",
                ],
                "source_urls": [],
            },
        ]
    if cluster == "d2c_growth":
        return [
            {
                "signal": "ad-spend-acceleration",
                "why_now": "Rising ad spend correlates with scaling and vendor budget availability.",
                "confidence": 0.76,
                "query_templates": [
                    "{industry} {market} paid social growth",
                    "{industry} {market} meta ads library",
                ],
                "source_urls": [],
            },
            {
                "signal": "review-velocity",
                "why_now": "Fast review growth often indicates expansion and operational complexity.",
                "confidence": 0.72,
                "query_templates": [
                    "{industry} {market} trustpilot reviews",
                    "{industry} {market} review growth",
                ],
                "source_urls": [],
            },
        ]
    if cluster == "b2b_saas_growth":
        return [
            {
                "signal": "funding-events",
                "why_now": "Post-funding teams usually add tools and external services quickly.",
                "confidence": 0.88,
                "query_templates": [
                    "{industry} {market} raised seed series a",
                    "{industry} {market} funding announcement",
                ],
                "source_urls": [],
            },
            {
                "signal": "go-to-market-hiring",
                "why_now": "Sales and marketing hiring indicates active growth motions and spend.",
                "confidence": 0.79,
                "query_templates": [
                    "{industry} {market} hiring account executive",
                    "{industry} {market} hiring demand generation",
                ],
                "source_urls": [],
            },
        ]
    if cluster == "manufacturing_expansion":
        return [
            {
                "signal": "facility-expansion",
                "why_now": "Facility expansion or new line announcements indicate immediate project demand.",
                "confidence": 0.82,
                "query_templates": [
                    "{industry} {market} new facility opening",
                    "{industry} {market} plant expansion project",
                ],
                "source_urls": [],
            },
            {
                "signal": "equipment-investment",
                "why_now": "Equipment financing and modernization usually align with broader capex cycles.",
                "confidence": 0.74,
                "query_templates": [
                    "{industry} {market} equipment modernization project",
                    "{industry} {market} capex expansion",
                ],
                "source_urls": [],
            },
        ]
    return [
        {
            "signal": "active-growth-intent",
            "why_now": "Recent growth announcements often map to near-term buying intent.",
            "confidence": 0.7,
            "query_templates": [
                "{industry} {market} expansion contact",
                "{industry} {market} project request proposal",
            ],
            "source_urls": [],
        },
    ]


def build_signal_map(region, industry, search_terms=None, config=None):
    normalized_region = _canonical_region(region)
    markets = _target_markets(normalized_region)
    market = markets[0]
    industry_text = str(industry or "").strip() or "business services"

    # --- Config-driven path (specialist config) ---
    if config and isinstance(config, dict):
        return _build_signal_map_from_config(normalized_region, markets, market, industry_text, search_terms, config)

    # --- Legacy hardcoded path ---
    cluster = _cluster_for_industry(industry_text)

    catalog = _signal_catalog(cluster)[:5]
    routed_search_terms = []
    source_routes = []

    for signal_row in catalog:
        signal_queries = _normalize_queries(
            template.format(industry=industry_text, market=market).strip()
            for template in signal_row.get("query_templates", [])
        )
        routed_search_terms.extend(signal_queries)
        source_routes.append(
            {
                "signal": signal_row["signal"],
                "confidence": float(signal_row.get("confidence", 0.7)),
                "why_now": signal_row.get("why_now", ""),
                "queries": signal_queries,
                "source_urls": list(signal_row.get("source_urls", [])),
            }
        )

    for term in search_terms or []:
        text = str(term or "").strip()
        if not text:
            continue
        routed_search_terms.append(text)

    routed_search_terms = _normalize_queries(routed_search_terms)
    product_keywords = []
    for token in re.split(r"[^a-z0-9]+", industry_text.lower()):
        if len(token) >= 4:
            product_keywords.append(token)

    allow_public_sector = _should_allow_public_sector(industry_text, search_terms or [])
    is_local_services = cluster == "local_services_expansion"

    buyer_keywords = [
        "expansion",
        "franchise",
        "new location",
        "project",
        "procurement",
        "request for proposal",
        "vendor",
        "supplier",
        "tender",
    ]
    if is_local_services:
        buyer_keywords.extend(
            [
                "branch opening",
                "commercial rent",
                "for lease",
                "high footfall",
                "location launch",
                "new outlet",
                "site selection",
                "store opening",
            ]
        )

    negative_keywords = [
        "job board",
        "directory listing",
        "investor news only",
        "definition",
        "dictionary",
        "documentation",
        "example sentence",
        "github",
        "how to",
        "repository",
        "tutorial",
        "vocabulary",
    ]
    if is_local_services:
        negative_keywords.extend(
            [
                "coding interview",
                "developer docs",
                "open source repo",
            ]
        )

    blocked_domains = [
        "cambridge.org",
        "dictionary.com",
        "github.com",
        "gitlab.com",
        "huggingface.co",
        "merriam-webster.com",
        "stackexchange.com",
        "stackoverflow.com",
        "vocabulary.com",
        "wiktionary.org",
    ]
    blocked_host_markers = [
        "dictionary.",
        "gitlab.",
        "huggingface.",
        "learn.",
        "reference.",
        "tutorial.",
        "wiki.",
    ]
    blocked_tlds = [] if allow_public_sector else [".edu", ".gov", ".mil", ".ac.uk"]

    scoring_context = {
        "product_keywords": _normalize_queries(product_keywords),
        "buyer_keywords": _normalize_queries(buyer_keywords),
        "negative_keywords": _normalize_queries(negative_keywords),
        "blocked_domains": _normalize_queries(blocked_domains),
        "blocked_host_markers": _normalize_queries(blocked_host_markers),
        "blocked_tlds": _normalize_queries(blocked_tlds),
        "quality_mode": "balanced_growth" if is_local_services else "balanced",
        "search_intent": cluster,
    }

    return {
        "cluster": cluster,
        "region": normalized_region,
        "markets": markets,
        "signals": source_routes,
        "routed_search_terms": routed_search_terms,
        "scoring_context": scoring_context,
    }


def _build_signal_map_from_config(region, markets, market, industry_text, search_terms, config):
    """Build signal map entirely from a specialist config."""
    signals_cfg = config.get("signals", {})
    scoring_cfg = config.get("scoring", {})
    cluster = signals_cfg.get("cluster", "generic_b2b")
    base = _product_seed(industry_text, config=config, search_terms=search_terms)

    signal_catalog = signals_cfg.get("signal_catalog", [])
    routed_search_terms = []
    source_routes = []

    for signal_row in signal_catalog[:5]:
        signal_name = signal_row.get("name", signal_row.get("signal", "signal"))
        signal_queries = _normalize_queries(
            template.format(industry=industry_text, base=base, market=market).strip()
            for template in signal_row.get("query_templates", [])
        )
        routed_search_terms.extend(signal_queries)
        source_routes.append({
            "signal": signal_name,
            "confidence": float(signal_row.get("confidence", 0.7)),
            "why_now": signal_row.get("why_now", ""),
            "queries": signal_queries,
            "source_urls": list(signal_row.get("source_urls", [])),
        })

    for term in search_terms or []:
        text = str(term or "").strip()
        if not text:
            continue
        routed_search_terms.append(text)

    routed_search_terms = _normalize_queries(routed_search_terms)

    keywords = scoring_cfg.get("keywords", {})
    scoring_context = {
        "product_keywords": _normalize_queries(keywords.get("product_keywords", [])),
        "buyer_keywords": _normalize_queries(keywords.get("strong_buyer_keywords", [])),
        "negative_keywords": _normalize_queries(keywords.get("negative_keywords", [])),
        "blocked_domains": _normalize_queries(scoring_cfg.get("blocked_domains", [])),
        "blocked_host_markers": _normalize_queries(scoring_cfg.get("blocked_domain_markers", [])),
        "blocked_tlds": _normalize_queries(scoring_cfg.get("blocked_tlds", [])),
        "quality_mode": scoring_cfg.get("quality_mode", "balanced"),
        "search_intent": signals_cfg.get("search_intent", cluster),
    }

    return {
        "cluster": cluster,
        "region": region,
        "markets": markets,
        "signals": source_routes,
        "routed_search_terms": routed_search_terms,
        "scoring_context": scoring_context,
        "_config_slug": config.get("slug", ""),
    }
