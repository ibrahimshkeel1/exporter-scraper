"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CopyPlus, Play, Save, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";

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
  type: "analysis" | "applied" | "test_run" | "critic" | "saved" | "created";
  timestamp: number;
  message: string;
};

const STORAGE_KEY = "exportflow_admin_password";

function splitInput(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function addYamlListItem(yaml: string, sectionKey: string, value: string) {
  const marker = `${sectionKey}:`;
  const index = yaml.indexOf(marker);
  if (index === -1) return yaml;
  const insertAt = yaml.indexOf("\n", index) + 1;
  const lineStart = yaml.lastIndexOf("\n", index) + 1;
  const indent = yaml.slice(lineStart, index).length + 2;
  return `${yaml.slice(0, insertAt)}${" ".repeat(indent)}- ${JSON.stringify(value)}\n${yaml.slice(insertAt)}`;
}

export function ConfigTuner() {
  const [configs, setConfigs] = useState<SpecialistConfigMeta[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [configYaml, setConfigYaml] = useState("");
  const [editingYaml, setEditingYaml] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  const [scenario, setScenario] = useState("denim export buyers, importers, wholesalers, and private-label clothing brands");
  const [refinedIndustry, setRefinedIndustry] = useState("textile apparel denim importers");
  const [region, setRegion] = useState("USA");
  const [searchTerms, setSearchTerms] = useState("denim importer, denim wholesaler, jeans private label brand");
  const [testLimit, setTestLimit] = useState(10);
  const [maxAnalyzed, setMaxAnalyzed] = useState(300);
  const [isRunning, setIsRunning] = useState(false);

  const [isTuning, setIsTuning] = useState(false);
  const [tuneResult, setTuneResult] = useState<TuneResult | null>(null);
  const [criticResult, setCriticResult] = useState<CriticResult | null>(null);
  const [tuneSteps, setTuneSteps] = useState<TuneStep[]>([]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());

  const [jobSummary, setJobSummary] = useState("");
  const [auditSummary, setAuditSummary] = useState("");
  const [lastJobId, setLastJobId] = useState("");

  const [newSlug, setNewSlug] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newTriggers, setNewTriggers] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedConfig = useMemo(
    () => configs.find((config) => config.slug === selectedSlug),
    [configs, selectedSlug],
  );

  const addStep = (type: TuneStep["type"], stepMessage: string) => {
    setTuneSteps((prev) => [
      ...prev,
      { id: `${type}-${Date.now()}`, type, timestamp: Date.now(), message: stepMessage },
    ]);
  };

  const loadConfigs = useCallback(async () => {
    const response = await fetch("/api/admin/configs");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load configs.");
    setConfigs(payload.configs || []);
    if (!selectedSlug && payload.configs?.length > 0) {
      setSelectedSlug(payload.configs[0].slug);
    }
  }, [selectedSlug]);

  useEffect(() => {
    setAdminPassword(localStorage.getItem(STORAGE_KEY) || "");
    loadConfigs().catch((err) => setError(err instanceof Error ? err.message : "Failed to load configs."));
  }, [loadConfigs]);

  const loadConfigYaml = useCallback(async (slug: string) => {
    try {
      const response = await fetch(`/api/admin/configs/${slug}/yaml`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load config YAML.");
      setConfigYaml(payload.yaml || "");
      setTuneResult(null);
      setCriticResult(null);
      setAcceptedSuggestions(new Set());
      setEditingYaml(false);
    } catch (err: unknown) {
      setConfigYaml("# Could not load config YAML");
      setError(err instanceof Error ? err.message : "Could not load config YAML.");
    }
  }, []);

  useEffect(() => {
    if (selectedSlug) loadConfigYaml(selectedSlug);
  }, [selectedSlug, loadConfigYaml]);

  const updateAdminPassword = (value: string) => {
    setAdminPassword(value);
    localStorage.setItem(STORAGE_KEY, value);
  };

  const handleTestRun = async () => {
    setIsRunning(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          mode: "tuning_test",
          configSlug: selectedSlug,
          region,
          industry: scenario,
          refinedIndustry,
          searchTerms: splitInput(searchTerms),
          limit: testLimit,
          maxAnalyzed,
          minScore: 75,
        }),
      });
      const payload = await response.json();
      if (!response.ok && response.status !== 202) {
        throw new Error(payload.error || "Test run failed.");
      }
      setLastJobId(payload.jobId || payload.job?.id || "");
      setMessage(payload.warning ? `Job created, but not queued: ${payload.warning}` : "Tuning test queued.");
      addStep("test_run", `Queued ${testLimit}-lead ${selectedSlug} test for ${region}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Test run failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleTuneAnalyze = async () => {
    setIsTuning(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/configs/${selectedSlug}/tune`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          action: "analyze",
          configYaml,
          jobSummary,
          auditSummary,
          scenario,
          region,
          refinedIndustry,
        }),
      });
      const result: TuneResult = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || "Tune analysis failed.");

      setTuneResult({ ...result, suggestions: result.suggestions || [], warnings: result.warnings || [] });
      setAcceptedSuggestions(new Set());
      addStep("analysis", `Gemini scored the config ${result.score}/10.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Tune analysis failed.");
    } finally {
      setIsTuning(false);
    }
  };

  const handleApplySuggestions = async () => {
    if (!tuneResult) return;

    let updatedYaml = configYaml;
    let applied = 0;

    for (const [index, suggestion] of tuneResult.suggestions.entries()) {
      if (!acceptedSuggestions.has(index)) continue;
      applied += 1;

      if (suggestion.type === "add_search_query") {
        updatedYaml = addYamlListItem(updatedYaml, "search_queries", suggestion.value);
      } else if (suggestion.type === "add_keyword") {
        const targetKey = suggestion.target.split(".").pop() || "strong_buyer_keywords";
        updatedYaml = addYamlListItem(updatedYaml, targetKey, suggestion.value);
      } else if (suggestion.type === "add_exclusion") {
        updatedYaml = addYamlListItem(updatedYaml, "host_parts", suggestion.value);
      }
    }

    setConfigYaml(updatedYaml);
    setTuneResult(null);
    setAcceptedSuggestions(new Set());
    setEditingYaml(true);
    addStep("applied", `Applied ${applied} suggested change${applied === 1 ? "" : "s"} to the draft YAML.`);
  };

  const handleSaveConfig = async (saveMessage = "Config saved.") => {
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/configs/${selectedSlug}/yaml`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({ yaml: configYaml }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not save config.");
    setMessage(saveMessage);
    setEditingYaml(false);
    addStep("saved", saveMessage);
    await loadConfigs();
  };

  const handleCriticCheck = async () => {
    setIsTuning(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/configs/${selectedSlug}/tune`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          action: "critic",
          configYaml,
          jobSummary,
          scenario,
          region,
          refinedIndustry,
        }),
      });
      const result: CriticResult = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || "Critic check failed.");

      setCriticResult(result);
      addStep("critic", result.approved ? `Critic approved ${selectedSlug} as ${result.tier}.` : `Critic needs work: ${result.verdict}`);
      if (result.approved) {
        await handleSaveConfig(`Critic approved ${selectedSlug}; tuned YAML saved.`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Critic check failed.");
    } finally {
      setIsTuning(false);
    }
  };

  const handleCreateConfig = async () => {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/configs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          slug: newSlug,
          displayName: newDisplayName,
          triggerKeywords: splitInput(newTriggers),
          productSeeds: splitInput(newTriggers),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create config.");
      setConfigs(payload.configs || []);
      setSelectedSlug(newSlug.trim().toLowerCase());
      setShowCreate(false);
      setNewSlug("");
      setNewDisplayName("");
      setNewTriggers("");
      setMessage("New config created from the generic template.");
      addStep("created", "New parent category config created.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create config.");
    }
  };

  const toggleSuggestion = (index: number) => {
    setAcceptedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-auto p-6 text-[#c9d1d9]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <SlidersHorizontal size={18} />
            Category Tuning Studio
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-[#8b949e]">
            Tune one parent category at a time with bounded tests. Gemini analysis and critic checks are single calls; scraper tests are capped by lead and page limits.
          </p>
        </div>
        <input
          type="password"
          value={adminPassword}
          onChange={(event) => updateAdminPassword(event.target.value)}
          className="h-8 w-56 rounded border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#c9d1d9]"
          placeholder="ADMIN_PASSWORD"
        />
      </div>

      {error && <div className="rounded border border-[#f85149]/30 bg-[#f85149]/10 p-3 text-xs text-[#f85149]">{error}</div>}
      {message && <div className="rounded border border-[#3fb950]/30 bg-[#238636]/10 p-3 text-xs text-[#3fb950]">{message}</div>}

      <div className="grid gap-3 rounded border border-[#30363d] bg-[#0d1117] p-3 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-[11px] font-medium text-[#8b949e]">
            Parent category
            <select
              value={selectedSlug}
              onChange={(event) => setSelectedSlug(event.target.value)}
              className="mt-1 h-8 w-full rounded border border-[#30363d] bg-[#010409] px-3 text-xs text-[#c9d1d9]"
            >
              {configs.map((config) => (
                <option key={config.slug} value={config.slug}>
                  {config.display_name} ({config.quality_tier}, v{config.version})
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-medium text-[#8b949e]">
            Region
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              className="mt-1 h-8 w-full rounded border border-[#30363d] bg-[#010409] px-3 text-xs text-[#c9d1d9]"
            >
              <option value="USA">USA</option>
              <option value="UK">UK</option>
              <option value="Europe">Europe</option>
              <option value="International">International</option>
            </select>
          </label>

          <label className="md:col-span-2 text-[11px] font-medium text-[#8b949e]">
            Test scenario
            <input
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              className="mt-1 h-8 w-full rounded border border-[#30363d] bg-[#010409] px-3 text-xs text-[#c9d1d9]"
              placeholder="knitwear importers in China"
            />
          </label>

          <label className="text-[11px] font-medium text-[#8b949e]">
            Refined industry
            <input
              value={refinedIndustry}
              onChange={(event) => setRefinedIndustry(event.target.value)}
              className="mt-1 h-8 w-full rounded border border-[#30363d] bg-[#010409] px-3 text-xs text-[#c9d1d9]"
            />
          </label>

          <label className="text-[11px] font-medium text-[#8b949e]">
            Search terms
            <input
              value={searchTerms}
              onChange={(event) => setSearchTerms(event.target.value)}
              className="mt-1 h-8 w-full rounded border border-[#30363d] bg-[#010409] px-3 text-xs text-[#c9d1d9]"
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-[11px] font-medium text-[#8b949e]">
            Test lead limit
            <input
              type="number"
              min={3}
              max={25}
              value={testLimit}
              onChange={(event) => setTestLimit(Number(event.target.value))}
              className="mt-1 h-8 w-full rounded border border-[#30363d] bg-[#010409] px-3 text-xs text-[#c9d1d9]"
            />
          </label>

          <label className="text-[11px] font-medium text-[#8b949e]">
            Max analyzed pages
            <input
              type="number"
              min={80}
              max={600}
              value={maxAnalyzed}
              onChange={(event) => setMaxAnalyzed(Number(event.target.value))}
              className="mt-1 h-8 w-full rounded border border-[#30363d] bg-[#010409] px-3 text-xs text-[#c9d1d9]"
            />
          </label>

          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTestRun}
              disabled={isRunning || !selectedSlug || !adminPassword}
              className="inline-flex items-center gap-2 rounded border border-[#30363d] bg-[#238636] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
            >
              <Play size={14} />
              {isRunning ? "Starting..." : "Start Bounded Test"}
            </button>
            <button
              type="button"
              onClick={handleTuneAnalyze}
              disabled={isTuning || !configYaml || !adminPassword}
              className="inline-flex items-center gap-2 rounded border border-[#30363d] bg-[#1f6feb] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#388bfd] disabled:opacity-50"
            >
              <Search size={14} />
              {isTuning ? "Analyzing..." : "Gemini Analyze"}
            </button>
            <button
              type="button"
              onClick={handleApplySuggestions}
              disabled={!tuneResult || acceptedSuggestions.size === 0}
              className="inline-flex items-center gap-2 rounded border border-[#30363d] bg-[#8957e5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#a371f7] disabled:opacity-50"
            >
              <Check size={14} />
              Apply ({acceptedSuggestions.size})
            </button>
            <button
              type="button"
              onClick={handleCriticCheck}
              disabled={isTuning || !configYaml || !adminPassword}
              className="inline-flex items-center gap-2 rounded border border-[#30363d] bg-[#da3633] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#f85149] disabled:opacity-50"
            >
              <ShieldCheck size={14} />
              {isTuning ? "Checking..." : "Critic Check"}
            </button>
            <button
              type="button"
              onClick={() => handleSaveConfig().catch((err) => setError(err instanceof Error ? err.message : "Could not save config."))}
              disabled={!adminPassword || !configYaml}
              className="inline-flex items-center gap-2 rounded border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d] disabled:opacity-50"
            >
              <Save size={14} />
              Save Draft
            </button>
          </div>

          {selectedConfig && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-2 text-xs text-[#8b949e]">
              <span className="rounded bg-[#21262d] px-2 py-0.5">v{selectedConfig.version}</span>
              <span className="rounded bg-[#21262d] px-2 py-0.5">{selectedConfig.keyword_count} triggers</span>
              <span className="rounded bg-[#21262d] px-2 py-0.5">{selectedConfig.quality_tier}</span>
              {lastJobId && <span className="font-mono text-[11px]">last job: {lastJobId.slice(0, 8)}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="rounded border border-[#30363d] bg-[#0d1117] p-3">
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="inline-flex items-center gap-2 rounded border border-[#30363d] px-3 py-1.5 text-xs text-[#c9d1d9] hover:bg-[#21262d]"
        >
          <CopyPlus size={14} />
          Add parent category
        </button>
        {showCreate && (
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input className="h-8 rounded border border-[#30363d] bg-[#010409] px-3 text-xs" value={newSlug} onChange={(event) => setNewSlug(event.target.value)} placeholder="slug, e.g. furniture" />
            <input className="h-8 rounded border border-[#30363d] bg-[#010409] px-3 text-xs" value={newDisplayName} onChange={(event) => setNewDisplayName(event.target.value)} placeholder="Display name" />
            <input className="h-8 rounded border border-[#30363d] bg-[#010409] px-3 text-xs" value={newTriggers} onChange={(event) => setNewTriggers(event.target.value)} placeholder="trigger words, comma separated" />
            <button type="button" onClick={handleCreateConfig} disabled={!adminPassword || !newSlug || !newDisplayName} className="rounded border border-[#30363d] bg-[#238636] px-3 text-xs font-medium text-white disabled:opacity-50">
              Create
            </button>
          </div>
        )}
      </div>

      {tuneSteps.length > 0 && (
        <div className="rounded border border-[#30363d] bg-[#0d1117] p-3">
          <h3 className="mb-2 text-xs font-semibold text-[#8b949e]">Tuning history</h3>
          <div className="flex flex-col gap-1">
            {tuneSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-2 text-xs">
                <span className="text-[#8b949e]">{new Date(step.timestamp).toLocaleTimeString()}</span>
                <span className="text-[#c9d1d9]">{step.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[11px] font-medium text-[#8b949e]">{selectedSlug}.yml</label>
            <button
              type="button"
              onClick={() => setEditingYaml(!editingYaml)}
              className="rounded border border-[#30363d] px-2 py-0.5 text-[10px] text-[#8b949e] hover:text-[#c9d1d9]"
            >
              {editingYaml ? "Lock" : "Edit"}
            </button>
          </div>
          <textarea
            value={configYaml}
            onChange={(event) => editingYaml && setConfigYaml(event.target.value)}
            readOnly={!editingYaml}
            className="flex-1 resize-none rounded border border-[#30363d] bg-[#0d1117] p-3 font-mono text-[11px] leading-relaxed text-[#c9d1d9] focus:border-[#1f6feb] focus:outline-none"
            spellCheck={false}
          />
        </div>

        <div className="flex w-[28rem] flex-shrink-0 flex-col gap-3 overflow-auto">
          <div className="rounded border border-[#30363d] bg-[#0d1117] p-3">
            <h3 className="mb-2 text-xs font-semibold text-[#8b949e]">Run evidence for Gemini</h3>
            <textarea
              placeholder="Paste delivered lead patterns, best domains, score distribution, or report notes."
              value={jobSummary}
              onChange={(event) => setJobSummary(event.target.value)}
              className="mb-2 h-24 w-full resize-none rounded border border-[#30363d] bg-[#161b22] p-2 text-[11px] text-[#c9d1d9]"
            />
            <textarea
              placeholder="Paste audit rejects or false positives."
              value={auditSummary}
              onChange={(event) => setAuditSummary(event.target.value)}
              className="h-20 w-full resize-none rounded border border-[#30363d] bg-[#161b22] p-2 text-[11px] text-[#c9d1d9]"
            />
          </div>

          {tuneResult && (
            <div className="rounded border border-[#1f6feb]/30 bg-[#1f6feb]/5 p-3">
              <h3 className="mb-1 text-xs font-semibold text-[#58a6ff]">Gemini analysis: {tuneResult.score}/10</h3>
              <p className="mb-2 text-[11px] text-[#8b949e]">{tuneResult.diagnosis}</p>
              {tuneResult.suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  key={`${suggestion.type}-${index}`}
                  className={`mb-1.5 w-full rounded border p-2 text-left text-[11px] ${
                    acceptedSuggestions.has(index)
                      ? "border-[#3fb950]/30 bg-[#238636]/10"
                      : "border-[#30363d] bg-[#21262d]"
                  }`}
                  onClick={() => toggleSuggestion(index)}
                >
                  <div className="flex items-center gap-2">
                    <span className={acceptedSuggestions.has(index) ? "text-[#3fb950]" : "text-[#8b949e]"}>
                      {acceptedSuggestions.has(index) ? "selected" : "skip"} {suggestion.type}
                    </span>
                    <span className="text-[#58a6ff]">{suggestion.target}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#c9d1d9]">{suggestion.value}</div>
                  <div className="mt-0.5 text-[10px] text-[#8b949e]">{suggestion.reasoning}</div>
                </button>
              ))}
              {tuneResult.warnings?.length > 0 && (
                <div className="mt-2 border-t border-[#30363d] pt-2 text-[10px] text-[#f85149]/80">
                  {tuneResult.warnings.map((warning, index) => (
                    <div key={`${warning}-${index}`}>{warning}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {criticResult && (
            <div className={`rounded border p-3 ${criticResult.approved ? "border-[#3fb950]/30 bg-[#238636]/5" : "border-[#f85149]/30 bg-[#da3633]/5"}`}>
              <h3 className={`text-xs font-semibold ${criticResult.approved ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                {criticResult.approved ? "Approved" : "Needs work"} - {criticResult.tier} ({Math.round(criticResult.confidence * 100)}%)
              </h3>
              <p className="mt-1 text-[11px] text-[#c9d1d9]">{criticResult.verdict}</p>
              {criticResult.gaps?.length > 0 && (
                <div className="mt-2 text-[10px] text-[#c9d1d9]">
                  <div className="font-medium text-[#f85149]">Gaps</div>
                  {criticResult.gaps.map((gap, index) => <div key={`${gap}-${index}`}>{gap}</div>)}
                </div>
              )}
              {criticResult.score_breakdown && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {Object.entries(criticResult.score_breakdown).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded bg-[#21262d] px-2 py-0.5 text-[10px]">
                      <span className="text-[#8b949e]">{key.replace(/_/g, " ")}</span>
                      <span className="text-[#c9d1d9]">{value}/10</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
