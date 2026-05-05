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


def build_signal_map(region, industry, search_terms=None):
    normalized_region = _canonical_region(region)
    markets = _target_markets(normalized_region)
    market = markets[0]
    industry_text = str(industry or "").strip() or "business services"
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

    scoring_context = {
        "product_keywords": _normalize_queries(product_keywords),
        "buyer_keywords": _normalize_queries([
            "expansion",
            "franchise",
            "new location",
            "project",
            "procurement",
            "request for proposal",
            "vendor",
            "supplier",
            "tender",
        ]),
        "negative_keywords": _normalize_queries([
            "job board",
            "directory listing",
            "investor news only",
        ]),
    }

    return {
        "cluster": cluster,
        "region": normalized_region,
        "markets": markets,
        "signals": source_routes,
        "routed_search_terms": routed_search_terms,
        "scoring_context": scoring_context,
    }
