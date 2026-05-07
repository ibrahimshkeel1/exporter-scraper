"""
Specialist Config Loader
========================
Loads, validates, and merges per-industry YAML configs with job_config overrides.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    import yaml
except ImportError:
    yaml = None


class ConfigLoader:
    """Loads YAML industry configs and merges them with per-run overrides."""

    REMOTE_BUCKET_ENV = "EXPORTFLOW_CONFIG_BUCKET"
    REMOTE_MANIFEST_ENV = "EXPORTFLOW_CONFIG_MANIFEST"
    DEFAULT_BUCKET = "specialist-configs"
    DEFAULT_MANIFEST = "index.json"

    def __init__(self, config_dir: Optional[str] = None):
        self.config_dir = Path(config_dir or os.path.join(os.path.dirname(__file__), "..", "configs")).resolve()
        self.supabase_url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
        self.config_bucket = os.environ.get(self.REMOTE_BUCKET_ENV, self.DEFAULT_BUCKET).strip() or self.DEFAULT_BUCKET
        self.manifest_path = os.environ.get(self.REMOTE_MANIFEST_ENV, self.DEFAULT_MANIFEST).strip() or self.DEFAULT_MANIFEST
        self.remote_manifest_url = (
            f"{self.supabase_url}/storage/v1/object/public/{self.config_bucket}/{self.manifest_path}"
            if self.supabase_url
            else ""
        )

        self.local_available = self.config_dir.exists()
        self.remote_available = bool(self.remote_manifest_url)
        if not self.local_available and not self.remote_available:
            raise FileNotFoundError(f"Config directory not found: {self.config_dir}")

        self.configs: Dict[str, Dict[str, Any]] = {}
        self._trigger_map: Dict[str, str] = {}
        self._source = "local"
        self._load()

    # ------------------------------------------------------------------
    # Manifest loading
    # ------------------------------------------------------------------

    def _build_local_manifest(self) -> Optional[Dict[str, Any]]:
        if not self.local_available:
            return None

        configs: Dict[str, Dict[str, Any]] = {}
        for file_path in sorted(self.config_dir.glob("*.yml")):
            try:
                with open(file_path, "r", encoding="utf-8") as file_handle:
                    configs[file_path.stem] = {"yaml": file_handle.read()}
            except OSError as exc:
                print(f"[ConfigLoader] Skipping {file_path.name}: {exc}")

        if not configs:
            return None

        return {
            "_format": "specialist-config-manifest-v1",
            "configs": configs,
        }

    def _normalize_manifest(self, raw: Any) -> Dict[str, Any]:
        manifest: Dict[str, Any] = {"_format": "specialist-config-manifest-v1", "configs": {}}
        if not isinstance(raw, dict):
            return manifest

        payload = raw.get("configs") if isinstance(raw.get("configs"), dict) else raw
        if not isinstance(payload, dict):
            return manifest

        for slug, value in payload.items():
            if str(slug).startswith("_"):
                continue

            if isinstance(value, str):
                manifest["configs"][slug] = {"yaml": value}
                continue

            if isinstance(value, dict):
                yaml_text = str(value.get("yaml") or value.get("content") or "")
                if not yaml_text.strip():
                    continue
                manifest["configs"][slug] = {
                    "yaml": yaml_text,
                    "updated_at": value.get("updated_at"),
                    "version": value.get("version"),
                }

        return manifest

    def _download_remote_manifest(self) -> Optional[Dict[str, Any]]:
        if not self.remote_available:
            return None

        try:
            request = Request(self.remote_manifest_url, headers={"Accept": "application/json"})
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return self._normalize_manifest(payload)
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            print(f"[ConfigLoader] Remote config manifest unavailable: {exc}")
            return None

    def _entry_yaml(self, entry: Any) -> str:
        if isinstance(entry, str):
            return entry
        if isinstance(entry, dict):
            return str(entry.get("yaml") or "")
        return ""

    def _parse_config_yaml(self, slug: str, yaml_text: str, loaded_from: str) -> Dict[str, Any]:
        if not yaml:
            raise RuntimeError("PyYAML is required for specialist config loading.")

        config = yaml.safe_load(yaml_text)
        errors = self.validate(config)
        if errors:
            raise ValueError(f"Config {slug} validation errors:\n  " + "\n  ".join(errors))

        config["_loaded_from"] = loaded_from
        return config

    def _configs_from_manifest(self, manifest: Dict[str, Any], loaded_from_prefix: str) -> Dict[str, Dict[str, Any]]:
        configs: Dict[str, Dict[str, Any]] = {}
        raw_configs = manifest.get("configs", {})
        if not isinstance(raw_configs, dict):
            return configs

        for slug, entry in raw_configs.items():
            yaml_text = self._entry_yaml(entry)
            if not yaml_text.strip():
                continue
            try:
                configs[slug] = self._parse_config_yaml(slug, yaml_text, f"{loaded_from_prefix}#{slug}")
            except (ValueError, FileNotFoundError, RuntimeError) as exc:
                print(f"[ConfigLoader] Skipping {slug}: {exc}")
        return configs

    def _build_trigger_map(self):
        self._trigger_map = {}
        for slug, config in self.configs.items():
            for keyword in config.get("triggers", {}).get("keywords", []):
                lowered = str(keyword).lower().strip()
                if lowered:
                    self._trigger_map[lowered] = slug

    def _load(self):
        """Load configs from remote storage first, then local disk as fallback."""
        remote_manifest = self._download_remote_manifest()
        if remote_manifest:
            remote_configs = self._configs_from_manifest(remote_manifest, self.remote_manifest_url)
            if remote_configs:
                self.configs = remote_configs
                self._source = "remote"
                self._build_trigger_map()
                return

        local_manifest = self._build_local_manifest()
        if local_manifest:
            local_configs = self._configs_from_manifest(local_manifest, str(self.config_dir))
            if local_configs:
                self.configs = local_configs
                self._source = "local"
                self._build_trigger_map()
                return

        self.configs = {}
        self._trigger_map = {}
        raise FileNotFoundError(
            f"Config store not found. Checked remote {self.remote_manifest_url or 'n/a'} and local {self.config_dir}"
        )

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load(self, slug: str) -> Dict[str, Any]:
        """Load a single config YAML file, validate structure."""
        safe_slug = str(slug or "").strip()
        if not safe_slug:
            raise FileNotFoundError("Config not found: empty slug")

        if not self.configs:
            self._load()

        if safe_slug in self.configs:
            return self.configs[safe_slug]

        if self.local_available:
            file_path = self.config_dir / f"{safe_slug}.yml"
            if file_path.exists():
                with open(file_path, "r", encoding="utf-8") as file_handle:
                    config = self._parse_config_yaml(safe_slug, file_handle.read(), str(file_path))
                self.configs[safe_slug] = config
                self._build_trigger_map()
                return config

        raise FileNotFoundError(f"Config not found: {safe_slug}")

    def load_all(self) -> Dict[str, Dict[str, Any]]:
        """Load all YAML configs from the configs directory."""
        if not self.configs:
            self._load()
        return self.configs

    def list_available(self) -> List[Dict[str, Any]]:
        """Return all available configs with metadata (no full content)."""
        available = []
        for slug, config in sorted(self.load_all().items()):
            available.append({
                "slug": slug,
                "display_name": config.get("display_name", slug),
                "version": config.get("version", 1),
                "quality_tier": config.get("quality_tier", "unknown"),
                "trigger_keywords": config.get("triggers", {}).get("keywords", [])[:10],
                "keyword_count": len(config.get("triggers", {}).get("keywords", [])),
            })
        return available

    def _load_json_fallback(self, slug: str) -> Dict[str, Any]:
        """Fallback JSON loader if PyYAML is not installed."""
        import json as _json

        file_path = self.config_dir / f"{slug}.json"
        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as file_handle:
                return _json.load(file_handle)
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

        if not self.local_available:
            raise RuntimeError("Local config directory is not available for saving tuned configs.")

        config["version"] = config.get("version", 1) + 1
        config.pop("_loaded_from", None)

        file_path = self.config_dir / f"{slug}.yml"
        with open(file_path, "w", encoding="utf-8") as file_handle:
            yaml.safe_dump(config, file_handle, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)

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
