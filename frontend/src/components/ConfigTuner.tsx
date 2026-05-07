"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────

type SpecialistConfigMeta = {
  slug: string;
  display_name: string;
  version: number;
  quality_tier: string;
  trigger_keywords: string[];
  keyword_count: number;
};

type TuneSuggestion = {
  type: "add_search_query" | "add_keyword" | "add_exclusion" | "add_seed_url" | "relax_filter";
  target: string;
  value: string;
  reasoning: string;
};

type TuneResult = {
  action: string;
  slug: string;
  diagnosis: string;
  score: number;
  suggestions: TuneSuggestion[];
  warnings: string[];
  error?: string;
};

type CriticResult = {
  action: string;
  slug: string;
  approved: boolean;
  tier: string;
  confidence: number;
  score_breakdown: Record<string, number>;
  strengths: string[];
  gaps: string[];
  verdict: string;
  error?: string;
};

type TuneStep = {
  id: string;
  type: "gemini_analysis" | "applied" | "test_run" | "critic";
  timestamp: number;
  diagnosis?: string;
  score?: number;
  suggestions?: TuneSuggestion[];
  appliedCount?: number;
  criticResult?: CriticResult;
};

// ── Component ──────────────────────────────────

export function ConfigTuner() {
  const [configs, setConfigs] = useState<SpecialistConfigMeta[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [configYaml, setConfigYaml] = useState("");
  const [editingYaml, setEditingYaml] = useState(false);

  // Test run
  const [industry, setIndustry] = useState("apparel importers wholesalers private label clothing buyers");
  const [region, setRegion] = useState("USA");
  const [isRunning, setIsRunning] = useState(false);

  // Tuning
  const [isTuning, setIsTuning] = useState(false);
  const [tuneResult, setTuneResult] = useState<TuneResult | null>(null);
  const [criticResult, setCriticResult] = useState<CriticResult | null>(null);
  const [tuneSteps, setTuneSteps] = useState<TuneStep[]>([]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());

  // Job results (for tuning input)
  const [jobSummary, setJobSummary] = useState("");
  const [auditSummary, setAuditSummary] = useState("");
  const [lastJobId, setLastJobId] = useState("");

  const [error, setError] = useState("");

  // ── Load configs ──

  useEffect(() => {
    fetch("/api/admin/configs")
      .then((r) => r.json())
      .then((data) => {
        setConfigs(data.configs || []);
        if (data.configs?.length > 0) {
          setSelectedSlug(data.configs[0].slug);
        }
      })
      .catch(() => setError("Failed to load configs"));
  }, []);

  // ── Load YAML ──

  const loadConfigYaml = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/admin/configs/${slug}/yaml`);
      const data = await res.json();
      setConfigYaml(data.yaml || "");
      setTuneResult(null);
      setCriticResult(null);
      setAcceptedSuggestions(new Set());
    } catch {
      setConfigYaml("# Could not load config YAML");
    }
  }, []);

  useEffect(() => {
    if (selectedSlug) loadConfigYaml(selectedSlug);
  }, [selectedSlug, loadConfigYaml]);

  // ── Test Run ──

  const handleTestRun = async () => {
    setIsRunning(true);
    setError("");
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "tuning_test",
          config_slug: selectedSlug,
          targeting: { region, industry },
          lead_pack: { limit: 10, min_score: 75 },
          admin_bypass: true,
        }),
      });
      const data = await res.json();
      if (data.jobId) {
        setLastJobId(data.jobId);
        setTuneSteps((prev) => [
          ...prev,
          {
            id: `run-${Date.now()}`,
            type: "test_run",
            timestamp: Date.now(),
          },
        ]);
      }
    } catch {
      setError("Test run failed");
    } finally {
      setIsRunning(false);
    }
  };

  // ── Tune: Analyze ──

  const handleTuneAnalyze = async () => {
    setIsTuning(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/configs/${selectedSlug}/tune`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          configYaml,
          jobSummary,
          auditSummary,
        }),
      });
      const result: TuneResult = await res.json();
      if (result.error) throw new Error(result.error);

      setTuneResult(result);
      setAcceptedSuggestions(new Set());
      setTuneSteps((prev) => [
        ...prev,
        {
          id: `tune-${Date.now()}`,
          type: "gemini_analysis",
          timestamp: Date.now(),
          diagnosis: result.diagnosis,
          score: result.score,
          suggestions: result.suggestions,
        },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Tune analysis failed");
    } finally {
      setIsTuning(false);
    }
  };

  // ── Tune: Apply accepted suggestions ──

  const handleApplySuggestions = async () => {
    if (!tuneResult) return;

    let updatedYaml = configYaml;
    let applied = 0;

    for (const [idx, suggestion] of tuneResult.suggestions.entries()) {
      if (!acceptedSuggestions.has(idx)) continue;
      applied++;

      if (suggestion.type === "add_search_query") {
        const marker = "search_queries:";
        const idx = updatedYaml.indexOf(marker);
        if (idx !== -1) {
          const insertAt = updatedYaml.indexOf("\n", idx) + 1;
          const indent = updatedYaml.slice(updatedYaml.lastIndexOf("\n", idx) + 1, idx).length + 4;
          updatedYaml =
            updatedYaml.slice(0, insertAt) +
            `${" ".repeat(indent)}- '${suggestion.value}'\n` +
            updatedYaml.slice(insertAt);
        }
      }

      if (suggestion.type === "add_keyword") {
        const lines = updatedYaml.split("\n");
        // Find the target keyword list and append
        const targetYamlKey = suggestion.target.split(".").pop() || "";
        let inTarget = false;
        const result: string[] = [];
        for (const line of lines) {
          result.push(line);
          if (line.includes(`${targetYamlKey}:`)) {
            inTarget = true;
          } else if (inTarget && /^\s{4,}- /.test(line)) {
            // Still in keyword list — append after
            const indent = " ".repeat(line.length - line.trimStart().length);
            result.push(`${indent}- "${suggestion.value}"`);
            inTarget = false;
          }
        }
        updatedYaml = result.join("\n");
      }
    }

    setConfigYaml(updatedYaml);
    setTuneResult(null);
    setTuneSteps((prev) => [
      ...prev,
      {
        id: `apply-${Date.now()}`,
        type: "applied",
        timestamp: Date.now(),
        appliedCount: applied,
      },
    ]);
  };

  const toggleSuggestion = (idx: number) => {
    setAcceptedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ── Tune: Critic (final check) ──

  const handleCriticCheck = async () => {
    setIsTuning(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/configs/${selectedSlug}/tune`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "critic",
          configYaml,
          jobSummary,
        }),
      });
      const result: CriticResult = await res.json();
      if (result.error) throw new Error(result.error);

      setCriticResult(result);
      setTuneSteps((prev) => [
        ...prev,
        {
          id: `critic-${Date.now()}`,
          type: "critic",
          timestamp: Date.now(),
          criticResult: result,
        },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Critic check failed");
    } finally {
      setIsTuning(false);
    }
  };

  // ── Render ──

  const selectedConfig = configs.find((c) => c.slug === selectedSlug);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-auto p-6 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Config Tuning Studio</h2>
          <p className="text-xs text-[#8b949e]">
            Iterate: test run → Gemini analyze → apply changes → re-run → critic approve
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-[#f85149]/30 bg-[#f85149]/10 p-3 text-xs text-[#f85149]">
          {error}
        </div>
      )}

      {/* Config Selector */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#8b949e]">Config</label>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="h-8 rounded border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#c9d1d9]"
          >
            {configs.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.display_name} ({c.quality_tier}, v{c.version})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#8b949e]">Test Industry</label>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="h-8 w-96 rounded border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#c9d1d9]"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-[#8b949e]">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-8 rounded border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#c9d1d9]"
          >
            <option value="USA">USA</option>
            <option value="UK">UK</option>
            <option value="Europe">Europe</option>
            <option value="International">International</option>
          </select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleTestRun}
          disabled={isRunning || !selectedSlug}
          className="rounded border border-[#30363d] bg-[#238636] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
        >
          {isRunning ? "Running..." : "▶ Test Run"}
        </button>
        <button
          onClick={handleTuneAnalyze}
          disabled={isTuning || !configYaml}
          className="rounded border border-[#30363d] bg-[#1f6feb] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#388bfd] disabled:opacity-50"
        >
          {isTuning ? "Analyzing..." : "🔍 Gemini Analyze"}
        </button>
        <button
          onClick={handleApplySuggestions}
          disabled={!tuneResult || acceptedSuggestions.size === 0}
          className="rounded border border-[#30363d] bg-[#8957e5] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#a371f7] disabled:opacity-50"
        >
          ✓ Apply ({acceptedSuggestions.size})
        </button>
        <button
          onClick={handleCriticCheck}
          disabled={isTuning || !configYaml}
          className="rounded border border-[#30363d] bg-[#da3633] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#f85149] disabled:opacity-50"
        >
          {isTuning ? "Checking..." : "🛡 Critic Check"}
        </button>

        {selectedConfig && (
          <span className="ml-auto flex items-center gap-2 text-xs text-[#8b949e]">
            <span className="rounded bg-[#21262d] px-2 py-0.5">v{selectedConfig.version}</span>
            <span className="rounded bg-[#21262d] px-2 py-0.5">
              {selectedConfig.keyword_count} triggers
            </span>
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                selectedConfig.quality_tier === "A+"
                  ? "bg-[#238636]/20 text-[#3fb950]"
                  : "bg-[#8b949e]/20 text-[#8b949e]"
              }`}
            >
              {selectedConfig.quality_tier}
            </span>
          </span>
        )}
      </div>

      {/* Tuning Steps History */}
      {tuneSteps.length > 0 && (
        <div className="rounded border border-[#30363d] bg-[#0d1117] p-3">
          <h3 className="mb-2 text-xs font-semibold text-[#8b949e]">Tuning History</h3>
          <div className="flex flex-col gap-1">
            {tuneSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-2 text-xs">
                <span className="text-[#8b949e]">{new Date(step.timestamp).toLocaleTimeString()}</span>
                {step.type === "test_run" && <span className="text-[#3fb950]">▶ Test run completed</span>}
                {step.type === "gemini_analysis" && (
                  <span className="text-[#1f6feb]">
                    🔍 Analysis — Score: {step.score}/10{" "}
                    {step.diagnosis && `— ${step.diagnosis.slice(0, 80)}...`}
                  </span>
                )}
                {step.type === "applied" && (
                  <span className="text-[#8957e5]">✓ Applied {step.appliedCount} changes</span>
                )}
                {step.type === "critic" && (
                  <span
                    className={
                      step.criticResult?.approved ? "text-[#3fb950]" : "text-[#f85149]"
                    }
                  >
                    🛡 Critic: {step.criticResult?.approved ? "APPROVED" : "NEEDS WORK"} —{" "}
                    {step.criticResult?.verdict}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Layout: YAML Editor + Gemini Results */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* YAML Editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-medium text-[#8b949e]">
              {selectedSlug}.yml
            </label>
            <button
              onClick={() => setEditingYaml(!editingYaml)}
              className="rounded border border-[#30363d] px-2 py-0.5 text-[10px] text-[#8b949e] hover:text-[#c9d1d9]"
            >
              {editingYaml ? "Lock" : "Edit"}
            </button>
          </div>
          <textarea
            value={configYaml}
            onChange={(e) => editingYaml && setConfigYaml(e.target.value)}
            readOnly={!editingYaml}
            className="flex-1 resize-none rounded border border-[#30363d] bg-[#0d1117] p-3 font-mono text-[11px] leading-relaxed text-[#c9d1d9] focus:border-[#1f6feb] focus:outline-none"
            spellCheck={false}
          />
        </div>

        {/* Right Panel: Results & Suggestions */}
        <div className="flex w-96 flex-shrink-0 flex-col gap-3 overflow-auto">
          {/* Job Summary Input */}
          <div className="rounded border border-[#30363d] bg-[#0d1117] p-3">
            <h3 className="mb-2 text-xs font-semibold text-[#8b949e]">Feed Gemini Context</h3>
            <textarea
              placeholder="Paste job summary / strongest patterns..."
              value={jobSummary}
              onChange={(e) => setJobSummary(e.target.value)}
              className="mb-2 h-20 w-full resize-none rounded border border-[#30363d] bg-[#161b22] p-2 text-[11px] text-[#c9d1d9]"
            />
            <textarea
              placeholder="Paste audit CSV excerpt / reject reasons..."
              value={auditSummary}
              onChange={(e) => setAuditSummary(e.target.value)}
              className="h-16 w-full resize-none rounded border border-[#30363d] bg-[#161b22] p-2 text-[11px] text-[#c9d1d9]"
            />
          </div>

          {/* Tune Suggestions */}
          {tuneResult && (
            <div className="rounded border border-[#1f6feb]/30 bg-[#1f6feb]/5 p-3">
              <h3 className="mb-1 text-xs font-semibold text-[#58a6ff]">
                Gemini Analysis — Score: {tuneResult.score}/10
              </h3>
              <p className="mb-2 text-[11px] text-[#8b949e]">{tuneResult.diagnosis}</p>

              {tuneResult.suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`mb-1.5 cursor-pointer rounded border p-2 text-[11px] ${
                    acceptedSuggestions.has(i)
                      ? "border-[#3fb950]/30 bg-[#238636]/10"
                      : "border-[#30363d] bg-[#21262d]"
                  }`}
                  onClick={() => toggleSuggestion(i)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-medium ${
                        acceptedSuggestions.has(i) ? "text-[#3fb950]" : "text-[#8b949e]"
                      }`}
                    >
                      {acceptedSuggestions.has(i) ? "✓" : "○"} {s.type}
                    </span>
                    <span className="text-[#58a6ff]">→ {s.target}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#c9d1d9]">{s.value}</div>
                  <div className="mt-0.5 text-[10px] text-[#8b949e]">{s.reasoning}</div>
                </div>
              ))}

              {tuneResult.warnings?.length > 0 && (
                <div className="mt-2 border-t border-[#30363d] pt-2">
                  <h4 className="text-[10px] font-medium text-[#f85149]">Warnings</h4>
                  {tuneResult.warnings.map((w, i) => (
                    <div key={i} className="text-[10px] text-[#f85149]/80">
                      • {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Critic Result */}
          {criticResult && (
            <div
              className={`rounded border p-3 ${
                criticResult.approved
                  ? "border-[#3fb950]/30 bg-[#238636]/5"
                  : "border-[#f85149]/30 bg-[#da3633]/5"
              }`}
            >
              <h3
                className={`text-xs font-semibold ${
                  criticResult.approved ? "text-[#3fb950]" : "text-[#f85149]"
                }`}
              >
                🛡 {criticResult.approved ? "APPROVED" : "NEEDS WORK"} —{" "}
                {criticResult.tier} ({Math.round(criticResult.confidence * 100)}% confidence)
              </h3>
              <p className="mt-1 text-[11px] text-[#c9d1d9]">{criticResult.verdict}</p>

              {criticResult.strengths?.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-[10px] font-medium text-[#3fb950]">Strengths</h4>
                  {criticResult.strengths.map((s, i) => (
                    <div key={i} className="text-[10px] text-[#c9d1d9]">• {s}</div>
                  ))}
                </div>
              )}

              {criticResult.gaps?.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-[10px] font-medium text-[#f85149]">Gaps</h4>
                  {criticResult.gaps.map((g, i) => (
                    <div key={i} className="text-[10px] text-[#c9d1d9]">• {g}</div>
                  ))}
                </div>
              )}

              {criticResult.score_breakdown && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {Object.entries(criticResult.score_breakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between rounded bg-[#21262d] px-2 py-0.5 text-[10px]">
                      <span className="text-[#8b949e]">{key.replace(/_/g, " ")}</span>
                      <span className="text-[#c9d1d9]">{val}/10</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick shortcuts */}
          <div className="rounded border border-[#30363d] bg-[#0d1117] p-3">
            <h3 className="mb-2 text-[10px] font-medium text-[#8b949e]">Workflow</h3>
            <div className="space-y-1 text-[10px] text-[#8b949e]">
              <div>1. Select config above</div>
              <div>2. Click <span className="text-[#3fb950]">▶ Test Run</span></div>
              <div>3. Paste results into context boxes</div>
              <div>4. Click <span className="text-[#58a6ff]">🔍 Gemini Analyze</span></div>
              <div>5. Click suggestions to accept/reject</div>
              <div>6. Click <span className="text-[#8957e5]">✓ Apply</span> to merge</div>
              <div>7. Edit YAML manually if needed</div>
              <div>8. <span className="text-[#3fb950]">▶ Test Run</span> again</div>
              <div>9. <span className="text-[#f85149]">🛡 Critic Check</span> for approval</div>
              <div>10. Repeat until approved ✓</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
