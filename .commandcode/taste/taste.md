# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Cost-Conscious AI Usage
- When using Gemini API for analysis, send only summarized/extracted data, never full files. Confidence: 0.80
- Prefer structured summaries over raw content to minimize token costs. Confidence: 0.75

# Admin Interface Preferences
- Create admin pages for configuration tuning and management tasks. Confidence: 0.75
- Provide visual UI for iterative workflows (tune → test → approve). Confidence: 0.70

# Workflow Patterns
- Implement iterative feedback loops: run → analyze → tune → re-run until quality gate passes. Confidence: 0.80
- Use critic/verification agents as approval gates before finalizing configurations. Confidence: 0.75

# Project Conventions
- Store architecture plans and documentation in `docs/` directory. Confidence: 0.85
- Create config-driven systems where new industries = new config files, not code changes. Confidence: 0.80

