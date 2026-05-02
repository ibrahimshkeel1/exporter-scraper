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

    def __init__(self, limit=30):
        self.limit = limit
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
            "region": region,
            "industry": industry,
        }

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
            "home textile",
            "activewear",
            "sportswear",
            "streetwear",
            "apparel",
            "clothing",
            "garment",
            "textile",
            "fabric",
            "fashion",
            "denim",
            "towel",
            "leather",
        )
        for term in product_terms:
            if term in lowered:
                return term
        return industry.strip() or "apparel"

    def _buyer_search_queries(self, region, industry):
        base = self._product_seed(industry)
        market = {
            "USA": "United States",
            "UK": "United Kingdom",
            "Europe": "Europe",
        }.get(region, region)
        return [
            f'{base} importer wholesaler distributor "{market}" contact -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'{base} wholesale buyer retailer "{market}" contact email -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'{base} private label clothing brand sourcing "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'{base} procurement vendor application retailer "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'{base} boutique retailer wholesale distributor "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'"{base} importer" "{market}" "contact" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'"{base} wholesaler" "{market}" "contact" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'"{base} distributor" "{market}" "contact" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'"{base} retailer" "vendor application" "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
            f'"{base} brand" "wholesale" "contact" "{market}" -Pakistan -India -Bangladesh -China -manufacturer -factory -exporter',
        ]

    def _search_sources(self, region, industry):
        sources = []
        for query in self._buyer_search_queries(region, industry):
            slug = self._slug(query)
            encoded = quote_plus(query)
            for page_number, first in enumerate((1, 11, 21, 31, 41), start=1):
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
            for page_number, offset in enumerate((0, 30, 60), start=1):
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
        query = quote_plus(self._product_seed(industry))
        if region == "USA":
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
            return buyer_intent_sources + self._search_sources(region, industry) + directory_sources
        if region == "UK":
            sources = [
                DiscoverySource(
                    name="yell-buyer-search",
                    url=f"https://www.yell.com/ucs/UcsSearchAction.do?keywords={query}+importer+wholesaler+distributor&location=UK",
                    selectors=(
                        "a.businessCapsule--ctaItem[href]",
                        "a[data-tracking*='website'][href]",
                    ),
                ),
            ]
            return sources + self._search_sources(region, industry)
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
        return sources + self._search_sources(region, industry)

    async def run_discovery(self, page, region, industry="clothing brands"):
        print(
            f"Starting discovery for region: {region} | Industry: {industry} | Limit: {self.limit}"
        )
        sources = self.generate_sources(region, industry)

        candidates = []
        for source in sources:
            if len(candidates) >= self.limit:
                break
            if source.candidate_kind == "seed_list":
                found_in_source = 0
                for seed_url in self.seed_urls(region, source.name):
                    candidate = self._candidate_from_url(seed_url, source, region, industry)
                    if not candidate:
                        continue
                    candidates.append(candidate)
                    found_in_source += 1
                    if len(candidates) >= self.limit:
                        break
                print(
                    f"Discovery progress: {len(candidates)} total candidates (+{found_in_source} from {source.name})"
                )
                continue
            print(f"Visiting discovery source: {source.url}")
            found_in_source = 0
            try:
                await page.goto(source.url, timeout=45000, wait_until="domcontentloaded")
                await page.wait_for_timeout(random.randint(1500, 3000))
                links = await self._extract_links_from_source(page, source)
                for raw_href in links:
                    clean_url = self._clean_candidate_url(raw_href, source.url)
                    if not clean_url:
                        continue
                    candidate = self._candidate_from_url(clean_url, source, region, industry)
                    if not candidate:
                        continue

                    candidates.append(candidate)
                    found_in_source += 1
                    if len(candidates) >= self.limit:
                        break
            except Exception as exc:
                print(f"Error visiting {source.url}: {exc}")

            print(
                f"Discovery progress: {len(candidates)} total candidates (+{found_in_source} from {source.name})"
            )

        return candidates[: self.limit]

    @staticmethod
    def seed_urls(region, source_name="seed-usa-apparel-buyers"):
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
