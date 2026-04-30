class LeadScoring:
    def __init__(self):
        self.icp_keywords = ['clothing', 'apparel', 'fashion', 'brand', 'boutique', 'wear', 'garment']
        self.intent_keywords = ['supplier', 'sourcing', 'private label', 'manufacturing partner', 'wholesale', 'b2b', 'trade']
        self.commercial_keywords = ['shop', 'cart', 'checkout', 'collections', 'new arrivals', 'store']

    def evaluate_candidate(self, candidate):
        """Scores a candidate from 0-100 based on extracted data."""
        score = 0
        reasons = []
        content = candidate.get('content', '')

        # 1. ICP Fit (30 points)
        if any(kw in content for kw in self.icp_keywords):
            score += 30
            reasons.append("High ICP fit (clothing/apparel keywords)")
        else:
            score += 10
            reasons.append("Low ICP fit in text")

        # 2. Buying Intent (30 points)
        if any(kw in content for kw in self.intent_keywords):
            score += 30
            reasons.append("High buying intent (sourcing/wholesale keywords)")
        else:
            reasons.append("No explicit buying intent found")

        # 3. Reachability (20 points)
        reach_score = 0
        if candidate.get('emails'):
            reach_score += 15
            reasons.append("Emails found")
        if candidate.get('linkedin_url'):
            reach_score += 5
            reasons.append("LinkedIn profile found")
        score += reach_score

        # 4. Commercial Readiness (20 points)
        if any(kw in content for kw in self.commercial_keywords) or candidate.get('social_urls'):
            score += 20
            reasons.append("Commercially active (e-commerce/socials present)")

        candidate['score'] = score
        
        # Assign Tier
        if score >= 80:
            candidate['tier'] = 'A'
        elif score >= 60:
            candidate['tier'] = 'B'
        else:
            candidate['tier'] = 'C'
            
        candidate['qualification_reasons'] = "; ".join(reasons)
        return candidate

    def rank_and_filter(self, candidates, limit=10):
        """Rank candidates by score and return the top ones."""
        scored = [self.evaluate_candidate(c) for c in candidates]
        # Filter out those with no emails to ensure reachability, unless they are high tier (optional, but good for outreach)
        with_emails = [c for c in scored if c.get('emails')]
        
        sorted_candidates = sorted(with_emails, key=lambda x: x['score'], reverse=True)
        return sorted_candidates[:limit]
