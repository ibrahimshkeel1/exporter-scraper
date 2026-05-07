"""
Specialist Config Loader
========================
Loads, validates, and merges per-industry YAML configs with job_config overrides.
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    yaml = None


class ConfigLoader:
    """Loads YAML industry configs and merges them with per-run overrides."""

    def __init__(self, config_dir: Optional[str] = None):
        self.config_dir = Path(config_dir or os.path.join(os.path.dirname(__file__), "..", "configs")).resolve()
        if not self.config_dir.exists():
            raise FileNotFoundError(f"Config directory not found: {self.config_dir}")

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load(self, slug: str) -> Dict[str, Any]:
        """Load a single config YAML file, validate structure."""
        if not yaml:
            return self._load_json_fallback(slug)

        file_path = self.config_dir / f"{slug}.yml"
        if not file_path.exists():
            raise FileNotFoundError(f"Config not found: {file_path}")

        with open(file_path, "r") as f:
            config = yaml.safe_load(f)

        errors = self.validate(config)
        if errors:
            raise ValueError(f"Config {slug} validation errors:\n  " + "\n  ".join(errors))

        config["_loaded_from"] = str(file_path)
        return config

    def load_all(self) -> Dict[str, Dict[str, Any]]:
        """Load all YAML configs from the configs directory."""
        configs = {}
        for file_path in self.config_dir.glob("*.yml"):
            slug = file_path.stem
            try:
                configs[slug] = self.load(slug)
            except (ValueError, FileNotFoundError) as e:
                print(f"[ConfigLoader] Skipping {file_path.name}: {e}")
        return configs

    def list_available(self) -> List[Dict[str, Any]]:
        """Return all available configs with metadata (no full content)."""
        available = []
        for file_path in sorted(self.config_dir.glob("*.yml")):
            slug = file_path.stem
            try:
                config = self.load(slug)
                available.append({
                    "slug": slug,
                    "display_name": config.get("display_name", slug),
                    "version": config.get("version", 1),
                    "quality_tier": config.get("quality_tier", "unknown"),
                    "trigger_keywords": config.get("triggers", {}).get("keywords", [])[:10],
                    "keyword_count": len(config.get("triggers", {}).get("keywords", [])),
                })
            except Exception:
                available.append({
                    "slug": slug,
                    "display_name": slug,
                    "version": 0,
                    "quality_tier": "invalid",
                    "trigger_keywords": [],
                    "keyword_count": 0,
                })
        return available

    def _load_json_fallback(self, slug: str) -> Dict[str, Any]:
        """Fallback JSON loader if PyYAML is not installed."""
        import json

        file_path = self.config_dir / f"{slug}.json"
        if file_path.exists():
            with open(file_path, "r") as f:
                return json.load(f)
        raise FileNotFoundError(f"No YAML or JSON config found for slug: {slug}")

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    REQUIRED_TOP_KEYS = {"slug", "display_name", "triggers", "discovery", "scoring", "signals"}
    REQUIRED_DISCOVERY = {"search_queries", "seed_urls", "exclusions"}
    REQUIRED_SCORING = {"weights", "keywords", "tiers"}
    REQUIRED_SIGNALS = {"cluster", "signal_catalog"}

    def validate(self, config: Dict[str, Any]) -> List[str]:
        """Validate required fields exist. Return list of validation errors."""
        errors = []

        missing_top = self.REQUIRED_TOP_KEYS - set(config.keys())
        if missing_top:
            errors.append(f"Missing top-level keys: {', '.join(sorted(missing_top))}")

        discovery = config.get("discovery", {})
        missing_discovery = self.REQUIRED_DISCOVERY - set(discovery.keys())
        if missing_discovery:
            errors.append(f"Missing discovery keys: {', '.join(sorted(missing_discovery))}")

        scoring = config.get("scoring", {})
        missing_scoring = self.REQUIRED_SCORING - set(scoring.keys())
        if missing_scoring:
            errors.append(f"Missing scoring keys: {', '.join(sorted(missing_scoring))}")

        signals = config.get("signals", {})
        missing_signals = self.REQUIRED_SIGNALS - set(signals.keys())
        if missing_signals:
            errors.append(f"Missing signals keys: {', '.join(sorted(missing_signals))}")

        if not discovery.get("search_queries"):
            errors.append("discovery.search_queries must not be empty")

        if not scoring.get("keywords", {}).get("strong_buyer_keywords"):
            errors.append("scoring.keywords.strong_buyer_keywords must not be empty")

        return errors

    # ------------------------------------------------------------------
    # Merging
    # ------------------------------------------------------------------

    def merge_with_job_config(self, config: Dict[str, Any], job_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deep merge job_config overrides into the specialist config.
        Job config can ADD keywords, ADD blocked domains, ADD search terms.
        Job config can NEVER remove specialist config entries.
        """
        merged = _deep_copy(config)
        scoring_context = job_config.get("scoring_context", {})
        quality_overrides = job_config.get("quality", {})
        targeting = job_config.get("targeting", {})

        if scoring_context.get("product_keywords"):
            existing = merged.setdefault("scoring", {}).setdefault("keywords", {}).setdefault("product_keywords", [])
            merged["scoring"]["keywords"]["product_keywords"] = _unique_append(existing, scoring_context["product_keywords"])

        if scoring_context.get("buyer_keywords"):
            existing = merged.setdefault("scoring", {}).setdefault("keywords", {}).setdefault("strong_buyer_keywords", [])
            merged["scoring"]["keywords"]["strong_buyer_keywords"] = _unique_append(existing, scoring_context["buyer_keywords"])

        if scoring_context.get("negative_keywords"):
            existing = merged.setdefault("scoring", {}).setdefault("keywords", {}).setdefault("negative_keywords", [])
            merged["scoring"]["keywords"]["negative_keywords"] = _unique_append(existing, scoring_context["negative_keywords"])

        if scoring_context.get("blocked_domains"):
            existing = merged.setdefault("scoring", {}).setdefault("blocked_domains", [])
            merged["scoring"]["blocked_domains"] = list(set(existing) | set(scoring_context["blocked_domains"]))

        if scoring_context.get("blocked_host_markers"):
            existing = merged.setdefault("scoring", {}).setdefault("blocked_domain_markers", [])
            merged["scoring"]["blocked_domain_markers"] = _unique_append(existing, scoring_context["blocked_host_markers"])

        if scoring_context.get("blocked_tlds"):
            existing = merged.setdefault("scoring", {}).setdefault("blocked_tlds", [])
            merged["scoring"]["blocked_tlds"] = _unique_append(existing, scoring_context["blocked_tlds"])

        if quality_overrides.get("a_plus_score"):
            merged.setdefault("scoring", {}).setdefault("tiers", {}).setdefault("a_plus", {})["min_score"] = quality_overrides["a_plus_score"]

        if targeting.get("search_terms"):
            existing = merged.setdefault("discovery", {}).setdefault("search_queries", [])
            merged["discovery"]["search_queries"] = _unique_append(existing, targeting["search_terms"])

        return merged

    # ------------------------------------------------------------------
    # Tuning persistence
    # ------------------------------------------------------------------

    def save_tuned(self, slug: str, config: Dict[str, Any]) -> str:
        """Save a tuned config back to disk (increments version)."""
        if not yaml:
            raise RuntimeError("PyYAML is required for saving configs. Install with: pip install pyyaml")

        config["version"] = config.get("version", 1) + 1
        config.pop("_loaded_from", None)

        file_path = self.config_dir / f"{slug}.yml"
        with open(file_path, "w") as f:
            yaml.safe_dump(config, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)

        return str(file_path)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _deep_copy(obj):
    """Simple deep copy without importing copy module."""
    if isinstance(obj, dict):
        return {k: _deep_copy(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_deep_copy(v) for v in obj]
    if isinstance(obj, set):
        return set(obj)
    return obj


def _unique_append(existing: List[str], new: List[str]) -> List[str]:
    """Append new items to existing list, preserving order and removing duplicates."""
    seen = set(existing)
    result = list(existing)
    for item in new:
        item_str = str(item).strip()
        if item_str and item_str not in seen:
            seen.add(item_str)
            result.append(item_str)
    return result
