"""
Industry Router
===============
Classifies incoming requests and routes to specialist config YAMLs.

Three-tier classification:
  1. Deterministic keyword matching (free, instant, offline)
  2. Gemini API classification (when ambiguous, cached)
  3. Generic catch-all fallback (generic_b2b.yml)

Also queries Supabase for feedback patterns from past successful runs.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from .config_loader import ConfigLoader


class IndustryRouter:
    """Classifies industry strings and selects the right specialist config."""

    MATCH_THRESHOLD = 3  # Minimum keyword hits for deterministic match
    GEMINI_CACHE: Dict[str, str] = {}  # In-memory cache per industry string

    def __init__(self, config_dir: Optional[str] = None):
        self.loader = ConfigLoader(config_dir)
        self.configs: Dict[str, Dict[str, Any]] = {}
        self._trigger_map: Dict[str, str] = {}  # keyword → config_slug
        self._load()

    def _load(self):
        """Load all configs and build the trigger keyword map."""
        self.configs = self.loader.load_all()
        self._trigger_map = {}
        for slug, config in self.configs.items():
            for keyword in config.get("triggers", {}).get("keywords", []):
                lowered = keyword.lower().strip()
                if lowered:
                    self._trigger_map[lowered] = slug

    def reload(self):
        """Reload all configs from disk (for runtime tuning)."""
        self._load()

    # ------------------------------------------------------------------
    # Classification
    # ------------------------------------------------------------------

    def classify(self, industry: str, region: str = "USA") -> Tuple[str, Dict[str, Any], float]:
        """
        Given an industry string + region, return:
        - config_slug: which config file to use
        - config: the full parsed YAML dict
        - confidence: 0.0-1.0 how good the match is
        """
        industry_text = str(industry or "").strip()
        if not industry_text:
            return "generic_b2b", self.configs.get("generic_b2b", {}), 0.0

        # Tier 1: Deterministic keyword matching
        slug, confidence = self._deterministic_match(industry_text)
        if slug and confidence >= 0.7:
            return slug, self.configs[slug], confidence

        # Tier 2: Gemini classification (async — caller should handle)
        if os.environ.get("GEMINI_API_KEY") and industry_text not in self.GEMINI_CACHE:
            # Returning generic for now; caller can invoke Gemini async
            pass

        # Tier 3: Generic fallback
        return "generic_b2b", self.configs.get("generic_b2b", {}), 0.3

    def classify_async(self, industry: str, region: str = "USA") -> Tuple[str, Dict[str, Any], float]:
        """
        Async version that includes Gemini Tier 2.
        Requires: pip install aiohttp
        """
        industry_text = str(industry or "").strip()
        if not industry_text:
            return "generic_b2b", self.configs.get("generic_b2b", {}), 0.0

        # Tier 1
        slug, confidence = self._deterministic_match(industry_text)
        if slug and confidence >= 0.7:
            return slug, self.configs[slug], confidence

        # Tier 2: Gemini
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key and industry_text not in self.GEMINI_CACHE:
            try:
                # This requires a running event loop
                import asyncio
                slug = asyncio.get_event_loop().run_until_complete(
                    self._gemini_classify(industry_text, api_key)
                )
                if slug and slug in self.configs:
                    self.GEMINI_CACHE[industry_text] = slug
                    return slug, self.configs[slug], 0.85
            except Exception as e:
                print(f"[Router] Gemini classification failed: {e}")

        # Tier 3: Fallback
        return "generic_b2b", self.configs.get("generic_b2b", {}), 0.3

    def _deterministic_match(self, industry: str) -> Tuple[Optional[str], float]:
        """
        Score each config by how many trigger keywords match.
        Returns (slug, confidence).
        """
        text = industry.lower()
        tokens = set(re.split(r"[^a-z0-9]+", text))
        # Also check multi-word triggers
        phrases = [kw for kw in self._trigger_map if " " in kw]

        scores: Dict[str, int] = {}
        for config_slug in self.configs:
            scores[config_slug] = 0

        # Single-word token matching
        for token in tokens:
            if token in self._trigger_map:
                scores[self._trigger_map[token]] += 1

        # Multi-word phrase matching
        for phrase in phrases:
            if phrase in text:
                scores[self._trigger_map[phrase]] += 2  # Higher weight for phrase matches

        if not scores:
            return None, 0.0

        best_slug = max(scores, key=scores.get)
        best_score = scores[best_slug]
        total_possible = len(self.configs[best_slug].get("triggers", {}).get("keywords", []))

        if best_score >= self.MATCH_THRESHOLD:
            confidence = min(1.0, best_score / (self.MATCH_THRESHOLD * 2))
            return best_slug, confidence

        return None, best_score / max(self.MATCH_THRESHOLD, 1)

    async def _gemini_classify(self, industry: str, api_key: str) -> Optional[str]:
        """Use Gemini to classify the industry into an available config slug."""
        available = self.loader.list_available()
        available_names = {c["slug"]: c["display_name"] for c in available}

        prompt = (
            "You are an industry classifier for a lead-generation system. "
            f"Given the industry description: \"{industry}\"\n\n"
            "Classify it into ONE of these specialist configs:\n"
            + "\n".join(f"- {slug}: {name}" for slug, name in available_names.items())
            + "\n\nReturn ONLY valid JSON: {\"best_match_slug\": \"<slug>\", \"confidence\": 0.0-1.0, \"reasoning\": \"brief\"}"
        )

        try:
            import aiohttp
        except ImportError:
            return None

        model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 150, "temperature": 0.1},
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                data = await response.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                # Strip markdown fences
                text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                result = json.loads(text)
                slug = result.get("best_match_slug", "").strip()
                if slug in self.configs:
                    return slug
        return None

    # ------------------------------------------------------------------
    # Feedback integration
    # ------------------------------------------------------------------

    def query_feedback(self, config_slug: str, region: str, supabase_client=None) -> List[Dict[str, Any]]:
        """
        Query Supabase for successful patterns from past runs for this config+region.
        Requires a Supabase client instance.
        """
        if not supabase_client:
            return []

        try:
            result = (
                supabase_client.table("specialist_feedback")
                .select("*")
                .eq("config_slug", config_slug)
                .eq("promoted", True)
                .order("confidence", desc=True)
                .limit(10)
                .execute()
            )
            return result.data or []
        except Exception as e:
            print(f"[Router] Feedback query failed: {e}")
            return []

    def inject_feedback(self, config: Dict[str, Any], feedback: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Inject feedback patterns as additional search queries and scoring hints."""
        if not feedback:
            return config

        discovery = config.setdefault("discovery", {})
        search_queries = discovery.setdefault("search_queries", [])
        seen_queries = set(search_queries)

        scoring = config.setdefault("scoring", {})
        keywords = scoring.setdefault("keywords", {})
        strong_buyer = keywords.setdefault("strong_buyer_keywords", [])
        seen_keywords = set(strong_buyer)

        for pattern in feedback:
            pattern_type = pattern.get("pattern_type", "")
            pattern_value = pattern.get("pattern_value", "").strip()

            if pattern_type == "search_query" and pattern_value not in seen_queries:
                search_queries.append(pattern_value)
                seen_queries.add(pattern_value)

            if pattern_type == "scoring_keyword" and pattern_value not in seen_keywords:
                strong_buyer.append(pattern_value)
                seen_keywords.add(pattern_value)

        return config
