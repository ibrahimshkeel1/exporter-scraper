import asyncio
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4


def emit_progress(status, message, status_output=None, job_id=None, source="worker", **metadata):
    event = {
        "status": status,
        "message": message,
        "source": source,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if job_id:
        event["job_id"] = job_id
    event.update(metadata)
    encoded = json.dumps(event, ensure_ascii=True)
    print(f"SCRAPER_EVENT {encoded}", flush=True)
    if status_output:
        status_path = Path(status_output)
        status_path.parent.mkdir(parents=True, exist_ok=True)
        with status_path.open("a", encoding="utf-8") as file_handle:
            file_handle.write(f"{encoded}\n")


def load_job_config(config_path):
    with open(config_path, encoding="utf-8") as file_handle:
        return json.load(file_handle)


def normalize_region(region):
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


def parse_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def apply_job_config(args, config):
    """Map SaaS job JSON into the existing CLI argument shape."""
    targeting = config.get("targeting", {})
    lead_pack = config.get("lead_pack", {})
    delivery = config.get("delivery", {})
    quality = config.get("quality", {})

    flat_mappings = {
        "region": "region",
        "industry": "industry",
        "limit": "limit",
        "min_score": "min_score",
        "output": "output",
        "audit_output": "audit_output",
        "format": "format",
        "test_mode": "test_mode",
        "max_analyzed": "max_analyzed",
        "search_terms": "search_terms",
        "hunt_first_a_plus": "hunt_first_a_plus",
        "hunt_max_analyzed": "hunt_max_analyzed",
        "a_plus_score": "a_plus_score",
        "allow_no_email": "allow_no_email",
        "allow_weak_buyer_evidence": "allow_weak_buyer_evidence",
        "fill_until_complete": "fill_until_complete",
        "status_output": "status_output",
        "job_id": "job_id",
    }
    bool_keys = {
        "test_mode",
        "hunt_first_a_plus",
        "allow_no_email",
        "allow_weak_buyer_evidence",
        "fill_until_complete",
    }
    for key, attribute in flat_mappings.items():
        if key in config and config[key] is not None:
            value = parse_bool(config[key]) if key in bool_keys else config[key]
            setattr(args, attribute, value)

    if targeting.get("region"):
        args.region = normalize_region(targeting["region"])
    if targeting.get("refined_industry"):
        args.industry = targeting["refined_industry"]
    elif targeting.get("industry"):
        args.industry = targeting["industry"]
    elif targeting.get("search_terms"):
        args.industry = " ".join(targeting["search_terms"])
    if targeting.get("search_terms"):
        args.search_terms = list(targeting["search_terms"])

    if lead_pack.get("limit") is not None:
        args.limit = int(lead_pack["limit"])
    if lead_pack.get("min_score") is not None:
        args.min_score = int(lead_pack["min_score"])
    if lead_pack.get("max_analyzed") is not None:
        args.max_analyzed = int(lead_pack["max_analyzed"])
    if lead_pack.get("fill_until_complete") is not None:
        args.fill_until_complete = parse_bool(lead_pack["fill_until_complete"])
    if lead_pack.get("mode") == "a_plus":
        args.hunt_first_a_plus = True
        args.a_plus_score = max(args.a_plus_score, 85)

    if delivery.get("format"):
        args.format = delivery["format"]
    if delivery.get("output"):
        args.output = delivery["output"]
    elif delivery.get("output_dir") and args.job_id:
        args.output = str(Path(delivery["output_dir"]) / f"{args.job_id}_leads.csv")
    if delivery.get("audit_output"):
        args.audit_output = delivery["audit_output"]
    elif delivery.get("output_dir") and args.job_id:
        args.audit_output = str(Path(delivery["output_dir"]) / f"{args.job_id}_audit.csv")

    if quality.get("allow_no_email") is not None:
        args.allow_no_email = parse_bool(quality["allow_no_email"])
    if quality.get("allow_weak_buyer_evidence") is not None:
        args.allow_weak_buyer_evidence = parse_bool(quality["allow_weak_buyer_evidence"])
    if quality.get("a_plus_score") is not None:
        args.a_plus_score = int(quality["a_plus_score"])
    if config.get("scoring_context") is not None:
        args.scoring_context = config["scoring_context"]
    args.specialist_config_slug = config.get("config_slug") or targeting.get("config_slug")
    args.specialist_job_config = config
    network = config.get("network", {}) if isinstance(config.get("network"), dict) else {}
    if config.get("proxy_pool") is not None:
        args.proxy_pool = list(config.get("proxy_pool") or [])
    if config.get("proxy_file") is not None:
        args.proxy_file = config.get("proxy_file")
    if network.get("proxy_pool") is not None:
        args.proxy_pool = list(network.get("proxy_pool") or [])
    if network.get("proxy_file") is not None:
        args.proxy_file = network.get("proxy_file")

    return args


def compute_discovery_limit(limit, test_mode=False, max_analyzed=None):
    if max_analyzed is not None:
        return max(limit, int(max_analyzed))

    if test_mode:
        return min(120, max(limit * 20, 80))
    return max(limit * 300, 1000)


def relaxed_score_thresholds(min_score):
    floor = max(35, int(min_score) if min_score is not None else 75)
    thresholds = [floor, max(35, floor - 5), max(35, floor - 10), max(35, floor - 15), 35]
    return [threshold for index, threshold in enumerate(thresholds) if threshold not in thresholds[:index]]


def merge_search_terms(primary_terms, secondary_terms):
    merged = []
    for values in (primary_terms or [], secondary_terms or []):
        for value in values:
            text = str(value or "").strip()
            if text and text not in merged:
                merged.append(text)
    return merged


def merge_scoring_context(base_context, override_context):
    merged = {}
    list_keys = (
        "product_keywords",
        "buyer_keywords",
        "negative_keywords",
        "blocked_domains",
        "blocked_host_markers",
        "blocked_tlds",
    )
    for key in list_keys:
        merged_values = []
        for context in (base_context or {}, override_context or {}):
            for value in context.get(key, []) if isinstance(context, dict) else []:
                text = str(value or "").strip()
                if text and text not in merged_values:
                    merged_values.append(text)
        if merged_values:
            merged[key] = merged_values
    for key in ("quality_mode", "search_intent"):
        for context in (override_context or {}, base_context or {}):
            if isinstance(context, dict) and context.get(key):
                merged[key] = context.get(key)
                break
    return merged or None


def _resolve_scraper_config(industry, region, job_config=None):
    """Resolve the specialist config for a scraper run.

    Uses the Router for classification, merges with job_config overrides,
    and returns (config_slug, merged_config).
    Falls back gracefully if Router/configs are missing."""
    try:
        from modules.router import IndustryRouter
        from modules.config_loader import ConfigLoader

        router = IndustryRouter()
        loader = ConfigLoader()
        forced_slug = None
        if job_config and isinstance(job_config, dict):
            forced_slug = job_config.get("config_slug") or job_config.get("specialist_config_slug")
            forced_slug = str(forced_slug or "").strip()

        if forced_slug:
            slug = forced_slug
            config = loader.load(slug)
        else:
            slug, config, confidence = router.classify(industry, region)

        if job_config and isinstance(job_config, dict):
            config = loader.merge_with_job_config(config, job_config)
        # Inject feedback if Supabase available
        feedback = router.query_feedback(slug, region)
        if feedback:
            config = router.inject_feedback(config, feedback)
        return slug, config
    except Exception as e:
        print(f"[main] Config resolution skipped: {e}")
        return None, None


SEVERE_DISQUALIFICATION_MARKERS = (
    "blocked noisy domain class",
    "known false-positive domain",
    "supplier-country domain",
)


def _candidate_rank_key(candidate):
    return (
        candidate.get("score", 0),
        1 if candidate.get("passes_hard_checks", False) else 0,
        1 if candidate.get("fetch_ok", False) else 0,
        1 if candidate.get("lead_pack_status") == "sellable_a_plus" else 0,
        len(candidate.get("high_quality_emails", [])),
        len(candidate.get("emails", [])),
        len(candidate.get("buyer_side_evidence", "")),
    )


def _candidate_disqualification_set(candidate):
    return {
        reason.strip().lower()
        for reason in str(candidate.get("disqualification_reasons", "")).split(";")
        if reason.strip()
    }


def _is_severe_disqualification(candidate):
    reasons = _candidate_disqualification_set(candidate)
    return any(marker in reason for marker in SEVERE_DISQUALIFICATION_MARKERS for reason in reasons)


def _append_unique_backfill(selected, ranked_pool, limit, stage, predicate):
    selected_domains = {
        _normalize_domain_value(lead.get("domain", ""))
        for lead in selected
        if lead.get("domain")
    }
    added = 0
    for candidate in ranked_pool:
        if len(selected) >= limit:
            break
        domain = _normalize_domain_value(candidate.get("domain", ""))
        if not domain or domain in selected_domains:
            continue
        if not predicate(candidate):
            continue
        candidate["pack_fill_stage"] = stage
        if stage != "strict":
            candidate["manual_review_required"] = True
        selected.append(candidate)
        selected_domains.add(domain)
        added += 1
    return added


def _lead_pack_backfill_mode(config):
    if not isinstance(config, dict):
        return "legacy"
    selection = config.get("lead_pack_selection", {})
    if isinstance(selection, dict):
        mode = str(selection.get("backfill_mode", "")).strip().lower()
        if mode in {"legacy", "conservative", "strict"}:
            return mode
    return "legacy"


def build_lead_pack(
    scoring,
    scored_candidates,
    limit,
    min_score,
    fill_until_complete=False,
    backfill_mode="legacy",
):
    if not scored_candidates:
        return [], min_score, []

    backfill_mode = str(backfill_mode or "legacy").strip().lower()
    if backfill_mode not in {"legacy", "conservative", "strict"}:
        backfill_mode = "legacy"

    ranked_pool = sorted(scored_candidates, key=_candidate_rank_key, reverse=True)
    selected = scoring.rank_and_filter(scored_candidates, limit=limit, min_score=min_score)
    for lead in selected:
        lead["pack_fill_stage"] = "strict"

    stage_events = [("strict", min_score, len(selected))]
    effective_min_score = min_score

    if fill_until_complete and len(selected) < limit:
        for threshold in relaxed_score_thresholds(min_score)[1:]:
            relaxed = scoring.rank_and_filter(scored_candidates, limit=limit, min_score=threshold)
            if len(relaxed) <= len(selected):
                continue
            selected = relaxed
            for lead in selected:
                lead["pack_fill_stage"] = "relaxed_threshold"
            effective_min_score = threshold
            stage_events.append(("relaxed_threshold", threshold, len(selected)))
            if len(selected) >= limit:
                break

    if backfill_mode == "strict":
        return selected[:limit], effective_min_score, stage_events

    allow_backfill = fill_until_complete or backfill_mode == "legacy"

    if allow_backfill and len(selected) < limit:
        soft_floor = max(30, effective_min_score - 20)
        added = _append_unique_backfill(
            selected=selected,
            ranked_pool=ranked_pool,
            limit=limit,
            stage="hard_check_backfill",
            predicate=lambda candidate: (
                candidate.get("passes_hard_checks", False)
                and candidate.get("score", 0) >= soft_floor
                and candidate.get("noisy_domain_hits", 0) == 0
            ),
        )
        if added:
            stage_events.append(("hard_check_backfill", soft_floor, len(selected)))

    if backfill_mode == "conservative":
        return selected[:limit], effective_min_score, stage_events

    if allow_backfill and len(selected) < limit:
        exploratory_floor = max(20, effective_min_score - 35)
        added = _append_unique_backfill(
            selected=selected,
            ranked_pool=ranked_pool,
            limit=limit,
            stage="exploratory_backfill",
            predicate=lambda candidate: (
                candidate.get("fetch_ok", False)
                and candidate.get("score", 0) >= exploratory_floor
                and not _is_severe_disqualification(candidate)
            ),
        )
        if added:
            stage_events.append(("exploratory_backfill", exploratory_floor, len(selected)))

    if allow_backfill and len(selected) < limit:
        added = _append_unique_backfill(
            selected=selected,
            ranked_pool=ranked_pool,
            limit=limit,
            stage="forced_backfill",
            predicate=lambda candidate: bool(_normalize_domain_value(candidate.get("domain", ""))),
        )
        if added:
            stage_events.append(("forced_backfill", 0, len(selected)))

    return selected[:limit], effective_min_score, stage_events


def _parse_proxy_entry(proxy_value):
    text = str(proxy_value or "").strip()
    if not text:
        return None
    parsed = urlsplit(text)
    if not parsed.scheme or not parsed.hostname:
        return None
    server = f"{parsed.scheme}://{parsed.hostname}"
    if parsed.port:
        server = f"{server}:{parsed.port}"
    payload = {"server": server}
    if parsed.username:
        payload["username"] = parsed.username
    if parsed.password:
        payload["password"] = parsed.password
    return payload


def resolve_proxy_pool(proxy_pool=None, proxy_file=None):
    values = []
    for entry in proxy_pool or []:
        text = str(entry or "").strip()
        if text and text not in values:
            values.append(text)
    if proxy_file:
        file_path = Path(proxy_file)
        if file_path.exists():
            for line in file_path.read_text(encoding="utf-8").splitlines():
                line_text = line.strip()
                if not line_text or line_text.startswith("#"):
                    continue
                if line_text not in values:
                    values.append(line_text)
    env_value = str(os.environ.get("EXPORTFLOW_PROXY_POOL", "")).strip()
    if env_value:
        for raw in env_value.split(","):
            item = raw.strip()
            if item and item not in values:
                values.append(item)
    parsed = []
    for value in values:
        parsed_proxy = _parse_proxy_entry(value)
        if parsed_proxy:
            parsed.append({"raw": value, "playwright": parsed_proxy})
    return parsed


async def healthcheck_proxy_pool(proxy_pool, status_output=None, job_id=None):
    if not proxy_pool:
        return []

    try:
        import aiohttp
    except ModuleNotFoundError:
        # Proxy checks are optional; if aiohttp is missing, keep original pool.
        return list(proxy_pool)

    check_url = str(os.environ.get("EXPORTFLOW_PROXY_HEALTHCHECK_URL", "https://ip.oxylabs.io/location")).strip()
    timeout_seconds = float(os.environ.get("EXPORTFLOW_PROXY_HEALTHCHECK_TIMEOUT_SECONDS", "12"))
    min_healthy = int(os.environ.get("EXPORTFLOW_PROXY_MIN_HEALTHY", "1"))
    timeout = aiohttp.ClientTimeout(total=timeout_seconds)
    connector = aiohttp.TCPConnector(ssl=False, ttl_dns_cache=120)

    emit_progress(
        "planning",
        "Running proxy health checks.",
        status_output=status_output,
        job_id=job_id,
        source="system",
        proxy_check_url=check_url,
        proxy_count=len(proxy_pool),
        min_healthy=min_healthy,
    )

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        async def check_one(index, proxy_entry):
            proxy_raw = proxy_entry.get("raw", "")
            try:
                async with session.get(check_url, proxy=proxy_raw, allow_redirects=True) as response:
                    ok = 200 <= int(response.status) < 400
                    return index, proxy_entry, ok, int(response.status), ""
            except Exception as exc:
                return index, proxy_entry, False, 0, str(exc)

        tasks = [asyncio.create_task(check_one(index, proxy_entry)) for index, proxy_entry in enumerate(proxy_pool, start=1)]
        results = await asyncio.gather(*tasks)

    healthy = []
    for index, proxy_entry, ok, status_code, error in results:
        if ok:
            healthy.append(proxy_entry)
            emit_progress(
                "planning",
                "Proxy passed health check.",
                status_output=status_output,
                job_id=job_id,
                source="system",
                proxy_index=index,
                proxy=proxy_entry.get("raw", ""),
                proxy_status=status_code,
            )
        else:
            emit_progress(
                "planning",
                "Proxy failed health check.",
                status_output=status_output,
                job_id=job_id,
                source="system",
                proxy_index=index,
                proxy=proxy_entry.get("raw", ""),
                proxy_status=status_code,
                error=error,
            )

    emit_progress(
        "planning",
        "Proxy health checks completed.",
        status_output=status_output,
        job_id=job_id,
        source="system",
        proxy_healthy_count=len(healthy),
        proxy_total_count=len(proxy_pool),
    )
    if len(healthy) < min_healthy:
        raise RuntimeError(
            f"Proxy health check failed: {len(healthy)}/{len(proxy_pool)} healthy proxies "
            f"(minimum required: {min_healthy})."
        )
    return healthy


class RotatingDiscoveryBrowser:
    def __init__(self, playwright, user_agent, proxy_pool=None, start_index=0):
        self.playwright = playwright
        self.user_agent = user_agent
        self.proxy_pool = list(proxy_pool or [])
        self.proxy_index = max(0, int(start_index or 0))
        self.browser = None
        self.context = None
        self.page = None
        self.active_proxy_raw = ""

    async def start(self):
        await self._launch()

    async def _launch(self):
        launch_kwargs = {"headless": True}
        proxy = None
        if self.proxy_pool:
            proxy = self.proxy_pool[self.proxy_index % len(self.proxy_pool)]
            launch_kwargs["proxy"] = proxy["playwright"]
        self.active_proxy_raw = proxy["raw"] if proxy else ""
        self.browser = await self.playwright.chromium.launch(**launch_kwargs)
        self.context = await self.browser.new_context(user_agent=self.user_agent)
        self.page = await self.context.new_page()
        if proxy:
            print(f"Discovery proxy active: {proxy['raw']}")

    async def rotate(self, reason=""):
        if not self.proxy_pool:
            return False
        if len(self.proxy_pool) > 1:
            self.proxy_index = (self.proxy_index + 1) % len(self.proxy_pool)
        try:
            if self.context:
                await self.context.close()
        except Exception:
            pass
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass
        self.context = None
        self.browser = None
        self.page = None
        await self._launch()
        if reason:
            print(f"Rotated discovery proxy due to: {reason}")
        return True

    def active_proxy(self):
        return self.active_proxy_raw

    async def close(self):
        try:
            if self.context:
                await self.context.close()
        except Exception:
            pass
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass

    async def goto(self, *args, **kwargs):
        return await self.page.goto(*args, **kwargs)

    async def query_selector_all(self, *args, **kwargs):
        return await self.page.query_selector_all(*args, **kwargs)

    async def query_selector(self, *args, **kwargs):
        return await self.page.query_selector(*args, **kwargs)

    async def wait_for_timeout(self, *args, **kwargs):
        return await self.page.wait_for_timeout(*args, **kwargs)

    async def title(self, *args, **kwargs):
        return await self.page.title(*args, **kwargs)


def _normalize_domain_value(value):
    domain = str(value or "").strip().lower()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def partition_discovery_sources(sources):
    groups = {
        "main": [],
        "bing": [],
        "yahoo": [],
        "duckduckgo": [],
    }
    for source in sources:
        engine = (getattr(source, "search_engine", "") or "").strip().lower()
        if engine in {"bing", "duckduckgo", "yahoo"}:
            groups[engine].append(source)
        else:
            groups["main"].append(source)
    return {key: value for key, value in groups.items() if value}


def _recent_domains_file(output_path):
    output_file = Path(output_path or "buyer_leads.csv")
    parent = output_file.parent if str(output_file.parent) else Path(".")
    return parent / "recent_delivered_domains.json"


def load_recent_domains(file_path, max_items=500):
    path = Path(file_path)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    if not isinstance(payload, list):
        return []
    cleaned = []
    for item in payload:
        domain = _normalize_domain_value(item)
        if domain and domain not in cleaned:
            cleaned.append(domain)
    return cleaned[:max_items]


def save_recent_domains(file_path, existing_domains, new_domains, max_items=500):
    seen = []
    for domain in new_domains + existing_domains:
        normalized = _normalize_domain_value(domain)
        if normalized and normalized not in seen:
            seen.append(normalized)
    final_domains = seen[:max_items]
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(final_domains, ensure_ascii=True, indent=2), encoding="utf-8")
    return final_domains


def apply_recent_dedupe(scoring, scored_candidates, min_score, limit, recent_domains):
    if not scored_candidates or not recent_domains:
        ranked = scoring.rank_and_filter(scored_candidates, limit=limit, min_score=min_score)
        return ranked, 0

    ranked_candidates = scoring.rank_and_filter(
        scored_candidates,
        limit=max(limit * 6, len(scored_candidates)),
        min_score=min_score,
    )
    recent_set = {_normalize_domain_value(domain) for domain in recent_domains}
    filtered = []
    dropped = 0
    seen = set()
    for candidate in ranked_candidates:
        domain = _normalize_domain_value(candidate.get("domain", ""))
        if not domain or domain in seen:
            continue
        seen.add(domain)
        if domain in recent_set:
            dropped += 1
            continue
        filtered.append(candidate)
        if len(filtered) >= limit:
            break
    return filtered, dropped


def apply_recent_domain_suppression(leads, recent_domains, limit, preserve_target=False):
    if not leads:
        return [], 0, 0

    recent_set = {_normalize_domain_value(domain) for domain in recent_domains if domain}
    filtered = []
    deferred = []
    seen = set()
    dropped = 0

    for lead in leads:
        domain = _normalize_domain_value(lead.get("domain", ""))
        if not domain or domain in seen:
            continue
        seen.add(domain)
        if domain in recent_set:
            dropped += 1
            deferred.append(lead)
            continue
        filtered.append(lead)
        if len(filtered) >= limit:
            return filtered, dropped, 0

    restored = 0
    if preserve_target and len(filtered) < limit and deferred:
        for lead in deferred:
            domain = _normalize_domain_value(lead.get("domain", ""))
            if not domain:
                continue
            lead["pack_fill_stage"] = lead.get("pack_fill_stage", "strict")
            lead["manual_review_required"] = True
            filtered.append(lead)
            restored += 1
            if len(filtered) >= limit:
                break

    return filtered[:limit], dropped, restored


def pad_lead_pack_with_repeats(leads, limit):
    if not leads or len(leads) >= limit:
        return leads, 0
    padded = list(leads)
    repeat_index = 0
    while len(padded) < limit:
        source = leads[repeat_index % len(leads)]
        clone = dict(source)
        clone["pack_fill_stage"] = "repeat_backfill"
        clone["manual_review_required"] = True
        clone["repeat_source_domain"] = source.get("domain", "")
        existing_reasons = str(clone.get("disqualification_reasons", "")).strip()
        repeat_reason = "repeated lead used to satisfy guaranteed pack size"
        if existing_reasons:
            clone["disqualification_reasons"] = f"{existing_reasons}; {repeat_reason}"
        else:
            clone["disqualification_reasons"] = repeat_reason
        padded.append(clone)
        repeat_index += 1
    return padded, len(padded) - len(leads)


async def run_scraper(
    region,
    industry,
    limit,
    output,
    output_format,
    test_mode,
    min_score,
    fill_until_complete=False,
    audit_output=None,
    allow_no_email=False,
    allow_weak_buyer_evidence=False,
    status_output=None,
    job_id=None,
    max_analyzed=None,
    search_terms=None,
    scoring_context=None,
    job_config=None,
    proxy_pool=None,
    proxy_file=None,
):
    region = normalize_region(region)
    print(
        f"Starting scraper | Region: {region} | Industry: {industry} | Limit: {limit} | Test mode: {test_mode}"
    )
    emit_progress(
        "starting",
        "Scraper job started.",
        status_output=status_output,
        job_id=job_id,
        source="system",
        region=region,
        industry=industry,
        limit=limit,
        output_format=output_format,
    )

    try:
        from playwright.async_api import async_playwright
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing Playwright dependency. Run `pip install -r scraper/requirements.txt` "
            "and `python -m playwright install chromium`."
        ) from exc

    from modules.discovery import LeadDiscovery
    from modules.enrichment import LeadEnrichment
    from modules.export import LeadExport
    from modules.scoring import LeadScoring
    from modules.signal_map import build_signal_map

    try:
        import aiohttp
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing dependency: aiohttp. Install with `pip install -r scraper/requirements.txt`."
        ) from exc

    # Resolve specialist config
    config_slug, scraper_config = _resolve_scraper_config(industry, region, job_config)
    backfill_mode = _lead_pack_backfill_mode(scraper_config)

    discovery_limit = compute_discovery_limit(
        limit=limit,
        test_mode=test_mode,
        max_analyzed=max_analyzed,
    )
    run_id = f"run-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"
    effective_min_score = min_score

    candidates = []
    enriched_candidates = []
    scored_candidates = []
    top_leads = []
    seen_enriched_domains = set()

    signal_map = build_signal_map(region=region, industry=industry, search_terms=search_terms, config=scraper_config)
    merged_search_terms = merge_search_terms(signal_map.get("routed_search_terms", []), search_terms or [])
    merged_scoring_context = merge_scoring_context(signal_map.get("scoring_context"), scoring_context)
    resolved_proxies = resolve_proxy_pool(proxy_pool=proxy_pool, proxy_file=proxy_file)
    if resolved_proxies:
        resolved_proxies = await healthcheck_proxy_pool(
            resolved_proxies,
            status_output=status_output,
            job_id=job_id,
        )
    emit_progress(
        "planning",
        "Signal map generated for discovery routing.",
        status_output=status_output,
        job_id=job_id,
        source="system",
        signal_cluster=signal_map.get("cluster", ""),
        signal_count=len(signal_map.get("signals", [])),
        routed_search_terms=len(merged_search_terms),
        proxy_count=len(resolved_proxies),
    )

    scoring = LeadScoring(
        require_email=not allow_no_email,
        require_buyer_evidence=not allow_weak_buyer_evidence,
        scoring_context=merged_scoring_context,
        industry=industry,
        config=scraper_config,
    )

    worker_count = 2 if test_mode else 4
    candidate_queue = asyncio.Queue(maxsize=max(80, min(240, limit * 20)))
    stop_event = asyncio.Event()
    state_lock = asyncio.Lock()

    async def discovery_producer(
        producer_name,
        discovery,
        page,
        chunk_size,
        sources,
        on_engine_blocked=None,
    ):
        batch_index = 0
        discovered_count = 0
        try:
            emit_progress(
                "discovering",
                f"Discovery lane started: {producer_name}.",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
                engine=producer_name,
                queue_maxsize=candidate_queue.maxsize,
                source_count=len(sources),
            )
            async def on_discovery_event(payload):
                emit_progress(
                    "discovering",
                    str(payload.get("event", "discovery_event")),
                    status_output=status_output,
                    job_id=job_id,
                    source="discovery",
                    lane=producer_name,
                    **payload,
                )

            async for candidate_batch in discovery.run_discovery(
                page,
                region=region,
                industry=industry,
                chunk_size=chunk_size,
                on_engine_blocked=on_engine_blocked,
                on_discovery_event=on_discovery_event,
                sources=sources,
            ):
                if stop_event.is_set():
                    break
                if not candidate_batch:
                    continue
                batch_index += 1
                candidates.extend(candidate_batch)
                discovered_count += len(candidate_batch)
                emit_progress(
                    "discovering",
                    "Discovery batch queued for enrichment.",
                    status_output=status_output,
                    job_id=job_id,
                    source="discovery",
                    engine=producer_name,
                    batch_index=batch_index,
                    batch_size=len(candidate_batch),
                    discovered_count=discovered_count,
                    queued_count=candidate_queue.qsize(),
                )
                for candidate in candidate_batch:
                    if stop_event.is_set():
                        break
                    await candidate_queue.put(candidate)
                if stop_event.is_set():
                    break
        finally:
            emit_progress(
                "discovered",
                f"Discovery lane completed: {producer_name}.",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
                engine=producer_name,
                discovered_count=discovered_count,
            )

    async def enrichment_worker(enrichment, session, worker_id):
        target_announced = False
        while True:
            candidate = await candidate_queue.get()
            if candidate is None:
                candidate_queue.task_done()
                return

            if stop_event.is_set():
                candidate_queue.task_done()
                continue

            domain = candidate.get("domain", "")
            emit_progress(
                "enriching",
                "Enriching candidate.",
                status_output=status_output,
                job_id=job_id,
                source="enrichment",
                worker_id=worker_id,
                domain=domain,
                queued_count=candidate_queue.qsize(),
            )
            try:
                enriched = await enrichment.enrich_candidate(session, candidate)
            except Exception as exc:
                emit_progress(
                    "enriching",
                    "Candidate enrichment failed.",
                    status_output=status_output,
                    job_id=job_id,
                    source="enrichment",
                    worker_id=worker_id,
                    domain=domain,
                    error=str(exc),
                )
                candidate_queue.task_done()
                continue

            candidate_domain = (enriched.get("domain") or "").strip().lower()
            if candidate_domain.startswith("www."):
                candidate_domain = candidate_domain[4:]
            duplicate_domain = False
            if candidate_domain:
                async with state_lock:
                    if candidate_domain in seen_enriched_domains:
                        duplicate_domain = True
                    else:
                        seen_enriched_domains.add(candidate_domain)
            if duplicate_domain:
                emit_progress(
                    "enriching",
                    "Duplicate domain skipped after enrichment.",
                    status_output=status_output,
                    job_id=job_id,
                    source="enrichment",
                    worker_id=worker_id,
                    domain=candidate_domain,
                )
                candidate_queue.task_done()
                continue

            scored = scoring.evaluate_candidate(enriched)
            async with state_lock:
                enriched_candidates.append(enriched)
                scored_candidates.append(scored)
                ranked = scoring.rank_and_filter(scored_candidates, limit=limit, min_score=min_score)
                top_leads.clear()
                top_leads.extend(ranked)
                analyzed_count = len(scored_candidates)
                qualified_count = len(top_leads)
                hit_target = qualified_count >= limit

            emit_progress(
                "scoring",
                "Candidate scored.",
                status_output=status_output,
                job_id=job_id,
                source="scoring",
                worker_id=worker_id,
                domain=scored.get("domain", ""),
                score=scored.get("score", 0),
                analyzed_count=analyzed_count,
                qualified_count=qualified_count,
                target_count=limit,
                min_score=min_score,
            )

            if hit_target:
                stop_event.set()
                if not target_announced:
                    target_announced = True
                    emit_progress(
                        "scoring",
                        "Lead target reached; draining queue and finalizing exports.",
                        status_output=status_output,
                        job_id=job_id,
                        source="scoring",
                        analyzed_count=analyzed_count,
                        qualified_count=qualified_count,
                        target_count=limit,
                    )

            candidate_queue.task_done()

    async with async_playwright() as p:
        user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        enrichment_browser = await p.chromium.launch(headless=True)
        enrichment_context = await enrichment_browser.new_context(user_agent=user_agent)
        discovery_template = LeadDiscovery(
            limit=discovery_limit,
            search_terms=merged_search_terms,
            signal_map=signal_map,
            scoring_context=merged_scoring_context,
            config=scraper_config,
        )
        source_groups = partition_discovery_sources(discovery_template.generate_sources(region, industry))
        active_discovery_groups = list(source_groups.items())
        if not active_discovery_groups:
            active_discovery_groups = [("main", [])]
        lane_limit = max(limit, discovery_limit // max(1, len(active_discovery_groups)))

        discovery_browsers = {}
        for lane_index, (lane_name, _) in enumerate(active_discovery_groups):
            lane_proxies = resolved_proxies
            if lane_name == "main":
                lane_proxies = []
            lane_browser = RotatingDiscoveryBrowser(
                playwright=p,
                user_agent=user_agent,
                proxy_pool=lane_proxies,
                start_index=lane_index,
            )
            await lane_browser.start()
            discovery_browsers[lane_name] = lane_browser
            emit_progress(
                "discovering",
                "Discovery lane browser started.",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
                lane=lane_name,
                proxy_active=lane_browser.active_proxy(),
                proxy_pool_size=len(lane_browser.proxy_pool),
            )

        emit_progress(
            "planning",
            "Discovery lanes initialized.",
            status_output=status_output,
            job_id=job_id,
            source="discovery",
            lane_count=len(active_discovery_groups),
            lanes=[lane for lane, _ in active_discovery_groups],
        )

        enrichment = LeadEnrichment(
            concurrency=worker_count,
            max_extra_pages=12,
            browser_context=enrichment_context,
            browser_fallback_concurrency=max(1, worker_count // 2),
            config=scraper_config,
        )
        batch_size = 8 if test_mode else max(12, min(40, limit * 2))

        connector = aiohttp.TCPConnector(limit_per_host=max(2, worker_count), ttl_dns_cache=300)
        timeout = aiohttp.ClientTimeout(total=enrichment.request_timeout)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Upgrade-Insecure-Requests": "1",
        }

        async with aiohttp.ClientSession(connector=connector, timeout=timeout, headers=headers) as session:
            async def rotate_proxy_on_block(lane_name, engine, source_url, reason):
                lane_browser = discovery_browsers.get(lane_name)
                if not lane_browser:
                    return False
                if not lane_browser.proxy_pool or len(lane_browser.proxy_pool) <= 1:
                    return False
                from_proxy = lane_browser.active_proxy()
                rotated = await lane_browser.rotate(reason=f"{engine} block on {source_url}")
                to_proxy = lane_browser.active_proxy()
                emit_progress(
                    "discovering",
                    "Rotating discovery proxy after throttle/block signal.",
                    status_output=status_output,
                    job_id=job_id,
                    source="discovery",
                    lane=lane_name,
                    engine=engine,
                    source_url=source_url,
                    reason=reason,
                    proxy_before=from_proxy,
                    proxy_after=to_proxy,
                )
                return rotated

            producer_tasks = []
            for lane_name, lane_sources in active_discovery_groups:
                lane_browser = discovery_browsers[lane_name]
                lane_discovery = LeadDiscovery(
                    limit=lane_limit,
                    search_terms=merged_search_terms,
                    signal_map=signal_map,
                    scoring_context=merged_scoring_context,
                    config=scraper_config,
                )
                async def lane_rotate(engine, source_url, reason, lane_name=lane_name):
                    return await rotate_proxy_on_block(lane_name, engine, source_url, reason)

                producer_tasks.append(
                    asyncio.create_task(
                        discovery_producer(
                            lane_name,
                            lane_discovery,
                            lane_browser,
                            batch_size,
                            lane_sources,
                            on_engine_blocked=lane_rotate,
                        )
                    )
                )
            worker_tasks = [
                asyncio.create_task(enrichment_worker(enrichment, session, worker_id=index + 1))
                for index in range(worker_count)
            ]

            try:
                await asyncio.gather(*producer_tasks)
                for _ in range(worker_count):
                    await candidate_queue.put(None)
                await candidate_queue.join()
                await asyncio.gather(*worker_tasks)
            finally:
                stop_event.set()
                for producer_task in producer_tasks:
                    if not producer_task.done():
                        producer_task.cancel()
                await asyncio.gather(*producer_tasks, return_exceptions=True)
                for worker_task in worker_tasks:
                    if not worker_task.done():
                        worker_task.cancel()
                await asyncio.gather(*worker_tasks, return_exceptions=True)

        await enrichment_context.close()
        await enrichment_browser.close()
        for lane_name, lane_browser in discovery_browsers.items():
            await lane_browser.close()

    top_leads, effective_min_score, pack_stage_events = build_lead_pack(
        scoring=scoring,
        scored_candidates=scored_candidates,
        limit=limit,
        min_score=min_score,
        fill_until_complete=fill_until_complete,
        backfill_mode=backfill_mode,
    )
    for stage_name, stage_floor, lead_count in pack_stage_events:
        if stage_name == "strict":
            continue
        emit_progress(
            "scoring",
            "Adjusted quality gate to protect target lead count.",
            status_output=status_output,
            job_id=job_id,
            source="scoring",
            stage=stage_name,
            stage_floor=stage_floor,
            qualified_count=lead_count,
            target_count=limit,
            analyzed_count=len(scored_candidates),
            effective_min_score=effective_min_score,
        )

    emit_progress(
        "enriched",
        "Candidate enrichment stream completed.",
        status_output=status_output,
        job_id=job_id,
        source="enrichment",
        enriched_count=len(enriched_candidates),
        qualified_count=len(top_leads),
        target_count=limit,
        candidate_count=len(candidates),
        analyzed_count=len(scored_candidates),
        effective_min_score=effective_min_score,
    )

    if not candidates:
        print("No candidates found during discovery phase.")
        emit_progress(
            "failed",
            "No candidates found during discovery.",
            status_output=status_output,
            job_id=job_id,
            source="discovery",
        )
        return

    print(
        f"Lead-pack selection: {len(top_leads)}/{limit} selected leads from {len(scored_candidates)} enriched candidates"
    )

    recent_domains_path = _recent_domains_file(output)
    recent_domains = load_recent_domains(recent_domains_path, max_items=500)
    top_leads, dropped_as_repeats, restored_repeats = apply_recent_domain_suppression(
        leads=top_leads,
        recent_domains=recent_domains,
        limit=limit,
        preserve_target=fill_until_complete,
    )
    if dropped_as_repeats:
        emit_progress(
            "scoring",
            "Suppressed recently delivered domains from this batch.",
            status_output=status_output,
            job_id=job_id,
            source="scoring",
            dropped_repeat_domains=dropped_as_repeats,
            recent_memory_size=len(recent_domains),
            qualified_count=len(top_leads),
            target_count=limit,
            restored_repeats=restored_repeats,
        )
    repeated_fill_count = 0
    if fill_until_complete and len(top_leads) < limit and top_leads:
        top_leads, repeated_fill_count = pad_lead_pack_with_repeats(top_leads, limit)
        if repeated_fill_count:
            emit_progress(
                "scoring",
                "Repeated top leads to satisfy guaranteed pack size.",
                status_output=status_output,
                job_id=job_id,
                source="scoring",
                repeated_fill_count=repeated_fill_count,
                qualified_count=len(top_leads),
                target_count=limit,
            )

    emit_progress(
        "exporting",
        "Writing customer exports.",
        status_output=status_output,
        job_id=job_id,
        source="scoring",
        qualified_count=len(top_leads),
        target_count=limit,
        analyzed_count=len(scored_candidates),
        effective_min_score=effective_min_score,
        output=output,
        output_format=output_format,
    )
    exporter = LeadExport(output_file=output)
    exporter.save(
        top_leads,
        region=region,
        industry=industry,
        run_id=run_id,
        output_format=output_format,
    )
    if audit_output:
        audit_exporter = LeadExport(output_file=audit_output)
        audit_exporter.save(
            scored_candidates,
            region=region,
            industry=industry,
            run_id=run_id,
            output_format=output_format,
        )
    filled_pack = len(top_leads) >= limit
    delivered_domains = [_normalize_domain_value(lead.get("domain", "")) for lead in top_leads if lead.get("domain")]
    if delivered_domains:
        save_recent_domains(
            recent_domains_path,
            recent_domains,
            delivered_domains,
            max_items=500,
        )
    if not filled_pack:
        message = "Could not fill the paid lead pack before the candidate hard cap."
        if fill_until_complete:
            emit_progress(
                "delivered",
                "Scraper job completed with relaxed fill results.",
                status_output=status_output,
                job_id=job_id,
                source="scoring",
                qualified_count=len(top_leads),
                target_count=limit,
                analyzed_count=len(scored_candidates),
                output=output,
                output_format=output_format,
                audit_output=audit_output or "",
                filled_pack=False,
                effective_min_score=effective_min_score,
                partial_fill=True,
                warning=f"{message} Qualified {len(top_leads)}/{limit} after analyzing {len(scored_candidates)} candidates.",
            )
            return
        emit_progress(
            "delivered",
            "Scraper job completed with partial results.",
            status_output=status_output,
            job_id=job_id,
            source="scoring",
            qualified_count=len(top_leads),
            target_count=limit,
            analyzed_count=len(scored_candidates),
            effective_min_score=effective_min_score,
            output=output,
            output_format=output_format,
            audit_output=audit_output or "",
            filled_pack=False,
            partial_fill=True,
            warning=f"{message} Qualified {len(top_leads)}/{limit} after analyzing {len(scored_candidates)} candidates.",
        )
        return

    emit_progress(
        "delivered",
        "Scraper job completed.",
        status_output=status_output,
        job_id=job_id,
        source="scoring",
        qualified_count=len(top_leads),
        target_count=limit,
        analyzed_count=len(scored_candidates),
        effective_min_score=effective_min_score,
        output=output,
        output_format=output_format,
        audit_output=audit_output or "",
        filled_pack=True,
    )

async def run_hunt_first_a_plus(
    region,
    industry,
    output,
    output_format,
    audit_output,
    max_analyzed,
    a_plus_score,
    status_output=None,
    job_id=None,
    proxy_pool=None,
    proxy_file=None,
    job_config=None,
):
    print(
        f"Starting A+ hunt | Region: {region} | Industry: {industry} | Hard stop: {max_analyzed} analyzed candidates"
    )
    emit_progress(
        "starting",
        "A+ hunt job started.",
        status_output=status_output,
        job_id=job_id,
        region=region,
        industry=industry,
        max_analyzed=max_analyzed,
        a_plus_score=a_plus_score,
        output_format=output_format,
    )

    try:
        from playwright.async_api import async_playwright
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing Playwright dependency. Run `pip install -r scraper/requirements.txt` "
            "and `python -m playwright install chromium`."
        ) from exc

    from modules.discovery import LeadDiscovery
    from modules.enrichment import LeadEnrichment
    from modules.export import LeadExport
    from modules.scoring import LeadScoring

    config_slug, scraper_config = _resolve_scraper_config(industry, region, job_config)

    run_id = f"hunt-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"
    start_time = time.perf_counter()
    discovery = LeadDiscovery(limit=max_analyzed, config=scraper_config)
    scoring = LeadScoring(require_email=True, require_buyer_evidence=True, industry=industry, config=scraper_config)
    analyzed_candidates = []
    analyzed_domains = set()
    found_lead = None

    resolved_proxies = resolve_proxy_pool(proxy_pool=proxy_pool, proxy_file=proxy_file)
    if resolved_proxies:
        resolved_proxies = await healthcheck_proxy_pool(
            resolved_proxies,
            status_output=status_output,
            job_id=job_id,
        )
    async with async_playwright() as p:
        user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        discovery_browser = RotatingDiscoveryBrowser(
            playwright=p,
            user_agent=user_agent,
            proxy_pool=resolved_proxies,
        )
        await discovery_browser.start()
        enrichment_browser = await p.chromium.launch(headless=True)
        context = await enrichment_browser.new_context(user_agent=user_agent)
        page = discovery_browser
        enrichment = LeadEnrichment(
            concurrency=1,
            max_extra_pages=12,
            browser_context=context,
            config=scraper_config,
        )

        async def analyze_candidate(candidate):
            nonlocal found_lead
            initial_domain = candidate.get("domain")
            if initial_domain in analyzed_domains:
                return False

            index = len(analyzed_candidates) + 1
            elapsed = round(time.perf_counter() - start_time, 2)
            print(f"Hunt analyzing {index}/{max_analyzed}: {candidate.get('domain')} | elapsed={elapsed}s")
            enriched = await enrichment.run_enrichment([candidate])
            resolved_domain = enriched[0].get("domain")
            if resolved_domain in analyzed_domains:
                print(f"Hunt skipping duplicate resolved domain: {resolved_domain}")
                return False
            if resolved_domain:
                analyzed_domains.add(resolved_domain)
            if initial_domain:
                analyzed_domains.add(initial_domain)

            scored = scoring.evaluate_candidate(enriched[0])
            scoring.rank_and_filter([scored], limit=1, min_score=a_plus_score)
            scored["analyzed_index"] = index
            scored["elapsed_seconds"] = round(time.perf_counter() - start_time, 2)
            scored["is_a_plus"] = scoring.is_a_plus(scored, min_score=a_plus_score)
            analyzed_candidates.append(scored)
            emit_progress(
                "analyzing",
                "A+ hunt candidate analyzed.",
                status_output=status_output,
                job_id=job_id,
                analyzed_count=len(analyzed_candidates),
                max_analyzed=max_analyzed,
                domain=scored.get("domain", ""),
                score=scored.get("score", 0),
                is_a_plus=scored["is_a_plus"],
            )

            if audit_output:
                LeadExport(output_file=audit_output).save(
                    analyzed_candidates,
                    region=region,
                    industry=industry,
                    run_id=run_id,
                    output_format=output_format,
                )

            if scored["is_a_plus"]:
                found_lead = scored
                print(
                    f"A+ lead found after {index} analyzed candidates and {scored['elapsed_seconds']} seconds: {scored.get('domain')}"
                )
                emit_progress(
                    "exporting",
                    "A+ lead found; writing export.",
                    status_output=status_output,
                    job_id=job_id,
                    analyzed_count=len(analyzed_candidates),
                    domain=scored.get("domain", ""),
                )
                return True
            return False

        sources = discovery.generate_sources(region, industry)
        for source in sources:
            if found_lead or len(analyzed_candidates) >= max_analyzed:
                break

            if source.candidate_kind == "seed_list":
                print(f"Hunt source: {source.name}")
                for seed_url in discovery.seed_urls(region, source.name):
                    candidate = discovery._candidate_from_url(seed_url, source, region, industry)
                    if not candidate:
                        continue
                    if await analyze_candidate(candidate):
                        break
                    if len(analyzed_candidates) >= max_analyzed:
                        break
                continue

            print(f"Hunt source: {source.url}")
            try:
                await page.goto(source.url, timeout=30000, wait_until="domcontentloaded")
                await page.wait_for_timeout(1000)
                if await discovery._looks_like_block_page(page):
                    if resolved_proxies and len(resolved_proxies) > 1:
                        await discovery_browser.rotate(reason=f"hunt block on {source.url}")
                    continue
                links = await discovery._extract_links_from_source(page, source)
            except Exception as exc:
                print(f"Hunt source failed: {source.url} | {exc}")
                if discovery._is_throttle_or_block_error(str(exc)) and resolved_proxies and len(resolved_proxies) > 1:
                    await discovery_browser.rotate(reason=f"hunt error on {source.url}")
                continue

            found_in_source = 0
            for raw_href in links:
                clean_url = discovery._clean_candidate_url(raw_href, source.url)
                if not clean_url:
                    continue
                candidate = discovery._candidate_from_url(clean_url, source, region, industry)
                if not candidate:
                    continue
                found_in_source += 1
                if await analyze_candidate(candidate):
                    break
                if len(analyzed_candidates) >= max_analyzed:
                    break
            print(
                f"Hunt source complete: {found_in_source} analyzed candidates from {source.name}; total analyzed={len(analyzed_candidates)}"
            )

        await context.close()
        await enrichment_browser.close()
        await discovery_browser.close()

    total_elapsed = round(time.perf_counter() - start_time, 2)
    if found_lead:
        LeadExport(output_file=output).save(
            [found_lead],
            region=region,
            industry=industry,
            run_id=run_id,
            output_format=output_format,
        )
    else:
        print(
            f"No A+ lead found after analyzing {len(analyzed_candidates)} candidates in {total_elapsed} seconds."
        )

    average_seconds = round(total_elapsed / len(analyzed_candidates), 2) if analyzed_candidates else 0
    print(
        "Hunt summary | "
        f"a_plus_found={bool(found_lead)} | "
        f"analyzed={len(analyzed_candidates)} | "
        f"elapsed_seconds={total_elapsed} | "
        f"avg_seconds_per_analyzed={average_seconds}"
    )
    emit_progress(
        "delivered" if found_lead else "failed",
        "A+ hunt completed." if found_lead else "No A+ lead found before the hard stop.",
        status_output=status_output,
        job_id=job_id,
        a_plus_found=bool(found_lead),
        analyzed_count=len(analyzed_candidates),
        elapsed_seconds=total_elapsed,
        output=output,
        audit_output=audit_output or "",
    )

async def run_scraper_adaptive(
    region,
    industry,
    limit,
    output,
    output_format,
    test_mode,
    min_score,
    fill_until_complete=False,
    audit_output=None,
    allow_no_email=False,
    allow_weak_buyer_evidence=False,
    status_output=None,
    job_id=None,
    max_analyzed=None,
    search_terms=None,
    scoring_context=None,
    job_config=None,
    proxy_pool=None,
    proxy_file=None,
):
    """Adaptive 3-phase pipeline: discover broadly → qualify deeply → adapt & retry."""
    region = normalize_region(region)
    print(
        f"Starting adaptive scraper | Region: {region} | Industry: {industry} | Limit: {limit} | Test mode: {test_mode}"
    )
    emit_progress(
        "starting",
        "Adaptive scraper job started.",
        status_output=status_output,
        job_id=job_id,
        source="system",
        region=region,
        industry=industry,
        limit=limit,
        pipeline="adaptive",
    )

    try:
        from playwright.async_api import async_playwright
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing Playwright dependency. Run `pip install -r scraper/requirements.txt` "
            "and `python -m playwright install chromium`."
        ) from exc

    from modules.discovery import LeadDiscovery
    from modules.enrichment import LeadEnrichment
    from modules.export import LeadExport
    from modules.scoring import LeadScoring
    from modules.signal_map import build_signal_map
    from modules.diagnostics import PhaseDiagnostics

    try:
        import aiohttp
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing dependency: aiohttp. Install with `pip install -r scraper/requirements.txt`."
        ) from exc

    config_slug, scraper_config = _resolve_scraper_config(industry, region, job_config)
    backfill_mode = _lead_pack_backfill_mode(scraper_config)

    discovery_limit = compute_discovery_limit(
        limit=limit,
        test_mode=test_mode,
        max_analyzed=max_analyzed,
    )
    run_id = f"run-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"

    signal_map = build_signal_map(region=region, industry=industry, search_terms=search_terms, config=scraper_config)
    merged_search_terms = merge_search_terms(signal_map.get("routed_search_terms", []), search_terms or [])
    merged_scoring_context = merge_scoring_context(signal_map.get("scoring_context"), scoring_context)
    resolved_proxies = resolve_proxy_pool(proxy_pool=proxy_pool, proxy_file=proxy_file)
    if resolved_proxies:
        resolved_proxies = await healthcheck_proxy_pool(
            resolved_proxies,
            status_output=status_output,
            job_id=job_id,
        )
    emit_progress(
        "planning",
        "Signal map generated for adaptive discovery routing.",
        status_output=status_output,
        job_id=job_id,
        source="system",
        signal_cluster=signal_map.get("cluster", ""),
        signal_count=len(signal_map.get("signals", [])),
        routed_search_terms=len(merged_search_terms),
        proxy_count=len(resolved_proxies),
        pipeline="adaptive",
    )

    scoring = LeadScoring(
        require_email=not allow_no_email,
        require_buyer_evidence=not allow_weak_buyer_evidence,
        scoring_context=merged_scoring_context,
        industry=industry,
        config=scraper_config,
    )
    worker_count = 2 if test_mode else 4

    diagnostics = PhaseDiagnostics(region=region, industry=industry, target_limit=limit)
    all_scored_candidates = []
    all_enriched = []
    top_leads = []
    seen_enriched_domains = set()
    state_lock = asyncio.Lock()

    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )

    async with async_playwright() as p:
        enrichment_browser = await p.chromium.launch(headless=True)
        enrichment_ctx = await enrichment_browser.new_context(user_agent=user_agent)

        current_min_score = min_score

        # FUTURE: bailout threshold — if Phase 1 produces >500 raw candidates but
        # the first ~100 score below 40 on average, the discovery pool is likely
        # noise. A lightweight pre-score on a sample before full enrichment would
        # save 1000+ wasted page fetches. Leave for now; revisit when tuning scale.
        async def _enrich_candidates(candidates_to_process):
            scored_list = []
            enriched_list = []
            phase_domains = set()

            async with aiohttp.ClientSession(
                connector=aiohttp.TCPConnector(limit_per_host=max(2, worker_count), ttl_dns_cache=300),
                timeout=aiohttp.ClientTimeout(total=20),
                headers={
                    "User-Agent": user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            ) as session:
                enrichment = LeadEnrichment(
                    concurrency=worker_count,
                    max_extra_pages=12,
                    browser_context=enrichment_ctx,
                    browser_fallback_concurrency=max(1, worker_count // 2),
                    config=scraper_config,
                )
                sem = asyncio.Semaphore(worker_count)

                async def _process_one(candidate):
                    async with sem:
                        domain = candidate.get("domain", "")
                        if not domain:
                            return
                        async with state_lock:
                            norm = domain.strip().lower()
                            if norm.startswith("www."):
                                norm = norm[4:]
                            if norm in seen_enriched_domains or norm in phase_domains:
                                return
                            phase_domains.add(norm)
                        try:
                            enriched = await enrichment.enrich_candidate(session, candidate)
                        except Exception:
                            return
                        if not enriched or not enriched.get("fetch_ok"):
                            return
                        scored = scoring.evaluate_candidate(enriched)
                        async with state_lock:
                            seen_enriched_domains.add(norm)
                            enriched_list.append(enriched)
                            scored_list.append(scored)
                            all_enriched.append(enriched)
                            all_scored_candidates.append(scored)

                tasks = [asyncio.create_task(_process_one(c)) for c in candidates_to_process]
                await asyncio.gather(*tasks, return_exceptions=True)

            return enriched_list, scored_list

        for iteration in range(3):
            depth = iteration + 1

            emit_progress(
                "discovering",
                f"Adaptive depth={depth}, iteration={iteration + 1}/3.",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
                iteration=iteration,
                depth=depth,
                pipeline="adaptive",
            )

            diagnostics.start_phase(f"depth{depth}", iteration=iteration, depth=depth)

            discovery_template = LeadDiscovery(
                limit=discovery_limit,
                search_terms=merged_search_terms,
                signal_map=signal_map,
                scoring_context=merged_scoring_context,
                diagnostics=diagnostics,
                config=scraper_config,
            )
            sources = discovery_template.generate_sources(region, industry, depth=depth)
            source_groups = partition_discovery_sources(sources)
            active_groups = list(source_groups.items())
            if not active_groups:
                active_groups = [("main", [])]
            lane_limit = max(limit, discovery_limit // max(1, len(active_groups)))

            discovery_browsers = {}
            phase_candidates = []

            for lane_idx, (lane_name, _) in enumerate(active_groups):
                lane_proxies = resolved_proxies if lane_name != "main" else []
                lane_browser = RotatingDiscoveryBrowser(
                    playwright=p,
                    user_agent=user_agent,
                    proxy_pool=lane_proxies,
                    start_index=lane_idx,
                )
                await lane_browser.start()
                discovery_browsers[lane_name] = lane_browser

            for lane_name, lane_sources in active_groups:
                lane_browser = discovery_browsers.get(lane_name)
                if not lane_browser:
                    continue
                lane_discovery = LeadDiscovery(
                    limit=lane_limit,
                    search_terms=merged_search_terms,
                    signal_map=signal_map,
                    scoring_context=merged_scoring_context,
                    diagnostics=diagnostics,
                    config=scraper_config,
                )
                async for batch in lane_discovery.run_discovery(
                    lane_browser,
                    region=region,
                    industry=industry,
                    chunk_size=40,
                    sources=lane_sources,
                ):
                    if batch:
                        phase_candidates.extend(batch)

            for _, lb in discovery_browsers.items():
                await lb.close()

            print(
                f"Phase {iteration + 1} discovery: {len(phase_candidates)} raw candidates at depth={depth}"
            )
            emit_progress(
                "discovered",
                f"Discovery phase {iteration + 1} complete.",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
                candidate_count=len(phase_candidates),
                depth=depth,
                iteration=iteration,
                pipeline="adaptive",
            )

            if phase_candidates:
                enriched, scored = await _enrich_candidates(phase_candidates)
                print(f"Phase {iteration + 1} enrichment: {len(scored)} scored candidates")

            top_leads, effective_min_score, pack_stages = build_lead_pack(
                scoring=scoring,
                scored_candidates=all_scored_candidates,
                limit=limit,
                min_score=current_min_score,
                fill_until_complete=False,
                backfill_mode=backfill_mode,
            )

            diagnostics.finish_phase(
                enriched=len(all_enriched),
                scored=len(all_scored_candidates),
                qualified=len(top_leads),
                effective_min_score=effective_min_score,
                pack_stages=pack_stages,
            )

            for stage_name, stage_floor, lead_count in pack_stages:
                if stage_name == "strict":
                    continue
                emit_progress(
                    "scoring",
                    "Adjusted quality gate in adaptive pipeline.",
                    status_output=status_output,
                    job_id=job_id,
                    source="scoring",
                    stage=stage_name,
                    stage_floor=stage_floor,
                    qualified_count=lead_count,
                    target_count=limit,
                    analyzed_count=len(all_scored_candidates),
                    effective_min_score=effective_min_score,
                    iteration=iteration,
                    depth=depth,
                )

            if len(top_leads) >= limit:
                emit_progress(
                    "discovering",
                    f"Target reached at depth={depth}.",
                    status_output=status_output,
                    job_id=job_id,
                    source="discovery",
                    qualified_count=len(top_leads),
                    target_count=limit,
                    depth=depth,
                    pipeline="adaptive",
                )
                break

            gap = max(0, limit - len(top_leads))
            emit_progress(
                "discovering",
                f"Gap: {gap} leads needed. Running diagnostics...",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
                gap=gap,
                qualified_count=len(top_leads),
                target_count=limit,
                depth=depth,
                pipeline="adaptive",
            )

            adjustments = diagnostics.heuristic_adjustments()
            if adjustments.get("scoring_adjustment"):
                current_min_score = adjustments["scoring_adjustment"].get("min_score", current_min_score)

            if adjustments.get("new_query_variants") and iteration >= 1:
                merged_search_terms = list(dict.fromkeys(
                    list(merged_search_terms) + adjustments["new_query_variants"][:5]
                ))
                emit_progress(
                    "discovering",
                    "Diagnostics suggested new query variants.",
                    status_output=status_output,
                    job_id=job_id,
                    source="discovery",
                    new_queries=adjustments["new_query_variants"][:5],
                    pipeline="adaptive",
                )

            if iteration >= 1 and gap > 3:
                ai_result = await diagnostics.ai_suggest_strategy()
                if ai_result:
                    new_qs = ai_result.get("new_queries", [])
                    if new_qs:
                        merged_search_terms = list(dict.fromkeys(
                            list(merged_search_terms) + new_qs
                        ))
                        emit_progress(
                            "discovering",
                            "AI suggested new search strategies.",
                            status_output=status_output,
                            job_id=job_id,
                            source="discovery",
                            ai_suggestions=new_qs,
                            ai_reasoning=ai_result.get("reasoning", ""),
                            pipeline="adaptive",
                        )
                    if ai_result.get("scoring_floor"):
                        current_min_score = max(20, int(ai_result["scoring_floor"]))

        await enrichment_ctx.close()
        await enrichment_browser.close()

    print(f"\n{diagnostics.to_log_summary()}")

    if not all_scored_candidates:
        print("No candidates found during any discovery phase.")
        emit_progress(
            "failed",
            "No candidates found during adaptive discovery.",
            status_output=status_output,
            job_id=job_id,
            source="discovery",
            pipeline="adaptive",
        )
        return

    top_leads, effective_min_score, pack_stages = build_lead_pack(
        scoring=scoring,
        scored_candidates=all_scored_candidates,
        limit=limit,
        min_score=min_score,
        fill_until_complete=fill_until_complete,
        backfill_mode=backfill_mode,
    )
    for stage_name, stage_floor, lead_count in pack_stages:
        if stage_name == "strict":
            continue
        emit_progress(
            "scoring",
            "Safety-net backfill applied to reach lead target.",
            status_output=status_output,
            job_id=job_id,
            source="scoring",
            stage=stage_name,
            stage_floor=stage_floor,
            qualified_count=lead_count,
            target_count=limit,
            analyzed_count=len(all_scored_candidates),
            effective_min_score=effective_min_score,
            pipeline="adaptive",
        )

    recent_domains_path = _recent_domains_file(output)
    recent_domains = load_recent_domains(recent_domains_path, max_items=500)
    top_leads, dropped, restored = apply_recent_domain_suppression(
        leads=top_leads,
        recent_domains=recent_domains,
        limit=limit,
        preserve_target=fill_until_complete,
    )
    if dropped:
        emit_progress(
            "scoring",
            "Suppressed recently delivered domains.",
            status_output=status_output,
            job_id=job_id,
            source="scoring",
            dropped_repeat_domains=dropped,
            qualified_count=len(top_leads),
            target_count=limit,
        )

    if fill_until_complete and len(top_leads) < limit and top_leads:
        top_leads, repeated = pad_lead_pack_with_repeats(top_leads, limit)
        if repeated:
            emit_progress(
                "scoring",
                "Repeated top leads to satisfy guaranteed pack size.",
                status_output=status_output,
                job_id=job_id,
                source="scoring",
                repeated_fill_count=repeated,
                qualified_count=len(top_leads),
                target_count=limit,
            )

    emit_progress(
        "exporting",
        "Writing adaptive scraper exports.",
        status_output=status_output,
        job_id=job_id,
        source="scoring",
        qualified_count=len(top_leads),
        target_count=limit,
        analyzed_count=len(all_scored_candidates),
        effective_min_score=effective_min_score,
        output=output,
        output_format=output_format,
        pipeline="adaptive",
    )
    exporter = LeadExport(output_file=output)
    exporter.save(
        top_leads,
        region=region,
        industry=industry,
        run_id=run_id,
        output_format=output_format,
    )
    if audit_output:
        audit_exporter = LeadExport(output_file=audit_output)
        audit_exporter.save(
            all_scored_candidates,
            region=region,
            industry=industry,
            run_id=run_id,
            output_format=output_format,
        )

    filled = len(top_leads) >= limit
    delivered_domains = [_normalize_domain_value(l.get("domain", "")) for l in top_leads if l.get("domain")]
    if delivered_domains:
        save_recent_domains(recent_domains_path, recent_domains, delivered_domains, max_items=500)

    status = "delivered" if filled else "delivered"
    emit_progress(
        status,
        "Adaptive scraper job completed." if filled else "Adaptive scraper completed with partial results.",
        status_output=status_output,
        job_id=job_id,
        source="scoring",
        qualified_count=len(top_leads),
        target_count=limit,
        analyzed_count=len(all_scored_candidates),
        effective_min_score=effective_min_score,
        output=output,
        output_format=output_format,
        audit_output=audit_output or "",
        filled_pack=filled,
        partial_fill=not filled,
        pipeline="adaptive",
    )



if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Buyer lead scraper for apparel/clothing markets")
    parser.add_argument(
        "--job-config",
        default=None,
        help="Optional SaaS job config JSON. Values in this file override CLI defaults.",
    )
    parser.add_argument(
        "--status-output",
        default=None,
        help="Optional JSONL file where machine-readable progress events are appended.",
    )
    parser.add_argument(
        "--job-id",
        default=None,
        help="Optional external job id included in progress events.",
    )
    parser.add_argument("--region", choices=["USA", "UK", "Europe", "International"], default="USA", help="Target market region")
    parser.add_argument(
        "--industry",
        default="clothing brands",
        help="Industry or query seed used in discovery (e.g., 'private label clothing')",
    )
    parser.add_argument("--limit", type=int, default=10, help="Final number of leads to export")
    parser.add_argument("--min-score", type=int, default=75, help="Minimum qualification score (0-100)")
    parser.add_argument(
        "--max-analyzed",
        type=int,
        default=None,
        help="Maximum candidates to analyze while filling the requested lead pack.",
    )
    parser.add_argument(
        "--search-term",
        action="append",
        dest="search_terms",
        default=[],
        help="Additional search query from the SaaS targeting preflight. Can be provided multiple times.",
    )
    parser.add_argument("--output", default="buyer_leads.csv", help="Output base file name")
    parser.add_argument(
        "--audit-output",
        default=None,
        help="Optional output base file for all scored candidates, including rejected leads",
    )
    parser.add_argument(
        "--format",
        choices=["csv", "json", "xlsx", "both", "all"],
        default="csv",
        help="Export format",
    )
    parser.add_argument("--test-mode", action="store_true", help="Run with lower internal limits for quick testing")
    parser.add_argument(
        "--hunt-first-a-plus",
        action="store_true",
        help="Analyze candidates one by one until the first A+ lead is found or the hard stop is reached",
    )
    parser.add_argument(
        "--hunt-max-analyzed",
        type=int,
        default=150,
        help="Hard stop for --hunt-first-a-plus candidate analysis",
    )
    parser.add_argument(
        "--a-plus-score",
        type=int,
        default=85,
        help="Minimum score for A+ hunt success",
    )
    parser.add_argument(
        "--allow-no-email",
        action="store_true",
        help="Allow otherwise qualified leads without candidate-owned emails",
    )
    parser.add_argument(
        "--allow-weak-buyer-evidence",
        action="store_true",
        help="Allow leads that have product fit but weak buyer/importer/procurement evidence",
    )
    parser.add_argument(
        "--proxy",
        action="append",
        dest="proxy_pool",
        default=[],
        help="Proxy URL for discovery rotation (repeat flag for multiple proxies).",
    )
    parser.add_argument(
        "--proxy-file",
        default=None,
        help="Optional file containing one proxy URL per line for discovery rotation.",
    )
    parser.set_defaults(scoring_context=None, specialist_config_slug=None, specialist_job_config=None)
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Use legacy parallel pipeline instead of adaptive phased pipeline.",
    )
    
    args = parser.parse_args()
    if args.job_config:
        args = apply_job_config(args, load_job_config(args.job_config))

    try:
        if args.hunt_first_a_plus:
            asyncio.run(run_hunt_first_a_plus(
                region=args.region,
                industry=args.industry,
                output=args.output,
                output_format=args.format,
                audit_output=args.audit_output,
                max_analyzed=args.hunt_max_analyzed,
                a_plus_score=args.a_plus_score,
                status_output=args.status_output,
                job_id=args.job_id,
                proxy_pool=args.proxy_pool,
                proxy_file=args.proxy_file,
                job_config=args.specialist_job_config,
            ))
        elif args.legacy:
            asyncio.run(run_scraper(
                region=args.region,
                industry=args.industry,
                limit=args.limit,
                output=args.output,
                output_format=args.format,
                test_mode=args.test_mode,
                min_score=args.min_score,
                fill_until_complete=getattr(args, "fill_until_complete", False),
                audit_output=args.audit_output,
                allow_no_email=args.allow_no_email,
                allow_weak_buyer_evidence=args.allow_weak_buyer_evidence,
                status_output=args.status_output,
                job_id=args.job_id,
                max_analyzed=args.max_analyzed,
                search_terms=args.search_terms,
                scoring_context=args.scoring_context,
                proxy_pool=args.proxy_pool,
                proxy_file=args.proxy_file,
                job_config=args.specialist_job_config,
            ))
        else:
            asyncio.run(run_scraper_adaptive(
                region=args.region,
                industry=args.industry,
                limit=args.limit,
                output=args.output,
                output_format=args.format,
                test_mode=args.test_mode,
                min_score=args.min_score,
                fill_until_complete=getattr(args, "fill_until_complete", False),
                audit_output=args.audit_output,
                allow_no_email=args.allow_no_email,
                allow_weak_buyer_evidence=args.allow_weak_buyer_evidence,
                status_output=args.status_output,
                job_id=args.job_id,
                max_analyzed=args.max_analyzed,
                search_terms=args.search_terms,
                scoring_context=args.scoring_context,
                proxy_pool=args.proxy_pool,
                proxy_file=args.proxy_file,
                job_config=args.specialist_job_config,
            ))
    except Exception as exc:
        emit_progress(
            "failed",
            "Scraper job failed.",
            status_output=args.status_output,
            job_id=args.job_id,
            error=str(exc),
        )
        raise
