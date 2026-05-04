import asyncio
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
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

    return args


def compute_discovery_limit(limit, test_mode=False, max_analyzed=None):
    if max_analyzed is not None:
        hard_cap = max(limit, int(max_analyzed))
        if test_mode:
            default_test_limit = min(120, max(limit * 20, 80))
            return max(limit, min(hard_cap, default_test_limit))
        return hard_cap

    if test_mode:
        return min(120, max(limit * 20, 80))
    return max(limit * 300, 1000)


def relaxed_score_thresholds(min_score):
    floor = max(35, int(min_score) if min_score is not None else 75)
    thresholds = [floor, max(35, floor - 5), max(35, floor - 10), max(35, floor - 15), 35]
    return [threshold for index, threshold in enumerate(thresholds) if threshold not in thresholds[:index]]


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

    try:
        import aiohttp
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing dependency: aiohttp. Install with `pip install -r scraper/requirements.txt`."
        ) from exc

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

    scoring = LeadScoring(
        require_email=not allow_no_email,
        require_buyer_evidence=not allow_weak_buyer_evidence,
        scoring_context=scoring_context,
    )

    worker_count = 2 if test_mode else 4
    candidate_queue = asyncio.Queue(maxsize=max(80, min(240, limit * 20)))
    stop_event = asyncio.Event()
    state_lock = asyncio.Lock()

    async def discovery_producer(discovery, page, chunk_size):
        batch_index = 0
        discovered_count = 0
        try:
            emit_progress(
                "discovering",
                "Discovery started.",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
                queue_maxsize=candidate_queue.maxsize,
            )
            async for candidate_batch in discovery.run_discovery(
                page,
                region=region,
                industry=industry,
                chunk_size=chunk_size,
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
            for _ in range(worker_count):
                await candidate_queue.put(None)
            emit_progress(
                "discovered",
                "Discovery stream completed.",
                status_output=status_output,
                job_id=job_id,
                source="discovery",
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
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        discovery = LeadDiscovery(limit=discovery_limit, search_terms=search_terms)
        enrichment = LeadEnrichment(
            concurrency=worker_count,
            max_extra_pages=12,
            browser_context=context,
            browser_fallback_concurrency=max(1, worker_count // 2),
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
            producer_task = asyncio.create_task(discovery_producer(discovery, page, batch_size))
            worker_tasks = [
                asyncio.create_task(enrichment_worker(enrichment, session, worker_id=index + 1))
                for index in range(worker_count)
            ]

            try:
                await producer_task
                await candidate_queue.join()
                await asyncio.gather(*worker_tasks)
            finally:
                stop_event.set()
                for worker_task in worker_tasks:
                    if not worker_task.done():
                        worker_task.cancel()
                await asyncio.gather(*worker_tasks, return_exceptions=True)

        await browser.close()

    if fill_until_complete and len(top_leads) < limit and scored_candidates:
        for threshold in relaxed_score_thresholds(min_score)[1:]:
            candidate_leads = scoring.rank_and_filter(scored_candidates, limit=limit, min_score=threshold)
            if len(candidate_leads) <= len(top_leads):
                continue
            top_leads.clear()
            top_leads.extend(candidate_leads)
            effective_min_score = threshold
            emit_progress(
                "scoring",
                "Relaxed quality threshold to fill the lead pack.",
                status_output=status_output,
                job_id=job_id,
                source="scoring",
                analyzed_count=len(scored_candidates),
                qualified_count=len(top_leads),
                target_count=limit,
                min_score=threshold,
                effective_min_score=threshold,
            )
            if len(top_leads) >= limit:
                break

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
        f"Quality filter: {len(top_leads)}/{limit} qualified leads from {len(scored_candidates)} enriched candidates"
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

    run_id = f"hunt-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"
    start_time = time.perf_counter()
    discovery = LeadDiscovery(limit=max_analyzed)
    scoring = LeadScoring(require_email=True, require_buyer_evidence=True)
    analyzed_candidates = []
    analyzed_domains = set()
    found_lead = None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        enrichment = LeadEnrichment(
            concurrency=1,
            max_extra_pages=12,
            browser_context=context,
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
                links = await discovery._extract_links_from_source(page, source)
            except Exception as exc:
                print(f"Hunt source failed: {source.url} | {exc}")
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

        await browser.close()

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
    parser.set_defaults(scoring_context=None)
    
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
            ))
        else:
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
