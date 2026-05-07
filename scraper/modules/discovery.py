import base64
import binascii
import inspect
import random
import re
import time
from dataclasses import dataclass
from ipaddress import ip_address
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlsplit


@dataclass(frozen=True)
class DiscoverySource:
    name: str
    url: str
    selectors: tuple[str, ...]
    include_directory_links: bool = False
    discovery_method: str = "directory"
    candidate_kind: str = "website"
    signal_detected: str = ""
    signal_confidence: float = 0.0
    why_now: str = ""
    search_engine: str = ""


class LeadDiscovery:
    MULTI_LEVEL_SUFFIXES = {
        "co.uk",
        "org.uk",
        "ac.uk",
        "gov.uk",
        "com.au",
        "net.au",
        "org.au",
        "co.nz",
        "com.br",
        "co.jp",
        "co.in",
        "com.pk",
        "com.hk",
        "com.sg",
        "com.my",
        "com.ph",
        "co.kr",
        "com.mx",
    }

    EXCLUDED_HOST_PARTS = (
        "google.",
        "bing.",
        "duckduckgo.",
        "yahoo.",
        "microsoft.",
        "youtube.",
        "wikipedia.",
        "facebook.",
        "instagram.",
        "twitter.",
        "x.com",
        "linkedin.",
        "baidu.",
        "zhihu.",
        "pinterest.",
        "quora.",
        "reddit.",
        "amazon.",
        "ebay.",
        "yelp.",
        "yellowpages.",
        "yell.com",
        "europages.",
        "cloudflare.",
        "localsearch.",
        "thryv.",
        "networkadvertising.",
        "bbb.",
        "manta.",
        "mapquest.",
        "superpages.",
        "dnb.",
        "zoominfo.",
        "crunchbase.",
        "glassdoor.",
        "indeed.",
        "trustpilot.",
        "shopify.com",
        "wix.com",
        "godaddy.",
        "wordpress.",
        "sentry.",
        "dictionary.",
        "gitlab.",
        "huggingface.",
        "wiktionary.",
        "wikisource.",
    )
    EXCLUDED_ROOT_DOMAINS = {
        "cambridge.org",
        "cloudflare.com",
        "dictionary.com",
        "github.com",
        "gitlab.com",
        "huggingface.co",
        "localsearch.com",
        "merriam-webster.com",
        "networkadvertising.org",
        "nike.com",
        "stackoverflow.com",
        "thryv.com",
        "baidu.com",
        "zhihu.com",
        "cookie-script.com",
        "vocabulary.com",
        "visable.com",
        "wiktionary.org",
    }
    EXCLUDED_DOMAIN_SUFFIXES = (
        ".ac.uk",
        ".edu",
        ".gov",
        ".mil",
    )
    EXCLUDED_PATH_PARTS = (
        "/cart",
        "/checkout",
        "/cdn-cgi/",
        "/cookie",
        "/login",
        "/privacy",
        "/search",
        "/terms",
        "/wiki/",
        ".pdf",
    )
    EXPORTER_COUNTRY_SUFFIXES = (
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
    SEARCH_ENGINE_MIN_DELAY_SECONDS = {
        "bing": 8.0,
        "duckduckgo": 5.0,
        "yahoo": 6.0,
    }
    SEARCH_ENGINE_MAX_REQUESTS = {
        "bing": 10,
        "duckduckgo": 12,
        "yahoo": 8,
    }
    SEARCH_ENGINE_COOLDOWN_SECONDS = {
        "bing": 90.0,
        "duckduckgo": 45.0,
        "yahoo": 60.0,
    }

    def __init__(self, limit=30, search_terms=None, signal_map=None, scoring_context=None, diagnostics=None, config=None):
        self.limit = limit
        self.search_terms = [term for term in (search_terms or []) if term]
        self.signal_map = signal_map or {}
        self.scoring_context = scoring_context if isinstance(scoring_context, dict) else {}
        self.seen_domains = set()
        self.diagnostics = diagnostics
        self._last_intake_event = None
        self.config = config if isinstance(config, dict) else {}

        # Build dynamic exclusion lists from scoring_context (overlay on top of config/legacy)
        self.dynamic_excluded_root_domains = {
            self._normalize_domain_value(value)
            for value in self.scoring_context.get("blocked_domains", []) if str(value or "").strip()
        }
        self.dynamic_excluded_host_parts = tuple(
            str(value or "").strip().lower()
            for value in self.scoring_context.get("blocked_host_markers", [])
            if str(value or "").strip()
        )
        self.dynamic_excluded_domain_suffixes = tuple(
            str(value or "").strip().lower()
            for value in self.scoring_context.get("blocked_tlds", [])
            if str(value or "").strip()
        )

        # Merge config exclusions into instance-level overrides
        if self.config:
            disc = self.config.get("discovery", {})
            excl = disc.get("exclusions", {})
            if excl:
                cfg_host_parts = [str(v or "").strip().lower() for v in excl.get("host_parts", []) if str(v or "").strip()]
                if cfg_host_parts:
                    self.dynamic_excluded_host_parts = tuple(
                        dict.fromkeys(list(self.dynamic_excluded_host_parts) + cfg_host_parts)
                    )
                cfg_root = {self._normalize_domain_value(v) for v in excl.get("root_domains", []) if str(v or "").strip()}
                self.dynamic_excluded_root_domains |= cfg_root
                cfg_suffixes = [str(v or "").strip().lower() for v in excl.get("domain_suffixes", []) if str(v or "").strip()]
                if cfg_suffixes:
                    self.dynamic_excluded_domain_suffixes = tuple(
                        dict.fromkeys(list(self.dynamic_excluded_domain_suffixes) + cfg_suffixes)
                    )
                cfg_exp_path = [str(v or "").strip().lower() for v in excl.get("path_parts", []) if str(v or "").strip()]
                if cfg_exp_path:
                    self.EXCLUDED_PATH_PARTS = tuple(dict.fromkeys(
                        list(self.EXCLUDED_PATH_PARTS) + cfg_exp_path
                    ))
                cfg_exp_dom = [str(v or "").strip().lower() for v in excl.get("exporter_country_suffixes", []) if str(v or "").strip()]
                if cfg_exp_dom:
                    self.EXPORTER_COUNTRY_SUFFIXES = tuple(dict.fromkeys(
                        list(self.EXPORTER_COUNTRY_SUFFIXES) + cfg_exp_dom
                    ))

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
        context_terms = [str(term or "").lower() for term in self.search_terms]
        context_terms.extend(str(term or "").lower() for term in self.scoring_context.get("product_keywords", []))
        context_terms.extend(str(term or "").lower() for term in self.scoring_context.get("buyer_keywords", []))
        context_terms.append(str(self.scoring_context.get("search_intent", "")).lower())
        combined_context = " ".join(context_terms)
        self.allow_public_sector_domains = any(term in combined_context for term in public_sector_terms)

    @staticmethod
    def _normalize_domain_value(value):
        domain = str(value or "").strip().lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain

    @staticmethod
    def _looks_like_ip(host):
        try:
            ip_address(host)
            return True
        except ValueError:
            return False

    def _normalize_domain(self, url):
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower().strip(".")
        if not host:
            return ""
        if host.startswith("www."):
            host = host[4:]
        if self._looks_like_ip(host):
            return host

        labels = [label for label in host.split(".") if label]
        if len(labels) <= 2:
            return ".".join(labels)

        last_two = ".".join(labels[-2:])
        if last_two in self.MULTI_LEVEL_SUFFIXES and len(labels) >= 3:
            return ".".join(labels[-3:])
        return ".".join(labels[-2:])

    def _extract_redirect_target(self, absolute_url):
        parsed = urlsplit(absolute_url)
        query = parse_qs(parsed.query)
        for key in ("url", "target", "uddg", "u", "to"):
            values = query.get(key)
            if not values:
                continue
            target = unquote(values[0]).strip()
            target_parsed = urlsplit(target)
            if target_parsed.scheme in {"http", "https"}:
                return target
            decoded_target = self._decode_search_redirect_target(target)
            decoded_parsed = urlsplit(decoded_target)
            if decoded_parsed.scheme in {"http", "https"}:
                return decoded_target
        return absolute_url

    @staticmethod
    def _decode_search_redirect_target(value):
        """Decode Bing-style base64 redirect values such as a1aHR0cHM6..."""
        if not value:
            return ""
        candidate = value.strip()
        for prefix in ("a1", "a2"):
            if candidate.startswith(prefix):
                candidate = candidate[len(prefix):]
                break
        try:
            padded = candidate + "=" * (-len(candidate) % 4)
            decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode(
                "utf-8",
                errors="ignore",
            )
        except (binascii.Error, UnicodeDecodeError, ValueError):
            return ""
        return decoded.strip()

    def _canonical_homepage_url(self, candidate_url):
        parsed = urlsplit(candidate_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return f"{parsed.scheme}://{parsed.netloc}/"

    def _is_target_region_domain(self, domain, region):
        """Reject common supplier-country domains when looking for Western buyers."""
        if region in {"USA", "UK", "Europe"} and domain.endswith(self.EXPORTER_COUNTRY_SUFFIXES):
            return False
        return True

    def _clean_candidate_url(self, href, base_url):
        if not href:
            return ""
        absolute_url = urljoin(base_url, href.strip())
        parsed = urlsplit(absolute_url)
        if parsed.scheme not in {"http", "https"}:
            return ""
        absolute_url = self._extract_redirect_target(absolute_url)
        clean_parsed = urlsplit(absolute_url)
        if clean_parsed.scheme not in {"http", "https"} or not clean_parsed.hostname:
            return ""
        return clean_parsed.geturl()

    def _is_valid_candidate_url(self, candidate_url, source):
        parsed = urlsplit(candidate_url)
        host = (parsed.hostname or "").lower()
        if not host:
            return False
        if source.candidate_kind == "direct_url":
            return True
        domain = self._normalize_domain(candidate_url)
        if domain in self.EXCLUDED_ROOT_DOMAINS or domain in self.dynamic_excluded_root_domains:
            return False
        if any(part in host for part in self.EXCLUDED_HOST_PARTS):
            return False
        if any(part in host for part in self.dynamic_excluded_host_parts):
            return False
        domain_suffixes = list(self.dynamic_excluded_domain_suffixes)
        if not self.allow_public_sector_domains:
            domain_suffixes.extend(self.EXCLUDED_DOMAIN_SUFFIXES)
        if any(domain.endswith(suffix) for suffix in domain_suffixes):
            return False
        path = parsed.path.lower()
        if any(part in path for part in self.EXCLUDED_PATH_PARTS):
            return False
        if source.include_directory_links:
            return True
        return host != (urlsplit(source.url).hostname or "").lower()

    def _candidate_from_url(self, clean_url, source, region, industry):
        if not self._is_valid_candidate_url(clean_url, source):
            if self.diagnostics:
                domain = self._normalize_domain(clean_url)
                host = (urlsplit(clean_url).hostname or "").lower()
                path = urlsplit(clean_url).path.lower()
                if domain in self.EXCLUDED_ROOT_DOMAINS or domain in self.dynamic_excluded_root_domains:
                    reason = "domain"
                elif any(part in host for part in self.EXCLUDED_HOST_PARTS) or any(part in host for part in self.dynamic_excluded_host_parts):
                    reason = "host"
                elif any(domain.endswith(suffix) for suffix in list(self.dynamic_excluded_domain_suffixes) + ([] if self.allow_public_sector_domains else list(self.EXCLUDED_DOMAIN_SUFFIXES))):
                    reason = "tld"
                elif any(part in path for part in self.EXCLUDED_PATH_PARTS):
                    reason = "path"
                else:
                    reason = "other"
                self.diagnostics.record_intake(clean_url, passed=False, blocked_reason=reason)
            return None

        domain = self._normalize_domain(clean_url)
        if not domain or domain in self.seen_domains:
            if self.diagnostics:
                self.diagnostics.record_intake(clean_url, passed=False, blocked_reason="dedup")
            return None
        if not self._is_target_region_domain(domain, region):
            if self.diagnostics:
                self.diagnostics.record_intake(clean_url, passed=False, blocked_reason="country")
            return None

        homepage_url = self._canonical_homepage_url(clean_url)
        if not homepage_url:
            if self.diagnostics:
                self.diagnostics.record_intake(clean_url, passed=False, blocked_reason="other")
            return None

        self.seen_domains.add(domain)
        if self.diagnostics:
            self.diagnostics.record_intake(clean_url, passed=True)
            self.diagnostics.record_candidate_domain(domain)
        return {
            "url": homepage_url,
            "discovery_url": clean_url,
            "domain": domain,
            "source_name": source.name,
            "source_url": source.url,
            "discovery_method": source.discovery_method,
            "candidate_kind": source.candidate_kind,
            "signal_detected": source.signal_detected,
            "signal_confidence_score": source.signal_confidence,
            "why_now": source.why_now,
            "region": region,
            "industry": industry,
        }


    @staticmethod
    def _signal_slug(value):
        return re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")[:36] or "signal"

    def _signal_search_sources(self, region, industry, depth=None):
        signals = self.signal_map.get("signals", []) if isinstance(self.signal_map, dict) else []
        if not signals:
            return []
        query_budget = 1
        sources = []
        for signal_index, signal in enumerate(signals, start=1):
            signal_name = str(signal.get("signal", "")).strip()
            confidence = float(signal.get("confidence", 0.7) or 0.7)
            why_now = str(signal.get("why_now", "")).strip()
            queries = [str(query or "").strip() for query in signal.get("queries", []) if str(query or "").strip()]
            source_urls = [str(url or "").strip() for url in signal.get("source_urls", []) if str(url or "").strip()]
            signal_slug = self._signal_slug(signal_name or f"signal-{signal_index}")
            for page_url in source_urls:
                sources.append(
                    DiscoverySource(
                        name=f"signal-seed-{signal_slug}",
                        url=page_url,
                        selectors=(),
                        discovery_method="signal_seed",
                        candidate_kind="direct_url",
                        signal_detected=signal_name,
                        signal_confidence=confidence,
                        why_now=why_now,
                    )
                )
            for query_index, query in enumerate(queries[:query_budget], start=1):
                encoded = quote_plus(query)
                name_suffix = signal_slug if query_index == 1 else f"{signal_slug}-q{query_index}"
                sources.append(
                    DiscoverySource(
                        name=f"signal-bing-p1-{name_suffix}",
                        url=f"https://www.bing.com/search?q={encoded}&first=1",
                        selectors=(
                            "li.b_algo h2 a[href]",
                            "ol#b_results a[href]",
                            "a[href*='http']",
                        ),
                        discovery_method="signal_search",
                        signal_detected=signal_name,
                        signal_confidence=confidence,
                        why_now=why_now,
                        search_engine="bing",
                    )
                )
                sources.append(
                    DiscoverySource(
                        name=f"signal-duckduckgo-p1-{name_suffix}",
                        url=f"https://lite.duckduckgo.com/lite/?q={encoded}",
                        selectors=(
                            "a.result-link[href]",
                            "a[href*='uddg=']",
                            "a[href*='http']",
                        ),
                        discovery_method="signal_search",
                        signal_detected=signal_name,
                        signal_confidence=confidence,
                        why_now=why_now,
                        search_engine="duckduckgo",
                    )
                )
                if query_index == 1:
                    sources.append(
                        DiscoverySource(
                            name=f"signal-yahoo-p1-{signal_slug}",
                            url=f"https://search.yahoo.com/search?p={encoded}",
                            selectors=(
                                "div#web h3.title a[href]",
                                "h3.title a[href]",
                                "a[href*='http']",
                            ),
                            discovery_method="signal_search",
                            signal_detected=signal_name,
                            signal_confidence=confidence,
                            why_now=why_now,
                            search_engine="yahoo",
                        )
                    )
        return sources

    @staticmethod
    def _is_throttle_or_block_error(text):
        lowered = (text or "").lower()
        return any(
            marker in lowered
            for marker in (
                "err_connection_closed",
                "err_timed_out",
                "timeout",
                "too many requests",
                "429",
                "rate",
                "blocked",
                "captcha",
                "automated queries",
                "unusual traffic",
                "verify you are human",
                "access denied",
            )
        )

    async def _extract_links_from_source(self, page, source):
        seen = set()
        ordered_links = []

        for selector in source.selectors:
            elements = await page.query_selector_all(selector)
            for element in elements:
                href = await element.get_attribute("href")
                if href and href not in seen:
                    seen.add(href)
                    ordered_links.append(href)

        # Fallback selector to retain resilience when source selectors change.
        if not ordered_links:
            elements = await page.query_selector_all("a[href]")
            for element in elements:
                href = await element.get_attribute("href")
                if href and href not in seen:
                    seen.add(href)
                    ordered_links.append(href)

        return ordered_links

    @staticmethod
    def _slug(value):
        return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:48] or "query"

    def _product_seed(self, industry):
        if self.config:
            product_seeds = self.config.get("discovery", {}).get("product_seeds", [])
            if product_seeds:
                lowered = (industry or "").lower()
                for term in product_seeds:
                    if str(term or "").strip().lower() in lowered:
                        return str(term).strip()
                return str(product_seeds[0]).strip()
        lowered = (industry or "").lower()
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
        return industry.strip() or "apparel"

    def _is_apparel_industry(self, industry):
        if self.config:
            triggers = self.config.get("triggers", {}).get("keywords", [])
            if triggers:
                lowered = (industry or "").lower()
                return any(str(t or "").strip().lower() in lowered for t in triggers)
        lowered = (industry or "").lower()
        apparel_terms = (
            "activewear",
            "apparel",
            "boutique",
            "clothing",
            "denim",
            "fabric",
            "fashion",
            "garment",
            "jeans",
            "private label clothing",
            "sportswear",
            "streetwear",
            "textile",
        )
        return any(term in lowered for term in apparel_terms)

    @staticmethod
    def _is_architecture_industry(industry):
        lowered = (industry or "").lower()
        architecture_terms = (
            "architect",
            "architecture",
            "commercial design",
            "design-build",
            "fit out",
            "fit-out",
            "interior design",
            "landscape design",
            "master planning",
            "urban design",
        )
        return any(term in lowered for term in architecture_terms)

    @staticmethod
    def _is_local_services_industry(industry):
        lowered = (industry or "").lower()
        local_services_terms = (
            "bakery",
            "barista",
            "cafe",
            "coffee",
            "coffeehouse",
            "food",
            "franchise",
            "hospitality",
            "restaurant",
            "retail shop",
            "storefront",
        )
        return any(term in lowered for term in local_services_terms)

    def _noise_exclusion_suffix(self):
        if self.config:
            suffixes = self.config.get("discovery", {}).get("noise_exclusion_suffixes", [])
            if suffixes:
                return " ".join(str(s or "").strip() for s in suffixes if str(s or "").strip())
        return (
            "-dictionary -definition -wikipedia -wiktionary "
            "-reddit -youtube"
        )

    @staticmethod
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
        return region

    def _target_markets(self, region):
        if self.config:
            region_markets = self.config.get("discovery", {}).get("region_markets", {})
            markets = region_markets.get(region.lower(), [])
            if markets:
                return markets
        if region == "USA":
            return ["United States"]
        if region == "UK":
            return ["United Kingdom"]
        if region == "Europe":
            return ["Europe"]
        if region == "International":
            return [
                "United States",
                "United Kingdom",
                "Canada",
                "Australia",
                "UAE",
                "Germany",
            ]
        return [region]

    def _buyer_search_queries(self, region, industry):
        region = self._canonical_region(region)

        # --- Config-driven path ---
        if self.config:
            return self._buyer_search_queries_from_config(region, industry)

        base = self._product_seed(industry)
        markets = self._target_markets(region)
        market = markets[0]
        supplied_queries = []
        is_apparel = self._is_apparel_industry(industry)
        is_architecture = self._is_architecture_industry(industry)
        is_local_services = self._is_local_services_industry(industry)
        noise_exclusions = self._noise_exclusion_suffix()
        for term in self.search_terms:
            normalized = term.strip()
            if not normalized:
                continue
            normalized_lower = normalized.lower()
            mentions_market = any(target.lower() in normalized_lower for target in markets)
            if not mentions_market and region.lower() not in normalized_lower:
                normalized = f"{normalized} {market}"
            if is_apparel:
                normalized = f"{normalized} -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter"
            supplied_queries.append(f"{normalized} contact email {noise_exclusions}")
            if region == "International" and not mentions_market:
                for extra_market in markets[1:4]:
                    supplied_queries.append(f"{term.strip()} {extra_market} contact email {noise_exclusions}")

        if is_apparel:
            default_queries = [
                f'{base} importer wholesaler distributor "{market}" contact -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} wholesale buyer retailer "{market}" contact email -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} private label clothing brand sourcing "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} procurement vendor application retailer "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} boutique retailer wholesale distributor "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} supplier application "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} vendor portal "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} wholesale account "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} trade account "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} stockist "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} line sheet "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} buying office "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'{base} sourcing manager "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'"{base} importer" "{market}" "contact" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'"{base} wholesaler" "{market}" "contact" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'"{base} distributor" "{market}" "contact" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'"{base} retailer" "vendor application" "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'"{base} brand" "wholesale" "contact" "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'"{base} brand" "supplier portal" "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                f'"{base} brand" "buying office" "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            ]
        elif is_local_services:
            default_queries = [
                f'"{base}" "{market}" coffee shop expansion contact {noise_exclusions}',
                f'"{base}" "{market}" new outlet opening soon contact {noise_exclusions}',
                f'"{base}" "{market}" cafe branch opening contact {noise_exclusions}',
                f'"{base}" "{market}" franchise expansion contact {noise_exclusions}',
                f'"{base}" "{market}" commercial space for lease cafe {noise_exclusions}',
                f'"{base}" "{market}" retail unit for rent coffee shop {noise_exclusions}',
                f'"{base}" "{market}" high footfall location cafe contact {noise_exclusions}',
                f'"{base}" "{market}" site selection real estate coffee chain {noise_exclusions}',
                f'"{base}" "{market}" specialty cafe contact email {noise_exclusions}',
                f'"{base}" "{market}" restaurant and cafe expansion news contact {noise_exclusions}',
            ]
        else:
            default_queries = [
                f'"{base}" "{market}" projects contact email {noise_exclusions}',
                f'"{base}" "{market}" companies contact {noise_exclusions}',
                f'"{base}" "{market}" firms contact {noise_exclusions}',
                f'"{base}" "{market}" services contact {noise_exclusions}',
                f'"{base}" "{market}" partnerships contact {noise_exclusions}',
                f'"{base}" "{market}" decision maker contact {noise_exclusions}',
            ]

        if is_architecture:
            default_queries.extend(
                [
                    f'"{base}" "{market}" commercial real estate developer contact {noise_exclusions}',
                    f'"{base}" "{market}" hospitality project design consultant contact {noise_exclusions}',
                    f'"{base}" "{market}" office fit out project contact {noise_exclusions}',
                    f'"{base}" "{market}" architecture tender contact {noise_exclusions}',
                    f'"{base}" "{market}" interior design firm project inquiry {noise_exclusions}',
                    f'"{base}" "{market}" mixed use development architect contact {noise_exclusions}',
                ]
            )
        if region == "Europe":
            for country in ("Germany", "France", "Netherlands", "Italy", "Spain", "Poland", "Sweden"):
                if is_apparel:
                    default_queries.extend(
                        [
                            f'{base} importer wholesaler distributor "{country}" contact -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                            f'{base} retailer "supplier portal" "{country}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                            f'{base} brand "vendor application" "{country}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                        ]
                    )
                else:
                    default_queries.extend(
                        [
                            f'"{base}" "{country}" projects contact email {noise_exclusions}',
                            f'"{base}" "{country}" companies contact {noise_exclusions}',
                            f'"{base}" "{country}" procurement vendor contact {noise_exclusions}',
                        ]
                    )
        elif region == "International":
            for country in markets[1:]:
                if is_apparel:
                    default_queries.extend(
                        [
                            f'{base} importer wholesaler distributor "{country}" contact -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                            f'{base} retailer "supplier portal" "{country}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
                        ]
                    )
                else:
                    default_queries.extend(
                        [
                            f'"{base}" "{country}" projects contact email {noise_exclusions}',
                            f'"{base}" "{country}" procurement vendor contact {noise_exclusions}',
                        ]
                    )
                    if is_architecture:
                        default_queries.extend(
                            [
                                f'"{base}" "{country}" architecture project request proposal {noise_exclusions}',
                                f'"{base}" "{country}" property developer design consultancy contact {noise_exclusions}',
                                f'"{base}" "{country}" commercial interior design project contact {noise_exclusions}',
                            ]
                        )
                    if is_local_services:
                        default_queries.extend(
                            [
                                f'"{base}" "{country}" cafe expansion contact {noise_exclusions}',
                                f'"{base}" "{country}" retail unit for rent coffee shop {noise_exclusions}',
                            ]
                        )

        return list(dict.fromkeys(supplied_queries + default_queries))

    def _buyer_search_queries_from_config(self, region, industry):
        """Build search queries from specialist config templates."""
        disc = self.config.get("discovery", {})
        templates = disc.get("search_queries", [])
        base = self._product_seed(industry)
        markets = self._target_markets(region)
        market = markets[0]
        noise_exclusions = self._noise_exclusion_suffix()

        queries = []
        for template in templates:
            tpl = str(template or "").strip()
            if not tpl:
                continue
            query = tpl.format(base=base, market=market).strip()
            if noise_exclusions and "-dictionary" not in query.lower():
                query = f"{query} {noise_exclusions}"
            queries.append(query)

        region_extra = disc.get("region_extra_queries", {})
        if region == "Europe":
            europe_countries = self.config.get("discovery", {}).get("europe_country_markets",
                self.config.get("scoring", {}).get("europe_country_markets",
                ["Germany", "France", "Netherlands", "Italy", "Spain", "Poland", "Sweden"]))
            for country in europe_countries:
                for tpl in region_extra.get("europe", []):
                    query = str(tpl).format(base=base, country=country, market=market).strip()
                    if noise_exclusions and "-dictionary" not in query.lower():
                        query = f"{query} {noise_exclusions}"
                    queries.append(query)
        elif region == "International":
            for country in markets[1:]:
                for tpl in region_extra.get("international", []):
                    query = str(tpl).format(base=base, country=country, market=market).strip()
                    if noise_exclusions and "-dictionary" not in query.lower():
                        query = f"{query} {noise_exclusions}"
                    queries.append(query)

        return list(dict.fromkeys(queries))

    def _search_source_pages(self, query, slug, page_depth, yahoo_depth):
        encoded = quote_plus(query)
        sources = []
        for page_index in range(1, page_depth + 1):
            bing_offset = (page_index - 1) * 10 + 1
            sources.append(
                DiscoverySource(
                    name=f"bing-p{page_index}-{slug}",
                    url=f"https://www.bing.com/search?q={encoded}&first={bing_offset}",
                    selectors=(
                        "li.b_algo h2 a[href]",
                        "ol#b_results a[href]",
                        "a[href*='http']",
                    ),
                    discovery_method="search",
                    search_engine="bing",
                )
            )
            duck_offset = (page_index - 1) * 30
            sources.append(
                DiscoverySource(
                    name=f"duckduckgo-p{page_index}-{slug}",
                    url=f"https://lite.duckduckgo.com/lite/?q={encoded}&s={duck_offset}",
                    selectors=(
                        "a.result-link[href]",
                        "a[href*='uddg=']",
                        "a[href*='http']",
                    ),
                    discovery_method="search",
                    search_engine="duckduckgo",
                )
            )
            if page_index <= yahoo_depth:
                yahoo_offset = (page_index - 1) * 10 + 1
                sources.append(
                    DiscoverySource(
                        name=f"yahoo-p{page_index}-{slug}",
                        url=f"https://search.yahoo.com/search?p={encoded}&b={yahoo_offset}",
                        selectors=(
                            "div#web h3.title a[href]",
                            "h3.title a[href]",
                            "a[href*='http']",
                        ),
                        discovery_method="search",
                        search_engine="yahoo",
                    )
                )
        return sources

    def _search_sources(self, region, industry, depth=None):
        sources = []
        is_apparel = self._is_apparel_industry(industry)
        is_architecture = self._is_architecture_industry(industry)
        is_local_services = self._is_local_services_industry(industry)
        queries = self._buyer_search_queries(region, industry)
        if is_architecture and is_local_services:
            queries = queries[:12]
        elif is_architecture:
            queries = queries[:6]
        elif is_local_services:
            queries = queries[:12]
        elif is_apparel:
            queries = queries[:8]
        else:
            queries = queries[:8]
        page_depth = depth if depth is not None else 1
        yahoo_depth = depth if depth is not None else 1
        for query_index, query in enumerate(queries, start=1):
            slug = self._slug(query)
            query_page_depth = page_depth
            query_yahoo_depth = yahoo_depth
            sources.extend(
                self._search_source_pages(
                    query=query,
                    slug=slug,
                    page_depth=query_page_depth,
                    yahoo_depth=query_yahoo_depth,
                )
            )
        return sources

    def generate_sources(self, region, industry, depth=None):
        region = self._canonical_region(region)
        signal_sources = self._signal_search_sources(region, industry, depth=depth)

        # --- Config-driven path ---
        if self.config:
            return signal_sources + self._generate_sources_from_config(region, industry) + self._search_sources(region, industry, depth=depth)

        query = quote_plus(self._product_seed(industry))
        is_apparel = self._is_apparel_industry(industry)
        if region == "USA":
            if not is_apparel:
                directory_sources = [
                    DiscoverySource(
                        name="yellowpages-usa-business-search",
                        url=f"https://www.yellowpages.com/search?search_terms={query}+companies&geo_location_terms=USA",
                        selectors=("a.track-visit-website", "a[data-analytics='website']"),
                    ),
                ]
                return signal_sources + directory_sources + self._search_sources(region, industry, depth=depth)
            buyer_intent_sources = [
                DiscoverySource(
                    name="seed-usa-buyer-intent-pages",
                    url="seed://usa-buyer-intent-pages",
                    selectors=(),
                    discovery_method="curated_seed",
                    candidate_kind="seed_list",
                ),
            ]
            directory_sources = [
                DiscoverySource(
                    name="la-fashion-district-wholesale",
                    url="https://fashiondistrict.org/wholesale/directory",
                    selectors=("a[href^='/go/']", "a[href*='/go/']"),
                    include_directory_links=True,
                    discovery_method="directory_profile",
                    candidate_kind="directory_profile",
                ),
                DiscoverySource(
                    name="la-fashion-district-womenswear",
                    url="https://fashiondistrict.org/wholesale/directory/directory/women-s-wear",
                    selectors=("a[href^='/go/']", "a[href*='/go/']"),
                    include_directory_links=True,
                    discovery_method="directory_profile",
                    candidate_kind="directory_profile",
                ),
                DiscoverySource(
                    name="la-fashion-district-menswear",
                    url="https://fashiondistrict.org/wholesale/directory/directory/menswear",
                    selectors=("a[href^='/go/']", "a[href*='/go/']"),
                    include_directory_links=True,
                    discovery_method="directory_profile",
                    candidate_kind="directory_profile",
                ),
                DiscoverySource(
                    name="la-fashion-district-sportswear",
                    url="https://fashiondistrict.org/wholesale/directory/directory/athletic-wear/sportswear",
                    selectors=("a[href^='/go/']", "a[href*='/go/']"),
                    include_directory_links=True,
                    discovery_method="directory_profile",
                    candidate_kind="directory_profile",
                ),
                DiscoverySource(
                    name="yellowpages-importers",
                    url=f"https://www.yellowpages.com/search?search_terms={query}+importers&geo_location_terms=USA",
                    selectors=("a.track-visit-website", "a[data-analytics='website']"),
                ),
                DiscoverySource(
                    name="yellowpages-wholesalers",
                    url=f"https://www.yellowpages.com/search?search_terms={query}+wholesalers&geo_location_terms=USA",
                    selectors=("a.track-visit-website", "a[data-analytics='website']"),
                ),
                DiscoverySource(
                    name="yellowpages-distributors",
                    url=f"https://www.yellowpages.com/search?search_terms={query}+distributors&geo_location_terms=USA",
                    selectors=("a.track-visit-website", "a[data-analytics='website']"),
                ),
                DiscoverySource(
                    name="seed-usa-apparel-buyers",
                    url="seed://usa-apparel-buyers",
                    selectors=(),
                    discovery_method="curated_seed",
                    candidate_kind="seed_list",
                ),
            ]
            return signal_sources + buyer_intent_sources + directory_sources + self._search_sources(region, industry, depth=depth)
        if region == "UK":
            if not is_apparel:
                directory_sources = [
                    DiscoverySource(
                        name="yell-uk-business-search",
                        url=f"https://www.yell.com/ucs/UcsSearchAction.do?keywords={query}+companies+contact&location=UK",
                        selectors=(
                            "a.businessCapsule--ctaItem[href]",
                            "a[data-tracking*='website'][href]",
                        ),
                    ),
                ]
                return signal_sources + directory_sources + self._search_sources(region, industry, depth=depth)
            buyer_intent_sources = [
                DiscoverySource(
                    name="seed-uk-buyer-intent-pages",
                    url="seed://uk-buyer-intent-pages",
                    selectors=(),
                    discovery_method="curated_seed",
                    candidate_kind="seed_list",
                ),
                DiscoverySource(
                    name="seed-uk-apparel-buyers",
                    url="seed://uk-apparel-buyers",
                    selectors=(),
                    discovery_method="curated_seed",
                    candidate_kind="seed_list",
                ),
            ]
            directory_sources = [
                DiscoverySource(
                    name="yell-buyer-search",
                    url=f"https://www.yell.com/ucs/UcsSearchAction.do?keywords={query}+importer+wholesaler+distributor&location=UK",
                    selectors=(
                        "a.businessCapsule--ctaItem[href]",
                        "a[data-tracking*='website'][href]",
                    ),
                ),
            ]
            return signal_sources + buyer_intent_sources + directory_sources + self._search_sources(region, industry, depth=depth)
        if region == "International":
            if not is_apparel:
                return signal_sources + self._search_sources(region, industry, depth=depth)
            seed_sources = [
                DiscoverySource(
                    name="seed-usa-buyer-intent-pages",
                    url="seed://usa-buyer-intent-pages",
                    selectors=(),
                    discovery_method="curated_seed",
                    candidate_kind="seed_list",
                ),
                DiscoverySource(
                    name="seed-uk-buyer-intent-pages",
                    url="seed://uk-buyer-intent-pages",
                    selectors=(),
                    discovery_method="curated_seed",
                    candidate_kind="seed_list",
                ),
                DiscoverySource(
                    name="seed-europe-buyer-intent-pages",
                    url="seed://europe-buyer-intent-pages",
                    selectors=(),
                    discovery_method="curated_seed",
                    candidate_kind="seed_list",
                ),
            ]
            return signal_sources + seed_sources + self._search_sources(region, industry, depth=depth)
        if not is_apparel:
            return signal_sources + self._search_sources(region, industry, depth=depth)
        buyer_intent_sources = [
            DiscoverySource(
                name="seed-europe-buyer-intent-pages",
                url="seed://europe-buyer-intent-pages",
                selectors=(),
                discovery_method="curated_seed",
                candidate_kind="seed_list",
            ),
        ]
        sources = [
            DiscoverySource(
                name="europages-buyer-search",
                url=f"https://www.europages.co.uk/companies/{query}%20importer%20wholesaler%20distributor.html",
                selectors=(
                    "a[href*='http']",
                    "a.company-card__website[href]",
                ),
            ),
        ]
        return signal_sources + buyer_intent_sources + sources + self._search_sources(region, industry, depth=depth)

    def _generate_sources_from_config(self, region, industry):
        """Build DiscoverySource objects from specialist config directory_sources and seed_urls."""
        disc = self.config.get("discovery", {})
        region_key = region.lower()
        sources = []

        # Seed URL sources
        seed_urls = disc.get("seed_urls", {})
        region_seeds = seed_urls.get(region_key, {})
        for category, url_list in region_seeds.items():
            if not isinstance(url_list, list) or not url_list:
                continue
            seed_name = f"seed-{region_key}-{category}"
            sources.append(DiscoverySource(
                name=seed_name,
                url=f"seed://{seed_name}",
                selectors=(),
                discovery_method="curated_seed",
                candidate_kind="seed_list",
            ))

        # Directory sources
        directory_sources = disc.get("directory_sources", {})
        region_dirs = directory_sources.get(region_key, [])
        for ds in region_dirs:
            ds_type = str(ds.get("type", "")).strip().lower()
            ds_url = str(ds.get("url", "")).strip()
            ds_selectors = tuple(str(s or "").strip() for s in ds.get("selectors", []) if str(s or "").strip())
            ds_desc = str(ds.get("description", "")).strip()
            ds_include_dir = bool(ds.get("include_directory_links", False))
            ds_candidate_kind = ds.get("candidate_kind", "website")

            if not ds_url:
                continue

            name = f"{ds_type}-{region_key}-{ds_desc or 'source'}"
            name = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:64]

            sources.append(DiscoverySource(
                name=name,
                url=ds_url,
                selectors=ds_selectors if ds_selectors else ("a[href*='http']",),
                include_directory_links=ds_include_dir,
                discovery_method=ds_type,
                candidate_kind=ds_candidate_kind,
            ))

        return sources

    @staticmethod
    def _is_throttle_or_block_error(text):
        lowered = (text or "").lower()
        return any(
            marker in lowered
            for marker in (
                "err_connection_closed",
                "err_timed_out",
                "timeout",
                "too many requests",
                "429",
                "rate",
                "blocked",
                "captcha",
                "automated queries",
                "unusual traffic",
                "verify you are human",
                "access denied",
            )
        )

    async def _looks_like_block_page(self, page):
        try:
            title = (await page.title() or "").lower()
        except Exception:
            title = ""
        body_text = ""
        try:
            body = await page.query_selector("body")
            if body:
                body_text = ((await body.inner_text()) or "")[:3000].lower()
        except Exception:
            body_text = ""
        signal_text = f"{title}\n{body_text}"
        return self._is_throttle_or_block_error(signal_text)

    def _build_engine_runtime_state(self):
        return {
            engine: {
                "failures": 0,
                "last_request_ts": 0.0,
                "blocked_until_ts": 0.0,
                "requests": 0,
            }
            for engine in self.SEARCH_ENGINE_MIN_DELAY_SECONDS
        }

    async def _wait_for_engine_window(self, page, engine, state):
        if not engine or engine not in state:
            return True
        engine_state = state[engine]
        now = time.monotonic()
        if now < engine_state["blocked_until_ts"]:
            return False
        max_requests = self.SEARCH_ENGINE_MAX_REQUESTS.get(engine, 12)
        if engine_state["requests"] >= max_requests:
            return False
        min_delay = self.SEARCH_ENGINE_MIN_DELAY_SECONDS.get(engine, 4.0)
        elapsed = now - engine_state["last_request_ts"]
        if elapsed < min_delay:
            wait_seconds = min_delay - elapsed + random.uniform(0.4, 1.1)
            await page.wait_for_timeout(int(wait_seconds * 1000))
        return True

    def _record_engine_success(self, engine, state):
        if not engine or engine not in state:
            return
        engine_state = state[engine]
        engine_state["failures"] = 0
        engine_state["last_request_ts"] = time.monotonic()
        engine_state["requests"] += 1

    def _record_engine_failure(self, engine, state):
        if not engine or engine not in state:
            return False
        engine_state = state[engine]
        engine_state["failures"] += 1
        engine_state["last_request_ts"] = time.monotonic()
        engine_state["requests"] += 1
        backoff = self.SEARCH_ENGINE_COOLDOWN_SECONDS.get(engine, 60.0)
        cooldown_multiplier = min(engine_state["failures"], 3)
        engine_state["blocked_until_ts"] = time.monotonic() + backoff * cooldown_multiplier
        return engine_state["failures"] >= 2

    @staticmethod
    async def _emit_discovery_event(callback, **payload):
        if not callback:
            return
        try:
            result = callback(payload)
            if inspect.isawaitable(result):
                await result
        except Exception as callback_exc:
            print(f"Discovery event callback failed: {callback_exc}")

    async def run_discovery(
        self,
        page,
        region,
        industry="clothing brands",
        chunk_size=60,
        on_engine_blocked=None,
        on_discovery_event=None,
        sources=None,
    ):
        print(
            f"Starting discovery for region: {region} | Industry: {industry} | Limit: {self.limit}"
        )
        if sources is None:
            sources = self.generate_sources(region, industry)

        yielded_count = 0
        current_chunk = []
        engine_state = self._build_engine_runtime_state()
        skipped_engines = set()

        for source in sources:
            if yielded_count >= self.limit:
                break
            source_name_lower = source.name.lower()
            source_engine = source.search_engine
            if not source_engine:
                if "bing-" in source_name_lower:
                    source_engine = "bing"
                elif "duckduckgo-" in source_name_lower:
                    source_engine = "duckduckgo"
                elif "yahoo-" in source_name_lower:
                    source_engine = "yahoo"
            if source_engine in skipped_engines:
                print(f"Skipping {source.name} due to repeated {source_engine} failures earlier in this run.")
                await self._emit_discovery_event(
                    on_discovery_event,
                    event="engine_source_skipped",
                    engine=source_engine or "",
                    source_name=source.name,
                    source_url=source.url,
                    reason="repeated_failures",
                )
                continue
            if source_engine and source_engine in engine_state:
                allowed = await self._wait_for_engine_window(page, source_engine, engine_state)
                if not allowed:
                    skipped_engines.add(source_engine)
                    print(
                        f"Skipping remaining {source_engine} sources due to request budget/cooldown limits "
                        "for this run."
                    )
                    await self._emit_discovery_event(
                        on_discovery_event,
                        event="engine_source_skipped",
                        engine=source_engine,
                        source_name=source.name,
                        source_url=source.url,
                        reason="budget_or_cooldown",
                    )
                    continue
            if source.candidate_kind == "direct_url":
                candidate = self._candidate_from_url(source.url, source, region, industry)
                if candidate:
                    current_chunk.append(candidate)
                    if len(current_chunk) >= chunk_size:
                        yield current_chunk
                        yielded_count += len(current_chunk)
                        current_chunk = []
                print(
                    f"Discovery progress: {yielded_count + len(current_chunk)} total candidates (+{1 if candidate else 0} from {source.name})"
                )
                if current_chunk and yielded_count < self.limit:
                    remaining = self.limit - yielded_count
                    batch = current_chunk[:remaining]
                    current_chunk = current_chunk[remaining:]
                    yielded_count += len(batch)
                    yield batch
                continue
            if source.candidate_kind == "seed_list":
                found_in_source = 0
                for seed_url in self.seed_urls(region, source.name):
                    candidate = self._candidate_from_url(seed_url, source, region, industry)
                    if not candidate:
                        continue
                    current_chunk.append(candidate)
                    found_in_source += 1
                    if len(current_chunk) >= chunk_size:
                        yield current_chunk
                        yielded_count += len(current_chunk)
                        current_chunk = []
                        if yielded_count >= self.limit:
                            break
                print(
                    f"Discovery progress: {yielded_count + len(current_chunk)} total candidates (+{found_in_source} from {source.name})"
                )
                if current_chunk and yielded_count < self.limit:
                    remaining = self.limit - yielded_count
                    batch = current_chunk[:remaining]
                    current_chunk = current_chunk[remaining:]
                    yielded_count += len(batch)
                    yield batch
                continue
            print(f"Visiting discovery source: {source.url}")
            await self._emit_discovery_event(
                on_discovery_event,
                event="source_visit_started",
                engine=source_engine or "",
                source_name=source.name,
                source_url=source.url,
                discovery_method=source.discovery_method,
            )
            found_in_source = 0
            try:
                await page.goto(source.url, timeout=45000, wait_until="domcontentloaded")
                blocked_page = await self._looks_like_block_page(page)
                if blocked_page:
                    rotated = False
                    if on_engine_blocked and source_engine:
                        try:
                            rotated = bool(
                                await on_engine_blocked(
                                    source_engine,
                                    source.url,
                                    "blocked_page",
                                )
                            )
                        except Exception as callback_exc:
                            print(f"Engine blocked callback failed for {source_engine}: {callback_exc}")
                    if rotated:
                        if source_engine in engine_state:
                            engine_state[source_engine]["failures"] = 0
                            engine_state[source_engine]["blocked_until_ts"] = 0.0
                        skipped_engines.discard(source_engine)
                        print(f"Rotated proxy after blocked page for {source_engine}; continuing discovery.")
                        await self._emit_discovery_event(
                            on_discovery_event,
                            event="proxy_rotated",
                            engine=source_engine or "",
                            source_name=source.name,
                            source_url=source.url,
                            reason="blocked_page",
                        )
                    elif self._record_engine_failure(source_engine, engine_state):
                        skipped_engines.add(source_engine)
                        print(
                            f"{source_engine.title()} circuit breaker activated after repeated blocking pages; "
                            "continuing with remaining sources."
                        )
                        await self._emit_discovery_event(
                            on_discovery_event,
                            event="engine_circuit_breaker",
                            engine=source_engine or "",
                            source_name=source.name,
                            source_url=source.url,
                            reason="blocked_page",
                        )
                    continue
                self._record_engine_success(source_engine, engine_state)
                await page.wait_for_timeout(random.randint(1500, 3000))
                links = await self._extract_links_from_source(page, source)
                for raw_href in links:
                    clean_url = self._clean_candidate_url(raw_href, source.url)
                    if not clean_url:
                        continue
                    candidate = self._candidate_from_url(clean_url, source, region, industry)
                    if not candidate:
                        continue

                    current_chunk.append(candidate)
                    found_in_source += 1
                    if len(current_chunk) >= chunk_size:
                        yield current_chunk
                        yielded_count += len(current_chunk)
                        current_chunk = []
                        if yielded_count >= self.limit:
                            break
            except Exception as exc:
                print(f"Error visiting {source.url}: {exc}")
                error_text = str(exc).lower()
                if self._is_throttle_or_block_error(error_text):
                    rotated = False
                    if on_engine_blocked and source_engine:
                        try:
                            rotated = bool(
                                await on_engine_blocked(
                                    source_engine,
                                    source.url,
                                    error_text[:180],
                                )
                            )
                        except Exception as callback_exc:
                            print(f"Engine blocked callback failed for {source_engine}: {callback_exc}")
                    if rotated:
                        if source_engine in engine_state:
                            engine_state[source_engine]["failures"] = 0
                            engine_state[source_engine]["blocked_until_ts"] = 0.0
                        skipped_engines.discard(source_engine)
                        print(f"Rotated proxy after {source_engine} failure; continuing discovery.")
                        await self._emit_discovery_event(
                            on_discovery_event,
                            event="proxy_rotated",
                            engine=source_engine or "",
                            source_name=source.name,
                            source_url=source.url,
                            reason="engine_failure",
                        )
                    elif self._record_engine_failure(source_engine, engine_state):
                        skipped_engines.add(source_engine)
                        print(
                            f"{source_engine.title()} circuit breaker activated after repeated connection/rate-limit failures; "
                            "continuing with remaining sources."
                        )
                        await self._emit_discovery_event(
                            on_discovery_event,
                            event="engine_circuit_breaker",
                            engine=source_engine or "",
                            source_name=source.name,
                            source_url=source.url,
                            reason=error_text[:180],
                        )

            print(
                f"Discovery progress: {yielded_count + len(current_chunk)} total candidates (+{found_in_source} from {source.name})"
            )
            await self._emit_discovery_event(
                on_discovery_event,
                event="source_visit_completed",
                engine=source_engine or "",
                source_name=source.name,
                source_url=source.url,
                found_count=found_in_source,
                total_candidates=yielded_count + len(current_chunk),
            )
            if current_chunk and yielded_count < self.limit:
                remaining = self.limit - yielded_count
                batch = current_chunk[:remaining]
                current_chunk = current_chunk[remaining:]
                yielded_count += len(batch)
                yield batch

        if current_chunk and yielded_count < self.limit:
            remaining = self.limit - yielded_count
            yield current_chunk[:remaining]

    def _seed_urls_from_config(self, region, source_name):
        """Look up seed URLs from specialist config."""
        seed_urls_cfg = self.config.get("discovery", {}).get("seed_urls", {})
        region_cfg = seed_urls_cfg.get(region.lower(), {})
        # source_name format: "seed-{region}-{category}" e.g. "seed-usa-buyer-intent-pages"
        parts = source_name.split("-", 2)
        category = parts[2] if len(parts) > 2 else source_name
        urls = region_cfg.get(category, [])
        if not urls and category == "apparel-buyers":
            urls = region_cfg.get("apparel_buyers", [])
        if not urls and category == "buyer-intent-pages":
            urls = region_cfg.get("buyer_intent", [])
        if isinstance(urls, list):
            return [str(u.get("url", "") or u if isinstance(u, dict) else str(u or "")).strip()
                    for u in urls if (isinstance(u, dict) and u.get("url")) or (isinstance(u, str) and u.strip())]
        return []

    def seed_urls(self, region, source_name="seed-usa-apparel-buyers"):
        region = LeadDiscovery._canonical_region(region)

        # Config-driven path
        if self.config:
            return self._seed_urls_from_config(region, source_name)
        return LeadDiscovery._seed_urls_legacy(region, source_name)

    @staticmethod
    def _seed_urls_legacy(region, source_name):
        region = LeadDiscovery._canonical_region(region)
        if region == "International":
            if source_name.startswith("seed-usa"):
                return LeadDiscovery._seed_urls_legacy("USA", source_name)
            if source_name.startswith("seed-uk"):
                return LeadDiscovery._seed_urls_legacy("UK", source_name)
            if source_name.startswith("seed-europe"):
                return LeadDiscovery._seed_urls_legacy("Europe", source_name)
            return []
        if region == "UK":
            buyer_intent_urls = [
                "https://www.nextplc.co.uk/suppliers",
                "https://www.marksandspencer.com/c/suppliers",
                "https://www.johnlewispartnership.co.uk/work-with-us/suppliers.html",
                "https://corporate.primark.com/en-gb/our-products/suppliers",
                "https://www.asosplc.com/fashion-with-integrity/our-supply-chain/",
                "https://www.dunelm.com/info/about/suppliers",
                "https://www.jdsports.co.uk/page/supplier-information/",
                "https://www.sportsdirect.com/customerservices/otherinformation/suppliers",
            ]
            apparel_buyer_urls = [
                "https://www.whisperingsmith.com/pages/contact-us",
                "https://www.qclothing.co.uk/contact-us",
                "https://www.parisian.co.uk/contact-us",
                "https://www.citygoddess.co.uk/contact-us",
                "https://www.europafashions.co.uk/contact-us",
                "https://www.j5fashion.com/contact-us",
                "https://www.catwalkwholesale.com/contact-us",
                "https://www.influencefashion.co.uk/pages/contact-us",
                "https://www.stylewise-direct.com/contact-us",
                "https://www.fashion-book.com/contact-us",
                "https://www.missyempire.com/pages/contact-us",
                "https://www.boohoo.com/page/contact-us.html",
                "https://www.prettylittlething.com/contact-us",
                "https://www.riverisland.com/contact-us",
                "https://www.newlook.com/uk/help/contact-us",
            ]
            if source_name == "seed-uk-buyer-intent-pages":
                return buyer_intent_urls
            if source_name == "seed-uk-apparel-buyers":
                return apparel_buyer_urls
            return []
        if region == "Europe" and source_name == "seed-europe-buyer-intent-pages":
            return [
                "https://partnerportal.zalando.com/",
                "https://www.zalando.com/supplier/",
                "https://www.aboutyou.com/",
                "https://www.asos.com/",
                "https://www.decathlon.com/",
                "https://www.intersport.com/",
                "https://www.inditex.com/",
                "https://www.bestseller.com/",
                "https://www2.hm.com/",
                "https://www.c-and-a.com/",
                "https://www.primark.com/",
                "https://www.next.co.uk/",
                "https://www.sportsdirect.com/",
                "https://www.jdsports.co.uk/",
                "https://www.otto.de/",
                "https://www.galeria.de/",
                "https://www.elcorteingles.es/",
                "https://www.laredoute.com/",
                "https://www.bonprix.com/",
                "https://www.spartoo.com/",
            ]
        if region != "USA":
            return []
        buyer_intent_urls = [
            "https://www.ssactivewear.com/contact",
            "https://www.alphabroder.com/pages/contact-us",
            "https://www.sanmar.com/contactus/",
            "https://www.tscapparel.com/contact",
            "https://www.bodekandrhodes.com/contact-us",
            "https://www.apparelcandy.com/pages/contact-us",
            "https://www.wholesalefashionsquare.com/pages/contact-us",
            "https://www.bloomwholesale.com/pages/contact-us",
            "https://www.orangeshine.com/contact-us",
            "https://www.lashowroom.com/contact",
            "https://www.kohls.com/feature/supplier-information.jsp",
            "https://corporate.target.com/suppliers",
            "https://www.costco.com/vendor-inquiries.html",
            "https://www.burlington.com/vendors/",
            "https://www.rossstores.com/contact-us/vendors/",
            "https://www.tjx.com/responsibility/responsible-business/vendor-relations",
            "https://www.belk.com/suppliers/",
            "https://www.nordstromsupplier.com/",
            "https://www.macysnet.com/",
        ]
        if source_name == "seed-usa-buyer-intent-pages":
            return buyer_intent_urls
        return [
            "https://www.spirithoods.com/",
            "https://teancup.com/",
            "https://www.mensusa.com/",
            "https://mezonhandbags.com/",
            "https://www.laapparelstore.com/",
            "https://www.stevenalan.com/",
            "https://www.urbanoutfitters.com/",
            "https://www.jamesperse.com/",
            "https://www.bedheadpjs.com/",
            "https://www.fashiongo.net/",
            "https://www.appareldeals.com/",
            "https://724fashion.com/",
            "https://www.dnaclothing.com/",
            "https://www.apparelzoo.com/",
            "https://www.farfetch.com/",
            "https://www.laroseboutique.com/",
            "https://www.americanapparel.com/",
            "https://www.revolve.com/",
            "https://www.freepeople.com/",
            "https://www.nordstrom.com/",
            "https://www.macys.com/",
            "https://www.bloomingdales.com/",
            "https://www.saksfifthavenue.com/",
            "https://www.anthropologie.com/",
            "https://www.tillys.com/",
            "https://www.pacsun.com/",
            "https://www.zumiez.com/",
            "https://www.backcountry.com/",
            "https://www.rei.com/",
            "https://www.dickssportinggoods.com/",
        ]
