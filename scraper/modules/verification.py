"""
Verification Agent (Critic)
===========================
Post-scoring filter that catches C-tier fluff before delivery.
Only runs Gemini for borderline leads (score 55-74).
High-confidence leads (score >= 75) pass automatically.
Low-confidence leads (score < 55) are auto-rejected.

Cost-controlled: max 10 Gemini calls per job.
"""

import json
import os
from typing import Any, Dict, List, Tuple

try:
    import aiohttp
except ImportError:
    aiohttp = None


class VerificationAgent:
    """Critic agent that re-evaluates borderline leads before delivery."""

    MAX_GEMINI_CALLS = 10

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.display_name = config.get("display_name", "Unknown Industry")
        self.scoring_tiers = config.get("scoring", {}).get("tiers", {})
        self.a_threshold = self.scoring_tiers.get("a", {}).get("min_score", 75)
        self.manual_threshold = self.scoring_tiers.get("manual_review", {}).get("min_score", 55)
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
        self.calls_used = 0

    # ------------------------------------------------------------------
    # Main verification
    # ------------------------------------------------------------------

    def verify_leads(self, leads: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Split leads into approved and rejected.
        Only borderline leads (score 55-74) are re-evaluated.
        """
        approved = []
        rejected = []

        for lead in leads:
            score = lead.get("score", 0)

            if score >= self.a_threshold:
                lead["verified_by"] = "threshold"
                approved.append(lead)
            elif score < self.manual_threshold:
                lead["verified_by"] = "threshold"
                lead["verification_reason"] = f"Below minimum score ({self.manual_threshold})"
                rejected.append(lead)
            else:
                # Borderline — will be checked later via async Gemini
                lead["needs_verification"] = True
                approved.append(lead)  # Temp pass, checked below

        return approved, rejected

    async def verify_borderline(self, lead: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Re-evaluate a single borderline lead using Gemini.
        Returns (approved, reason).
        """
        if self.calls_used >= self.MAX_GEMINI_CALLS:
            return lead.get("score", 0) >= 70, "Cost limit reached — using score threshold 70"

        if not self.api_key:
            return lead.get("score", 0) >= 70, "No Gemini API key — using score threshold 70"

        self.calls_used += 1

        domain = lead.get("domain", "unknown")
        evidence = lead.get("buyer_evidence", lead.get("buyer_side_evidence", ""))
        content = lead.get("content", "")[:500]
        score = lead.get("score", 0)

        prompt = (
            f"You are a lead-quality verification agent for {self.display_name}.\n\n"
            f"Lead domain: {domain}\n"
            f"Lead score: {score}/100\n"
            f"Buyer evidence found: {evidence}\n"
            f"Page content excerpt: {content}\n\n"
            f"Is this lead a genuine {self.display_name} buyer, importer, or distributor?\n"
            f"Return ONLY valid JSON: {{\"approved\": true/false, \"reason\": \"one-line explanation\"}}"
        )

        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
                async with session.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"maxOutputTokens": 100, "temperature": 0.1},
                    },
                    timeout=aiohttp.ClientTimeout(total=8),
                ) as response:
                    data = await response.json()
                    raw = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                    result = json.loads(cleaned)
                    return result.get("approved", True), result.get("reason", "Gemini verification")
        except Exception as e:
            return score >= 70, f"Gemini verification failed: {e}"

    async def verify_all_borderline(self, leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Re-verify all borderline leads and filter out rejects."""
        approved = []
        for lead in leads:
            if lead.get("needs_verification"):
                ok, reason = await self.verify_borderline(lead)
                lead["verified_by"] = "gemini_critic" if "Gemini" in reason else "fallback"
                lead["verification_reason"] = reason
                if ok:
                    approved.append(lead)
            else:
                approved.append(lead)
        return approved

    @staticmethod
    def verification_summary(leads: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate a summary of verification results."""
        total = len(leads)
        passed = len([l for l in leads if not l.get("verification_reason")])
        threshold = len([l for l in leads if l.get("verified_by") == "threshold"])
        gemini = len([l for l in leads if l.get("verified_by") == "gemini_critic"])
        rejected = len([l for l in leads if l.get("verification_reason")])

        return {
            "total_leads": total,
            "passed": passed,
            "rejected": rejected,
            "verified_by_threshold": threshold,
            "verified_by_gemini": gemini,
            "gemini_calls_used": gemini,
        }
