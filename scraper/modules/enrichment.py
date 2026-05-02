import asyncio
import re
from urllib.parse import unquote, urljoin, urlsplit

from bs4 import BeautifulSoup

class LeadEnrichment:
    BAD_EMAIL_MARKERS = (
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        "sentry",
        "example.com",
        "wix.com",
        "wixpress.com",
        "mysite.com",
        "yourdomain",
        "domain.com",
        "email.com",
        "noreply@",
        "no-reply@",
        "donotreply@",
    )
    REJECTED_PREFIXES = (
        "abuse",
        "careers",
        "career",
        "donotreply",
        "hr",
        "jobs",
        "legal",
        "media",
        "no-reply",
        "noreply",
        "postmaster",
        "press",
        "privacy",
        "recruiting",
        "webmaster",
    )
    HIGH_QUALITY_PREFIXES = (
        "b2b",
        "business",
        "buyer",
        "buyers",
        "export",
        "exports",
        "import",
        "imports",
        "partnerships",
        "privatelabel",
        "procurement",
        "purchase",
        "purchasing",
        "sales",
        "sourcing",
        "supplier",
        "suppliers",
        "trade",
        "vendor",
        "vendors",
        "wholesale",
    )
    GENERIC_BUSINESS_PREFIXES = (
        "admin",
        "contact",
        "customerservice",
        "hello",
        "help",
        "info",
        "office",
        "orders",
        "service",
        "shop",
        "support",
    )
    BUSINESS_FREEMAIL_DOMAINS = (
        "aol.com",
        "gmail.com",
        "hotmail.com",
        "icloud.com",
        "live.com",
        "msn.com",
        "outlook.com",
        "yahoo.com",
    )
    SOCIAL_HOST_MARKERS = ("linkedin.com", "instagram.com", "facebook.com", "tiktok.com")
    NON_COMPANY_OUTBOUND_MARKERS = (
        "fashiondistrict.org",
        "google.",
        "bing.",
        "duckduckgo.",
        "facebook.",
        "instagram.",
        "linkedin.",
        "maps.",
        "pin.it",
        "pinterest",
        "twitter.",
        "x.com",
        "youtube.",
    )
    CONTACT_PATH_HINTS = (
        "about",
        "b2b",
        "become-a-vendor",
        "business",
        "buyers",
        "company",
        "connect",
        "contact",
        "distributor",
        "import",
        "line-sheet",
        "procurement",
        "reach-us",
        "retail",
        "sourcing",
        "stockist",
        "supplier",
        "team",
        "trade",
        "vendor",
        "wholesale",
    )
    HIGH_VALUE_PATH_HINTS = (
        "b2b",
        "become-a-vendor",
        "buyers",
        "distributor",
        "import",
        "line-sheet",
        "procurement",
        "sourcing",
        "supplier",
        "trade",
        "vendor",
        "wholesale",
    )
    NON_CONTACT_FORM_MARKERS = (
        "add-to-cart",
        "addtocart",
        "cart",
        "checkout",
        "customer_login",
        "login",
        "newsletter",
        "password",
        "search",
        "subscribe",
    )
    LIKELY_PATHS = (
        "/contact",
        "/contact-us",
        "/pages/contact",
        "/pages/contact-us",
        "/about",
        "/about-us",
        "/brands",
        "/wholesale",
        "/pages/wholesale",
        "/pages/wholesale-account",
        "/pages/wholesale-inquiries",
        "/trade",
        "/b2b",
        "/vendors",
        "/vendor",
        "/vendor-info",
        "/vendor-information",
        "/vendor-relations",
        "/vendor-registration",
        "/vendor-portal",
        "/become-a-vendor",
        "/suppliers",
        "/supplier",
        "/supplier-information",
        "/supplier-registration",
        "/supplier-relations",
        "/supplier-portal",
        "/supplier-requirements",
        "/sourcing",
        "/procurement",
        "/purchasing",
        "/buying",
        "/partnerships",
        "/stockists",
        "/retailers",
        "/private-label",
        "/our-suppliers",
        "/suppliers",
        "/supplierdiversity",
        "/m/getting-started",
        "/m/contact-info",
        "/m/supplier-diversity-overview",
        "/sustainability-governance/responsible-supply-chains/suppliers",
        "/suppliers/apply-to-be-a-supplier",
        "/suppliers/requirements",
        "/browse/impact/people/responsible-sourcing",
    )
    MULTI_LEVEL_SUFFIXES = {
        "ac.uk",
        "co.in",
        "co.jp",
        "co.kr",
        "co.nz",
        "co.uk",
        "com.au",
        "com.br",
        "com.hk",
        "com.mx",
        "com.my",
        "com.ph",
        "com.pk",
        "com.sg",
        "gov.uk",
        "net.au",
        "org.au",
        "org.uk",
    }

    def __init__(
        self,
        concurrency=8,
        retries=2,
        request_timeout=20,
        max_extra_pages=8,
        browser_context=None,
        stealth=None,
        browser_fallback_concurrency=2,
    ):
        self.semaphore = asyncio.Semaphore(concurrency)
        self.browser_semaphore = asyncio.Semaphore(browser_fallback_concurrency)
        self.retries = retries
        self.request_timeout = request_timeout
        self.max_extra_pages = max_extra_pages
        self.browser_context = browser_context
        self.stealth = stealth
        self.email_regex = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

    async def fetch_page_with_browser(self, url):
        if not self.browser_context:
            return None

        async with self.browser_semaphore:
            page = await self.browser_context.new_page()
            try:
                if self.stealth:
                    await self.stealth.apply_stealth_async(page)
                response = await page.goto(
                    url,
                    timeout=self.request_timeout * 1000,
                    wait_until="domcontentloaded",
                )
                await page.wait_for_timeout(1200)
                html = await page.content()
                status = response.status if response else 0
                return {
                    "ok": 200 <= status < 300 and bool(html),
                    "status": status,
                    "url": page.url,
                    "html": html,
                    "error": "",
                }
            except Exception as exc:
                return {
                    "ok": False,
                    "status": 0,
                    "url": url,
                    "html": "",
                    "error": f"browser fallback failed: {exc}",
                }
            finally:
                await page.close()

    async def fetch_page(self, session, url):
        """Fetch a URL with retries and structured status reporting."""
        attempt = 0
        last_error = None
        while attempt <= self.retries:
            attempt += 1
            try:
                async with session.get(url, timeout=self.request_timeout) as response:
                    body = await response.text(errors="ignore")
                    result = {
                        "ok": 200 <= response.status < 300,
                        "status": response.status,
                        "url": str(response.url),
                        "html": body,
                        "error": "",
                    }
                    if response.status in {403, 429, 503} and self.browser_context:
                        browser_result = await self.fetch_page_with_browser(str(response.url))
                        if browser_result and browser_result["ok"]:
                            return browser_result
                    return result
            except Exception as exc:
                last_error = str(exc)
                if attempt <= self.retries:
                    await asyncio.sleep(min(2**attempt, 4))

        if self.browser_context:
            browser_result = await self.fetch_page_with_browser(url)
            if browser_result and browser_result["ok"]:
                return browser_result

        return {
            "ok": False,
            "status": 0,
            "url": url,
            "html": "",
            "error": last_error or "Unknown request error",
        }

    def _normalize_email(self, email):
        decoded = unquote(email or "").strip().strip(".,;:()[]<>\"'")
        decoded = decoded.lower()
        return decoded

    def _normalize_domain_value(self, domain):
        host = (domain or "").lower().strip(".")
        if host.startswith("www."):
            host = host[4:]
        labels = [label for label in host.split(".") if label]
        if len(labels) <= 2:
            return ".".join(labels)
        last_two = ".".join(labels[-2:])
        if last_two in self.MULTI_LEVEL_SUFFIXES and len(labels) >= 3:
            return ".".join(labels[-3:])
        return ".".join(labels[-2:])

    def _email_root_domain(self, email):
        if "@" not in email:
            return ""
        return self._normalize_domain_value(email.rsplit("@", 1)[1])

    def _normalize_url_domain(self, url):
        return self._normalize_domain_value(urlsplit(url).hostname or "")

    def _company_tokens(self, candidate_domain):
        root = self._normalize_domain_value(candidate_domain)
        label = root.split(".")[0] if root else ""
        compact = label.replace("-", "").replace("_", "")
        tokens = {piece for piece in re.split(r"[-_]", label) if len(piece) >= 4}
        if len(compact) >= 5:
            tokens.add(compact)
        return tokens

    def filter_emails_for_candidate(self, emails, candidate_domain):
        """Keep only emails likely owned by the candidate, plus branded freemail addresses."""
        accepted = set()
        rejected = set()
        candidate_root = self._normalize_domain_value(candidate_domain)
        company_tokens = self._company_tokens(candidate_domain)

        for raw_email in emails:
            email = self._normalize_email(raw_email)
            if not email or "@" not in email:
                continue
            if any(marker in email for marker in self.BAD_EMAIL_MARKERS):
                rejected.add(email)
                continue

            local_part, email_domain = email.rsplit("@", 1)
            local_key = local_part.split("+", 1)[0].replace(".", "").replace("_", "").replace("-", "")
            prefix = re.split(r"[.+_-]", local_part, maxsplit=1)[0]
            email_root = self._email_root_domain(email)

            if prefix in self.REJECTED_PREFIXES:
                rejected.add(email)
                continue

            if email_root == candidate_root:
                accepted.add(email)
                continue

            if email_domain in self.BUSINESS_FREEMAIL_DOMAINS and any(
                token in local_key for token in company_tokens
            ):
                accepted.add(email)
                continue

            rejected.add(email)

        return sorted(accepted), sorted(rejected)

    def classify_email_quality(self, emails, candidate_domain=None):
        if not emails:
            return "none", []

        candidate_root = self._normalize_domain_value(candidate_domain or "")
        high_quality = []
        generic_business = []
        branded_freemail = []

        for email in emails:
            lowered = self._normalize_email(email)
            local_part, email_domain = lowered.rsplit("@", 1)
            prefix = re.split(r"[.+_-]", local_part, maxsplit=1)[0]
            email_root = self._email_root_domain(lowered)

            if prefix in self.HIGH_QUALITY_PREFIXES and (
                not candidate_root or email_root == candidate_root
            ):
                high_quality.append(email)

            if prefix in self.GENERIC_BUSINESS_PREFIXES and (
                not candidate_root or email_root == candidate_root
            ):
                generic_business.append(email)

            if email_domain in self.BUSINESS_FREEMAIL_DOMAINS:
                branded_freemail.append(email)

        if high_quality:
            return "decision", sorted(set(high_quality))
        if generic_business:
            return "business", []
        if branded_freemail:
            return "branded_freemail", []
        return "low", []

    def extract_data(self, html, base_url):
        """Extract emails, socials, text content, likely contact pages, and forms."""
        if not html:
            return set(), set(), "", set(), set()

        soup = BeautifulSoup(html, 'html.parser')
        text_content = soup.get_text(separator=' ', strip=True).lower()
        
        emails = set()
        for raw_email in self.email_regex.findall(html):
            email = self._normalize_email(raw_email)
            if email and not any(marker in email for marker in self.BAD_EMAIL_MARKERS):
                emails.add(email)

        cleaned_emails = set()
        for email in emails:
            lowered = email.lower()
            if any(marker in lowered for marker in self.BAD_EMAIL_MARKERS):
                continue
            cleaned_emails.add(lowered)
        
        socials = set()
        contact_pages = set()
        contact_forms = set()
        base_host = (urlsplit(base_url).hostname or "").lower()
        base_path = (urlsplit(base_url).path or "").lower()
        for link in soup.find_all('a', href=True):
            href = link['href'].strip()
            full_url = urljoin(base_url, href)
            parsed = urlsplit(full_url)
            if parsed.scheme not in {"http", "https"}:
                continue
            full_url = parsed.geturl()
            host = (parsed.hostname or "").lower()

            if any(marker in host for marker in self.SOCIAL_HOST_MARKERS):
                socials.add(full_url)

            if host == base_host:
                lowered_path = parsed.path.lower()
                if any(hint in lowered_path for hint in self.CONTACT_PATH_HINTS):
                    contact_pages.add(full_url)

        page_is_contact_relevant = any(hint in base_path for hint in self.CONTACT_PATH_HINTS)
        for form in soup.find_all("form"):
            action = (form.get("action") or "").strip()
            form_target = urljoin(base_url, action) if action else base_url
            parsed = urlsplit(form_target)
            if parsed.scheme not in {"http", "https"}:
                continue
            form_text = " ".join(
                [
                    action.lower(),
                    form.get_text(separator=" ", strip=True).lower(),
                    " ".join(
                        (field.get("name") or "").lower()
                        for field in form.find_all(["input", "textarea", "select"])
                    ),
                ]
            )
            form_target_text = form_target.lower()
            if any(marker in form_target_text or marker in form_text for marker in self.NON_CONTACT_FORM_MARKERS):
                continue
            if page_is_contact_relevant or any(hint in form_text for hint in self.CONTACT_PATH_HINTS):
                contact_forms.add(parsed._replace(fragment="").geturl())

        return cleaned_emails, socials, text_content, contact_pages, contact_forms

    def extract_official_links(self, html, base_url):
        if not html:
            return []
        soup = BeautifulSoup(html, "html.parser")
        base_domain = self._normalize_url_domain(base_url)
        links = []
        seen = set()
        for link in soup.find_all("a", href=True):
            raw_href = link["href"].strip()
            full_url = urljoin(base_url, raw_href)
            parsed = urlsplit(full_url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                continue
            domain = self._normalize_domain_value(parsed.hostname)
            host = (parsed.hostname or "").lower()
            if domain == base_domain:
                continue
            if any(marker in host for marker in self.NON_COMPANY_OUTBOUND_MARKERS):
                continue
            clean_url = parsed._replace(fragment="").geturl()
            if clean_url in seen:
                continue
            seen.add(clean_url)
            links.append(clean_url)
        return links

    def _origin_for_url(self, url):
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return f"{parsed.scheme}://{parsed.netloc}"

    def _page_priority(self, url):
        path = urlsplit(url).path.lower()
        if any(hint in path for hint in self.HIGH_VALUE_PATH_HINTS):
            return 0
        if "contact" in path:
            return 1
        if "about" in path or "company" in path:
            return 2
        return 3

    def _clean_page_url(self, url):
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return parsed._replace(fragment="").geturl().rstrip("/")

    def build_followup_urls(self, homepage_url, discovery_url, contact_pages):
        origin = self._origin_for_url(homepage_url)
        raw_urls = []

        if discovery_url and self._origin_for_url(discovery_url) == origin:
            raw_urls.append(discovery_url)
        raw_urls.extend(contact_pages)
        if origin:
            raw_urls.extend(urljoin(origin, path) for path in self.LIKELY_PATHS)

        deduped = []
        seen = {self._clean_page_url(homepage_url)}
        for raw_url in sorted(raw_urls, key=self._page_priority):
            clean_url = self._clean_page_url(raw_url)
            if not clean_url or clean_url in seen:
                continue
            if self._origin_for_url(clean_url) != origin:
                continue
            seen.add(clean_url)
            deduped.append(clean_url)
            if len(deduped) >= self.max_extra_pages:
                break

        return deduped

    async def enrich_candidate(self, session, candidate):
        """Process a single candidate."""
        async with self.semaphore:
            homepage_url = candidate["url"]
            print(f"Enriching: {homepage_url}")

            aggregated_emails = set()
            aggregated_socials = set()
            aggregated_contact_forms = set()
            text_chunks = []
            crawled_pages = []
            status_codes = []
            fetch_errors = []

            if candidate.get("needs_website_resolution"):
                profile_fetch = await self.fetch_page(session, homepage_url)
                crawled_pages.append(profile_fetch["url"])
                status_codes.append(profile_fetch["status"])
                if profile_fetch["error"]:
                    fetch_errors.append(profile_fetch["error"])

                if profile_fetch["ok"]:
                    emails, socials, text_content, contact_pages, contact_forms = self.extract_data(
                        profile_fetch["html"],
                        profile_fetch["url"],
                    )
                    aggregated_emails.update(emails)
                    aggregated_socials.update(socials)
                    aggregated_contact_forms.update(contact_forms)
                    if text_content:
                        text_chunks.append(text_content)

                    official_links = self.extract_official_links(
                        profile_fetch["html"],
                        profile_fetch["url"],
                    )
                    if official_links:
                        homepage_url = official_links[0]
                        candidate["url"] = homepage_url
                        candidate["resolved_website"] = homepage_url
                        candidate["domain"] = self._normalize_url_domain(homepage_url)
                        candidate["needs_website_resolution"] = False
                    else:
                        candidate["emails"] = []
                        candidate["high_quality_emails"] = []
                        candidate["email_quality"] = "none"
                        candidate["rejected_emails"] = []
                        candidate["social_urls"] = sorted(aggregated_socials)
                        candidate["contact_form_urls"] = sorted(aggregated_contact_forms)
                        candidate["content"] = " ".join(text_chunks)[:50000]
                        candidate["linkedin_url"] = next(
                            (link for link in candidate["social_urls"] if "linkedin.com" in link.lower()),
                            None,
                        )
                        candidate["fetch_ok"] = bool(status_codes and any(200 <= code < 300 for code in status_codes))
                        candidate["fetch_status_codes"] = status_codes
                        candidate["fetch_errors"] = fetch_errors
                        candidate["crawled_pages"] = crawled_pages
                        return candidate

            first_fetch = await self.fetch_page(session, homepage_url)
            crawled_pages.append(first_fetch["url"])
            status_codes.append(first_fetch["status"])
            if first_fetch["error"]:
                fetch_errors.append(first_fetch["error"])

            if first_fetch["ok"]:
                emails, socials, text_content, contact_pages, contact_forms = self.extract_data(
                    first_fetch["html"], first_fetch["url"]
                )
                aggregated_emails.update(emails)
                aggregated_socials.update(socials)
                aggregated_contact_forms.update(contact_forms)
                if text_content:
                    text_chunks.append(text_content)

                contact_candidates = self.build_followup_urls(
                    first_fetch["url"],
                    candidate.get("discovery_url", ""),
                    contact_pages,
                )
                for url in contact_candidates:
                    page_fetch = await self.fetch_page(session, url)
                    crawled_pages.append(page_fetch["url"])
                    status_codes.append(page_fetch["status"])
                    if page_fetch["error"]:
                        fetch_errors.append(page_fetch["error"])
                    if not page_fetch["ok"]:
                        continue
                    c_emails, c_socials, c_text, _, c_contact_forms = self.extract_data(
                        page_fetch["html"], page_fetch["url"]
                    )
                    aggregated_emails.update(c_emails)
                    aggregated_socials.update(c_socials)
                    aggregated_contact_forms.update(c_contact_forms)
                    if c_text:
                        text_chunks.append(c_text)

            accepted_emails, rejected_emails = self.filter_emails_for_candidate(
                aggregated_emails,
                candidate.get("domain", ""),
            )
            email_quality, high_quality_emails = self.classify_email_quality(
                accepted_emails,
                candidate.get("domain", ""),
            )

            candidate["emails"] = accepted_emails
            candidate["high_quality_emails"] = high_quality_emails
            candidate["email_quality"] = email_quality
            candidate["rejected_emails"] = rejected_emails
            candidate["social_urls"] = sorted(aggregated_socials)
            candidate["contact_form_urls"] = sorted(aggregated_contact_forms)
            candidate["content"] = " ".join(text_chunks)[:50000]
            candidate["linkedin_url"] = next(
                (link for link in candidate["social_urls"] if "linkedin.com" in link.lower()),
                None,
            )
            candidate["fetch_ok"] = bool(status_codes and any(200 <= code < 300 for code in status_codes))
            candidate["fetch_status_codes"] = status_codes
            candidate["fetch_errors"] = fetch_errors
            candidate["crawled_pages"] = crawled_pages
            return candidate

    async def run_enrichment(self, candidates):
        """Run enrichment concurrently on all candidates."""
        try:
            import aiohttp
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Missing dependency: aiohttp. Install with `pip install -r scraper/requirements.txt`."
            ) from exc

        connector = aiohttp.TCPConnector(limit_per_host=2, ttl_dns_cache=300)
        timeout = aiohttp.ClientTimeout(total=self.request_timeout)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Upgrade-Insecure-Requests": "1",
        }
        async with aiohttp.ClientSession(connector=connector, timeout=timeout, headers=headers) as session:
            tasks = [self.enrich_candidate(session, c) for c in candidates]
            enriched = await asyncio.gather(*tasks)
            return enriched
