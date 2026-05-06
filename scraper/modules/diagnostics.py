import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False


@dataclass
class QueryPerformance:
    query: str
    slug: str = ""
    total_returned: int = 0
    passed_intake: int = 0
    blocked_by_host: int = 0
    blocked_by_domain: int = 0
    blocked_by_tld: int = 0
    blocked_by_path: int = 0
    blocked_by_country: int = 0
    blocked_by_dedup: int = 0


@dataclass
class PhaseStats:
    phase: str
    iteration: int = 0
    depth: int = 1
    total_sources: int = 0
    total_searched: int = 0
    total_returned: int = 0
    passed_intake: int = 0
    blocked_by_host: int = 0
    blocked_by_domain: int = 0
    blocked_by_tld: int = 0
    blocked_by_path: int = 0
    blocked_by_country: int = 0
    blocked_by_dedup: int = 0
    query_performance: dict = field(default_factory=dict)
    enriched_count: int = 0
    scored_count: int = 0
    qualified_count: int = 0
    target_count: int = 0
    effective_min_score: int = 0
    pack_stages: list = field(default_factory=list)


class PhaseDiagnostics:
    """Collects per-phase stats and provides heuristic analysis for adaptive search."""

    def __init__(self, region="", industry="", target_limit=10):
        self.region = region
        self.industry = industry
        self.target_limit = target_limit
        self.phases: list[PhaseStats] = []
        self._current_phase: PhaseStats | None = None
        self._ai_called = False
        self._all_candidate_domains: set[str] = set()

    def start_phase(self, phase_name="discovery", iteration=0, depth=1):
        self._current_phase = PhaseStats(
            phase=phase_name,
            iteration=iteration,
            depth=depth,
            target_count=self.target_limit,
        )

    def record_intake(self, url, passed, blocked_reason=""):
        if self._current_phase is None:
            return
        self._current_phase.total_returned += 1
        if passed:
            self._current_phase.passed_intake += 1
        else:
            if "host" in blocked_reason:
                self._current_phase.blocked_by_host += 1
            elif "domain" in blocked_reason:
                self._current_phase.blocked_by_domain += 1
            elif "tld" in blocked_reason:
                self._current_phase.blocked_by_tld += 1
            elif "path" in blocked_reason:
                self._current_phase.blocked_by_path += 1
            elif "country" in blocked_reason:
                self._current_phase.blocked_by_country += 1
            elif "dedup" in blocked_reason:
                self._current_phase.blocked_by_dedup += 1

    def record_query_performance(self, slug, query_text, returned,
                                   passed, blocked_breakdown=None):
        if self._current_phase is None:
            return
        bp = blocked_breakdown or {}
        self._current_phase.query_performance[slug] = (
            self._current_phase.query_performance.get(slug, 0) + 1
        )
        if slug not in getattr(self, '_query_stats', {}):
            if not hasattr(self, '_query_stats'):
                self._query_stats: dict[str, dict] = {}
            self._query_stats[slug] = {
                "query": query_text,
                "total_returned": 0,
                "passed_intake": 0,
                "blocked_by_host": 0,
                "blocked_by_domain": 0,
                "blocked_by_tld": 0,
                "blocked_by_path": 0,
                "blocked_by_country": 0,
            }
        q = self._query_stats[slug]
        q["total_returned"] += returned
        q["passed_intake"] += passed
        q["blocked_by_host"] += bp.get("host", 0)
        q["blocked_by_domain"] += bp.get("domain", 0)
        q["blocked_by_tld"] += bp.get("tld", 0)
        q["blocked_by_path"] += bp.get("path", 0)
        q["blocked_by_country"] += bp.get("country", 0)

    def record_candidate_domain(self, domain):
        self._all_candidate_domains.add(domain)

    def finish_phase(self, enriched=0, scored=0, qualified=0,
                     effective_min_score=0, pack_stages=None):
        if self._current_phase is None:
            return None
        self._current_phase.enriched_count = enriched
        self._current_phase.scored_count = scored
        self._current_phase.qualified_count = qualified
        self._current_phase.effective_min_score = effective_min_score
        self._current_phase.pack_stages = pack_stages or []
        self.phases.append(self._current_phase)
        phase = self._current_phase
        self._current_phase = None
        return phase

    def total_candidates(self):
        return len(self._all_candidate_domains)

    def gap(self):
        """How many more leads are needed."""
        last = self.phases[-1] if self.phases else None
        if last is None:
            return self.target_limit
        return max(0, self.target_limit - last.qualified_count)

    def diagnosis_report(self):
        """Generate a structured diagnosis of why the target wasn't met."""
        if not self.phases:
            return {"status": "no_data", "message": "No phases completed."}

        latest = self.phases[-1]
        gap = self.gap()

        dead_queries = []
        promising_queries = []
        if hasattr(self, '_query_stats'):
            for slug, stats in self._query_stats.items():
                if stats["total_returned"] == 0:
                    dead_queries.append(slug)
                elif stats["passed_intake"] > 0:
                    promising_queries.append({
                        "slug": slug,
                        "query": stats["query"],
                        "total": stats["total_returned"],
                        "passed": stats["passed_intake"],
                        "pass_rate": round(stats["passed_intake"] / max(1, stats["total_returned"]) * 100, 1),
                    })

        promising_queries.sort(key=lambda x: x["passed"], reverse=True)

        top_blockers = [
            ("host_markers", latest.blocked_by_host),
            ("blocked_domains", latest.blocked_by_domain),
            ("tld_suffixes", latest.blocked_by_tld),
            ("path_exclusions", latest.blocked_by_path),
            ("country_suffixes", latest.blocked_by_country),
            ("deduplication", latest.blocked_by_dedup),
        ]
        top_blockers.sort(key=lambda x: x[1], reverse=True)
        top_blockers = [(name, count) for name, count in top_blockers if count > 0]

        return {
            "status": "gap_analysis",
            "region": self.region,
            "industry": self.industry,
            "target": self.target_limit,
            "qualified": latest.qualified_count,
            "gap": gap,
            "iterations": len(self.phases),
            "current_depth": latest.depth,
            "total_candidates_seen": latest.total_returned,
            "total_passed_intake": latest.passed_intake,
            "dead_queries": dead_queries,
            "promising_queries": promising_queries[:10],
            "top_blocking_filters": top_blockers,
            "total_unique_domains": len(self._all_candidate_domains),
            "effective_min_score": latest.effective_min_score,
            "pack_stages": latest.pack_stages,
        }

    def heuristic_adjustments(self):
        """Suggest adjustments without AI, based purely on stats."""
        report = self.diagnosis_report()
        adjustments = {
            "deepen_queries": [],
            "drop_queries": [],
            "relax_filters": [],
            "new_query_variants": [],
            "scoring_adjustment": None,
        }

        if report["status"] != "gap_analysis":
            if report["status"] == "no_data":
                adjustments["new_query_variants"] = [
                    f'{self.industry} buyers wholesale importers "{self.region}"',
                    f'{self.industry} procurement vendor portal "{self.region}"',
                    f'{self.industry} trade directory companies "{self.region}"',
                ]
            return adjustments

        for pq in report.get("promising_queries", []):
            if pq["passed"] > 0:
                adjustments["deepen_queries"].append(pq["slug"])

        adjustments["drop_queries"] = report.get("dead_queries", [])

        for blocker_name, count in report.get("top_blocking_filters", []):
            if count > 5:
                if blocker_name == "country_suffixes":
                    adjustments["relax_filters"].append("exporter_country_suffixes")
                elif blocker_name == "tld_suffixes":
                    adjustments["relax_filters"].append("blocked_tlds")
                elif blocker_name == "host_markers" and count > report["total_passed_intake"]:
                    adjustments["relax_filters"].append("host_markers")

        if report.get("effective_min_score", 75) > 50 and report["gap"] > 0:
            new_score = max(35, report["effective_min_score"] - 10)
            adjustments["scoring_adjustment"] = {"min_score": new_score}

        if not adjustments["deepen_queries"] and not adjustments["new_query_variants"]:
            adjustments["new_query_variants"] = [
                f'{self.industry} companies "{self.region}" contact email',
                f'{self.industry} firms "{self.region}" contact email',
                f'{self.industry} business directory "{self.region}"',
                f'{self.industry} import export "{self.region}"',
            ]

        return adjustments

    async def ai_suggest_strategy(self, extra_context=None):
        """Invoke AI (Gemini) for strategy suggestions. Only called after heuristics fail."""
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return None

        if self._ai_called:
            return None

        self._ai_called = True

        model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
        report = self.diagnosis_report()

        system_prompt = (
            "You are a lead generation search strategist. Given a diagnosis report "
            "from a failed lead discovery run, suggest concrete search query adjustments "
            "to find more buyer/importer leads. Return ONLY valid JSON with this structure: "
            '{"new_queries": ["query1", "query2"], "filters_to_relax": ["filter_name"], '
            '"region_focus": "narrower market", "scoring_floor": 50, "reasoning": "..."}'
        )

        user_msg = json.dumps({
            "task": "Suggest new search strategies to find more buyer/importer leads.",
            "industry": report["industry"],
            "region": report["region"],
            "target": report["target"],
            "leads_found": report["qualified"],
            "gap": report["gap"],
            "iterations_tried": report["iterations"],
            "dead_queries": report["dead_queries"][:5],
            "promising_queries": [
                {"query": q["query"], "pass_rate": q["pass_rate"]}
                for q in report.get("promising_queries", [])[:5]
            ],
            "top_blocking_filters": [
                {"filter": name, "count": count}
                for name, count in report.get("top_blocking_filters", [])
            ],
            "total_candidates_pool": report["total_unique_domains"],
            "extra_context": extra_context or "",
        }, ensure_ascii=False)

        full_prompt = f"{system_prompt}\n\n{user_msg}"

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [
                            {"parts": [{"text": full_prompt}]}
                        ],
                        "generationConfig": {
                            "maxOutputTokens": 300,
                            "temperature": 0.7,
                        },
                    },
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    if response.status != 200:
                        return None
                    data = await response.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        return None
                    content = (candidates[0].get("content", {})
                               .get("parts", [{}])[0]
                               .get("text", ""))
                    return self._parse_ai_response(content)
        except Exception:
            return None

    # Filters the AI is allowed to suggest relaxing; anything else is silently dropped.
    RELAXABLE_FILTERS = {"exporter_country_suffixes", "blocked_tlds", "host_markers"}

    @staticmethod
    def _parse_ai_response(content):
        try:
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                raw = result.get("filters_to_relax", [])
                if raw:
                    result["filters_to_relax"] = [
                        f for f in raw
                        if f in PhaseDiagnostics.RELAXABLE_FILTERS
                    ]
                return result
            return None
        except (json.JSONDecodeError, AttributeError):
            return None

    def to_log_summary(self):
        """Human-readable summary for status output."""
        if not self.phases:
            return "No diagnostic data collected."

        latest = self.phases[-1]
        lines = [
            f"Diagnostics Report | Region: {self.region} | Industry: {self.industry}",
            f"  Target: {self.target_limit} | Found: {latest.qualified_count} | Gap: {self.gap()}",
            f"  Iterations: {len(self.phases)} | Final Depth: {latest.depth}",
            f"  Intake: {latest.total_returned} seen → {latest.passed_intake} passed filters",
            f"  Unique Domains in Pool: {len(self._all_candidate_domains)}",
        ]
        if hasattr(self, '_query_stats'):
            dead = [s for s, q in self._query_stats.items() if q["total_returned"] == 0]
            if dead:
                lines.append(f"  Dead Queries ({len(dead)}): {', '.join(dead[:5])}")
        return "\n".join(lines)
