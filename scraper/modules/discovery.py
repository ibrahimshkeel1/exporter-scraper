import base64
import binascii
import random
import re
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
    )
    EXCLUDED_ROOT_DOMAINS = {
        "cloudflare.com",
        "localsearch.com",
        "networkadvertising.org",
        "nike.com",
        "thryv.com",
        "baidu.com",
        "zhihu.com",
        "cookie-script.com",
        "merriam-webster.com",
        "visable.com",
    }
    EXCLUDED_PATH_PARTS = (
        "/cart",
        "/checkout",
        "/cdn-cgi/",
        "/cookie",
        "/login",
        "/privacy",
        "/search",
        "/terms",
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

    def __init__(self, limit=30, search_terms=None, signal_map=None):
        self.limit = limit
        self.search_terms = [term for term in (search_terms or []) if term]
        self.signal_map = signal_map or {}
        self.seen_domains = set()

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
        if domain in self.EXCLUDED_ROOT_DOMAINS:
            return False
        if any(part in host for part in self.EXCLUDED_HOST_PARTS):
            return False
        path = parsed.path.lower()
        if any(part in path for part in self.EXCLUDED_PATH_PARTS):
            return False
        if source.include_directory_links:
            return True
        return host != (urlsplit(source.url).hostname or "").lower()

    def _candidate_from_url(self, clean_url, source, region, industry):
        if not self._is_valid_candidate_url(clean_url, source):
            return None

        if source.candidate_kind == "directory_profile":
            parsed = urlsplit(clean_url)
            source_host = (urlsplit(source.url).hostname or "").lower()
            if (parsed.hostname or "").lower() != source_host:
                return None
            if not parsed.path.startswith("/go/"):
                return None
            profile_key = parsed.path.strip("/").replace("/", ":")
            domain = f"{source.name}:{profile_key}"
            if domain in self.seen_domains:
                return None
            self.seen_domains.add(domain)
            return {
                "url": clean_url,
                "discovery_url": clean_url,
                "domain": domain,
                "source_name": source.name,
                "source_url": source.url,
                "discovery_method": source.discovery_method,
                "candidate_kind": source.candidate_kind,
                "needs_website_resolution": True,
                "region": region,
                "industry": industry,
            }

        domain = self._normalize_domain(clean_url)
        if not domain or domain in self.seen_domains:
            return None
        if not self._is_target_region_domain(domain, region):
            return None

        homepage_url = self._canonical_homepage_url(clean_url)
        if not homepage_url:
            return None

        self.seen_domains.add(domain)
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

    def _signal_search_sources(self, region, industry):
        signals = self.signal_map.get("signals", []) if isinstance(self.signal_map, dict) else []
        if not signals:
            return []
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
            for query in queries[:4]:
                encoded = quote_plus(query)
                for page_number, first in enumerate((1, 11), start=1):
                    sources.append(
                        DiscoverySource(
                            name=f"signal-bing-p{page_number}-{signal_slug}",
                            url=f"https://www.bing.com/search?q={encoded}&first={first}",
                            selectors=(
                                "li.b_algo h2 a[href]",
                                "ol#b_results a[href]",
                                "a[href*='http']",
                            ),
                            discovery_method="signal_search",
                            signal_detected=signal_name,
                            signal_confidence=confidence,
                            why_now=why_now,
                        )
                    )
        return sources

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

    @staticmethod
    def _is_apparel_industry(industry):
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

    @staticmethod
    def _target_markets(region):
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
        base = self._product_seed(industry)
        markets = self._target_markets(region)
        market = markets[0]
        supplied_queries = []
        is_apparel = self._is_apparel_industry(industry)
        is_architecture = self._is_architecture_industry(industry)
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
            supplied_queries.append(f"{normalized} contact email")
            if region == "International" and not mentions_market:
                for extra_market in markets[1:4]:
                    supplied_queries.append(f"{term.strip()} {extra_market} contact email")

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
        else:
            default_queries = [
                f'"{base}" "{market}" projects contact email',
                f'"{base}" "{market}" companies contact',
                f'"{base}" "{market}" firms contact',
                f'"{base}" "{market}" services contact',
                f'"{base}" "{market}" request proposal',
                f'"{base}" "{market}" procurement vendor contact',
                f'"{base}" "{market}" partnerships contact',
                f'"{base}" "{market}" decision maker contact',
            ]
            if is_architecture:
                default_queries.extend(
                    [
                        f'"{base}" "{market}" commercial real estate developer contact',
                        f'"{base}" "{market}" hospitality project design consultant contact',
                        f'"{base}" "{market}" office fit out request for proposal',
                        f'"{base}" "{market}" architecture tender procurement contact',
                        f'"{base}" "{market}" interior design firm project inquiry',
                        f'"{base}" "{market}" mixed use development architect contact',
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
                            f'"{base}" "{country}" projects contact email',
                            f'"{base}" "{country}" companies contact',
                            f'"{base}" "{country}" procurement vendor contact',
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
                elif is_architecture:
                    default_queries.extend(
                        [
                            f'"{base}" "{country}" architecture project request proposal',
                            f'"{base}" "{country}" property developer design consultancy contact',
                            f'"{base}" "{country}" commercial interior design project contact',
                        ]
                    )
                else:
                    default_queries.extend(
                        [
                            f'"{base}" "{country}" projects contact email',
                            f'"{base}" "{country}" procurement vendor contact',
                        ]
                    )

        return list(dict.fromkeys(supplied_queries + default_queries))

    def _search_sources(self, region, industry):
        sources = []
        is_apparel = self._is_apparel_industry(industry)
        is_architecture = self._is_architecture_industry(industry)
        for query in self._buyer_search_queries(region, industry):
            slug = self._slug(query)
            encoded = quote_plus(query)
            if is_apparel:
                if region in {"Europe", "International"}:
                    bing_pages = (1, 11, 21)
                else:
                    bing_pages = (1, 11, 21, 31, 41)
            elif is_architecture:
                # Architecture searches trigger anti-bot controls quickly on Bing,
                # so keep pages shallow and rely on more query variety.
                bing_pages = (1, 11)
            elif region in {"Europe", "International"}:
                bing_pages = (1, 11, 21)
            else:
                bing_pages = (1, 11, 21)
            # DuckDuckGo's HTML endpoint frequently stalls under Playwright on
            # the VPS, which blocks discovery before curated sources run.
            duckduckgo_pages = ()
            for page_number, first in enumerate(bing_pages, start=1):
                sources.append(
                    DiscoverySource(
                        name=f"bing-p{page_number}-{slug}",
                        url=f"https://www.bing.com/search?q={encoded}&first={first}",
                        selectors=(
                            "li.b_algo h2 a[href]",
                            "ol#b_results a[href]",
                            "a[href*='http']",
                        ),
                        discovery_method="search",
                    )
                )
            for page_number, offset in enumerate(duckduckgo_pages, start=1):
                sources.append(
                    DiscoverySource(
                        name=f"duckduckgo-p{page_number}-{slug}",
                        url=f"https://duckduckgo.com/html/?q={encoded}&s={offset}",
                        selectors=(
                            "a.result__a[href]",
                            "a[href*='uddg=']",
                            "a[href*='http']",
                        ),
                        discovery_method="search",
                    )
                )
        return sources

    def generate_sources(self, region, industry):
        region = self._canonical_region(region)
        signal_sources = self._signal_search_sources(region, industry)
        query = quote_plus(self._product_seed(industry))
        is_apparel = self._is_apparel_industry(industry)
        if region == "USA":
            if not is_apparel:
                return signal_sources + self._search_sources(region, industry)
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
            return signal_sources + buyer_intent_sources + directory_sources + self._search_sources(region, industry)
        if region == "UK":
            if not is_apparel:
                architecture_seed_sources = []
                if self._is_architecture_industry(industry):
                    architecture_seed_sources = [
                        DiscoverySource(
                            name="seed-uk-retail-restaurant-industrial-growth",
                            url="seed://uk-retail-restaurant-industrial-growth",
                            selectors=(),
                            discovery_method="curated_seed",
                            candidate_kind="seed_list",
                        ),
                    ]
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
                return signal_sources + architecture_seed_sources + directory_sources + self._search_sources(region, industry)
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
            return signal_sources + buyer_intent_sources + directory_sources + self._search_sources(region, industry)
        if region == "International":
            if not is_apparel:
                return signal_sources + self._search_sources(region, industry)
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
            return signal_sources + seed_sources + self._search_sources(region, industry)
        if not is_apparel:
            return signal_sources + self._search_sources(region, industry)
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
        return signal_sources + buyer_intent_sources + sources + self._search_sources(region, industry)

    async def run_discovery(self, page, region, industry="clothing brands", chunk_size=60):
        print(
            f"Starting discovery for region: {region} | Industry: {industry} | Limit: {self.limit}"
        )
        sources = self.generate_sources(region, industry)

        yielded_count = 0
        current_chunk = []
        bing_failures = 0
        skip_bing = False

        for source in sources:
            if yielded_count >= self.limit:
                break
            source_name_lower = source.name.lower()
            if skip_bing and "bing-" in source_name_lower:
                print(f"Skipping {source.name} due to repeated Bing failures earlier in this run.")
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
            found_in_source = 0
            try:
                await page.goto(source.url, timeout=45000, wait_until="domcontentloaded")
                if "bing-" in source_name_lower:
                    bing_failures = 0
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
                if "bing-" in source_name_lower and any(
                    marker in error_text
                    for marker in ("err_connection_closed", "too many requests", "429", "rate")
                ):
                    bing_failures += 1
                    if bing_failures >= 3:
                        skip_bing = True
                        print(
                            "Bing circuit breaker activated after repeated connection/rate-limit failures; "
                            "continuing with non-Bing sources."
                        )

            print(
                f"Discovery progress: {yielded_count + len(current_chunk)} total candidates (+{found_in_source} from {source.name})"
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

    @staticmethod
    def seed_urls(region, source_name="seed-usa-apparel-buyers"):
        region = LeadDiscovery._canonical_region(region)
        if region == "International":
            if source_name.startswith("seed-usa"):
                return LeadDiscovery.seed_urls("USA", source_name)
            if source_name.startswith("seed-uk"):
                return LeadDiscovery.seed_urls("UK", source_name)
            if source_name.startswith("seed-europe"):
                return LeadDiscovery.seed_urls("Europe", source_name)
            return []
        if region == "UK":
            if source_name == "seed-uk-retail-restaurant-industrial-growth":
                return [
                    "https://www.pret.co.uk/en-GB/contact-us",
                    "https://www.costa.co.uk/contact-us",
                    "https://www.caffenero.com/uk/contact/",
                    "https://www.greggs.co.uk/contact-us",
                    "https://www.leon.co/contact",
                    "https://www.itsu.com/contact-us",
                    "https://www.wagamama.com/contact-us",
                    "https://www.pizzapilgrims.co.uk/contact",
                    "https://www.dishoom.com/contact/",
                    "https://www.nandos.co.uk/contact-us",
                    "https://www.burgerking.co.uk/contact-us",
                    "https://www.fiveguys.co.uk/contact-us",
                    "https://www.subway.com/en-gb/contactus",
                    "https://www.dominos.co.uk/contact-us",
                    "https://www.papajohns.co.uk/contact-us",
                    "https://www.mcdonalds.com/gb/en-gb/help/faq/contact-us.html",
                    "https://www.kfc.co.uk/help/contact-us",
                    "https://www.tortila.co.uk/contact-us",
                    "https://www.zizzi.co.uk/contact",
                    "https://www.pizzahut.co.uk/contact-us",
                    "https://www.askitalian.co.uk/contact-us",
                    "https://www.gbk.co.uk/contact",
                    "https://www.bone-daddies.com/contact",
                    "https://www.sushidog.com/pages/contact",
                    "https://www.ikea.com/gb/en/customer-service/contact-us/",
                    "https://www.dunelm.com/info/contact-us",
                    "https://www.bmstores.co.uk/contact-us",
                    "https://www.theworks.co.uk/contactus",
                    "https://www.petsathome.com/contact-us",
                    "https://www.halfords.com/customer-services/contact-us/",
                    "https://www.toolstation.com/contact-us",
                    "https://www.wickes.co.uk/help-and-support/contact-us",
                    "https://www.screwfix.com/help/contact-us",
                    "https://www.diy.com/customer-support/contact-us",
                    "https://www.currys.co.uk/services/contact-us.html",
                    "https://www.argos.co.uk/help/contact-us/",
                    "https://www.jysk.co.uk/customer-service/contact",
                    "https://www.bensonsforbeds.co.uk/contact-us/",
                    "https://www.benscookies.com/pages/contact-us",
                    "https://www.hotelchocolat.com/uk/help/contact-us.html",
                    "https://www.poundland.co.uk/contact-us",
                    "https://www.iceland.co.uk/customer-support",
                    "https://www.spar.co.uk/contact/",
                    "https://www.coop.co.uk/get-in-touch",
                    "https://www.marksandspencer.com/c/help/contact-us",
                    "https://www.tesco.com/help/contact/",
                    "https://www.sainsburys.co.uk/help/contact-us",
                    "https://www.waitrose.com/ecom/help-information/customer-service",
                    "https://www.asda.com/help/contact-us",
                    "https://www.ocado.com/webshop/customer-service/contact-us",
                    "https://www.aldi.co.uk/contact",
                    "https://www.lidl.co.uk/c/customer-services/s10019520",
                    "https://www.petsathome.com/shop/en/pets/store-locator",
                    "https://www.travisperkins.co.uk/contact-us",
                    "https://www.jewson.co.uk/contact-us",
                    "https://www.sigplc.com/contact-us",
                    "https://www.cef.co.uk/help/contact-us",
                    "https://www.cityplumbing.co.uk/help/contact-us",
                    "https://www.premierinn.com/gb/en/contact.html",
                ]
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
