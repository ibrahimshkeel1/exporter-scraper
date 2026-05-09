"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CopyPlus, Download, Play, Save, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { DualLiveTerminal } from "./AgenticChat";
import { JobReportCard } from "./JobReportCard";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";

type SpecialistConfigMeta = {
  slug: string;
  display_name: string;
  version: number;
  quality_tier: string;
  trigger_keywords: string[];
  keyword_count: number;
};

type TuneSuggestion = {
  type: "add_search_query" | "add_keyword" | "add_exclusion" | "add_seed_url";
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
  context?: TuningContext;
  jobId?: string;
  score?: number;
  approved?: boolean;
  tier?: string;
  verdict?: string;
  warnings?: string[];
};

type TuningExport = {
  id: string;
  format: string;
  storage_path: string | null;
  public_url: string | null;
  row_count: number | null;
  signed_url?: string | null;
};

type TuningJobEvidence = {
  job: {
    id: string;
    status: string;
    lead_exports?: TuningExport[];
  };
  evidence?: {
    report?: Record<string, unknown> | null;
    leadExportId?: string | null;
    auditExportId?: string | null;
    leadPreview?: string;
    auditPreview?: string;
    logSummary?: string;
    jobSummary?: string;
    auditSummary?: string;
  };
};

type TuningContext = {
  scenario?: string;
  refinedIndustry?: string;
  region?: string;
  searchTerms?: string;
  testLimit?: number;
  maxAnalyzed?: number;
  jobSummary?: string;
  auditSummary?: string;
};

const STORAGE_KEY = "exportflow_admin_password";
const TUNING_SCOPE_SLUG = "textile-apparel";

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

function lineIndent(line: string) {
  return line.match(/^\s*/)?.[0].length || 0;
}

function findBlockEnd(lines: string[], startIndex: number, indent: number) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && lineIndent(lines[index]) <= indent) {
      return index;
    }
  }
  return lines.length;
}

function normalizeRegionKey(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "united states" || normalized === "us") return "usa";
  if (normalized === "united kingdom") return "uk";
  return normalized.replace(/[^a-z0-9_-]/g, "-") || "international";
}

function parseSeedSuggestion(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      const url = String(parsed.url || parsed.href || "").trim();
      if (url) {
        return {
          url,
          label: String(parsed.label || parsed.name || new URL(url).hostname.replace(/^www\./, "")).trim(),
        };
      }
    }
  } catch {
    // Plain URL suggestions are expected.
  }

  const url = value.trim();
  let label = url;
  try {
    label = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    label = url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }

  return { url, label };
}

function addYamlSeedUrl(yaml: string, target: string, value: string, selectedRegion: string) {
  const seed = parseSeedSuggestion(value);
  if (!seed.url) return yaml;

  const targetMatch = target.match(/seed_urls\.([a-z0-9_-]+)(?:\.([a-z0-9_-]+))?/i);
  const regionKey = normalizeRegionKey(targetMatch?.[1] || selectedRegion);
  const groupKey = targetMatch?.[2] || "buyer_intent";
  const lines = yaml.split("\n");
  const seedUrlsIndex = lines.findIndex((line) => lineIndent(line) === 2 && line.trim() === "seed_urls:");
  if (seedUrlsIndex === -1) return yaml;

  const seedUrlsEnd = findBlockEnd(lines, seedUrlsIndex, 2);
  let regionIndex = -1;
  for (let index = seedUrlsIndex + 1; index < seedUrlsEnd; index += 1) {
    if (lineIndent(lines[index]) === 4 && lines[index].trim().startsWith(`${regionKey}:`)) {
      regionIndex = index;
      break;
    }
  }

  const itemLines = [
    `        - url: ${JSON.stringify(seed.url)}`,
    `          label: ${JSON.stringify(seed.label)}`,
  ];

  if (regionIndex === -1) {
    lines.splice(seedUrlsEnd, 0, `    ${regionKey}:`, `      ${groupKey}:`, ...itemLines);
    return lines.join("\n");
  }

  if (lines[regionIndex].trim() !== `${regionKey}:`) {
    lines.splice(regionIndex, 1, `    ${regionKey}:`, `      ${groupKey}:`, ...itemLines);
    return lines.join("\n");
  }

  const regionEnd = findBlockEnd(lines, regionIndex, 4);
  let groupIndex = -1;
  for (let index = regionIndex + 1; index < regionEnd; index += 1) {
    if (lineIndent(lines[index]) === 6 && lines[index].trim().startsWith(`${groupKey}:`)) {
      groupIndex = index;
      break;
    }
  }

  if (groupIndex === -1) {
    lines.splice(regionEnd, 0, `      ${groupKey}:`, ...itemLines);
    return lines.join("\n");
  }

  if (lines[groupIndex].trim() !== `${groupKey}:`) {
    lines.splice(groupIndex, 1, `      ${groupKey}:`, ...itemLines);
    return lines.join("\n");
  }

  lines.splice(groupIndex + 1, 0, ...itemLines);
  return lines.join("\n");
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 300) || `Unexpected response (${response.status})`);
  }
}

export function ConfigTuner() {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
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
  const [jobEvidence, setJobEvidence] = useState<TuningJobEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [autoFilledJobId, setAutoFilledJobId] = useState("");

  const [newSlug, setNewSlug] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newTriggers, setNewTriggers] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const liveTerminalRef = useRef<HTMLDivElement | null>(null);
  const historyContextSlugRef = useRef("");

  const selectedConfig = useMemo(
    () => configs.find((config) => config.slug === selectedSlug),
    [configs, selectedSlug],
  );
  const scopedConfigs = useMemo(() => {
    const textileConfig = configs.find((config) => config.slug === TUNING_SCOPE_SLUG);
    return textileConfig ? [textileConfig] : configs;
  }, [configs]);
  const canShowLiveTerminal = Boolean(lastJobId) && isSupabaseConfigured();

  useEffect(() => {
    if (!lastJobId) return;
    liveTerminalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lastJobId]);

  const currentContext = (): TuningContext => ({
    scenario,
    refinedIndustry,
    region,
    searchTerms,
    testLimit,
    maxAnalyzed,
    jobSummary,
    auditSummary,
  });

  const adminHeaders = useCallback(async (json = false) => {
    const headers: Record<string, string> = {
      "x-admin-password": adminPassword,
    };
    if (json) {
      headers["Content-Type"] = "application/json";
    }

    if (supabase) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    }

    return headers;
  }, [adminPassword, supabase]);

  const applyEvidenceToInputs = useCallback((payload: TuningJobEvidence, jobId: string) => {
    const nextJobSummary = payload.evidence?.jobSummary || "";
    const nextAuditSummary = payload.evidence?.auditSummary || "";

    if (nextJobSummary) setJobSummary(nextJobSummary);
    if (nextAuditSummary) setAuditSummary(nextAuditSummary);
    if (nextJobSummary || nextAuditSummary) setAutoFilledJobId(jobId);
  }, []);

  const loadJobEvidence = useCallback(async (
    jobId: string,
    options: { fillInputs?: boolean; ensureReport?: boolean; silent?: boolean } = {},
  ) => {
    if (!jobId || !adminPassword) return null;
    if (!options.silent) setEvidenceLoading(true);
    try {
      const response = await fetch(
        `/api/admin/jobs/${encodeURIComponent(jobId)}?ensureReport=${options.ensureReport ? "1" : "0"}`,
        { headers: await adminHeaders() },
      );
      const payload = await readJsonResponse<TuningJobEvidence & { error?: string }>(response);
      if (!response.ok || payload.error) throw new Error(payload.error || "Could not load tuning job evidence.");
      setJobEvidence(payload);
      if (options.fillInputs) {
        applyEvidenceToInputs(payload, jobId);
      }
      return payload;
    } finally {
      if (!options.silent) setEvidenceLoading(false);
    }
  }, [adminHeaders, adminPassword, applyEvidenceToInputs]);

  const openTuningJob = useCallback(async (jobId: string, fillInputs = true) => {
    setLastJobId(jobId);
    setError("");
    setMessage("");
    try {
      const payload = await loadJobEvidence(jobId, { fillInputs, ensureReport: true });
      if (payload) {
        setMessage(fillInputs ? "Run evidence imported into Gemini inputs." : "Tuning run opened.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not open tuning run.");
    }
  }, [loadJobEvidence]);

  function exportById(exportId?: string | null) {
    if (!exportId) return null;
    return (jobEvidence?.job.lead_exports || []).find((file) => file.id === exportId) || null;
  }

  function downloadExport(exportId?: string | null) {
    const file = exportById(exportId);
    const url = file?.signed_url || file?.public_url;
    if (!url) {
      setError("Download URL is not available for that export yet.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function downloadReport() {
    const report = jobEvidence?.evidence?.report;
    if (!report || typeof window === "undefined") return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${lastJobId || "tuning"}_ai_report.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  const applyLatestHistoryContext = (slug: string, history: TuneStep[]) => {
    if (historyContextSlugRef.current === slug) return;

    const latestContext = [...history].reverse().find((step) => step.context)?.context;
    if (latestContext) {
      if (latestContext.scenario) setScenario(latestContext.scenario);
      if (latestContext.refinedIndustry) setRefinedIndustry(latestContext.refinedIndustry);
      if (latestContext.region) setRegion(latestContext.region);
      if (latestContext.searchTerms) setSearchTerms(latestContext.searchTerms);
      if (typeof latestContext.testLimit === "number") setTestLimit(latestContext.testLimit);
      if (typeof latestContext.maxAnalyzed === "number") setMaxAnalyzed(latestContext.maxAnalyzed);
      if (typeof latestContext.jobSummary === "string") setJobSummary(latestContext.jobSummary);
      if (typeof latestContext.auditSummary === "string") setAuditSummary(latestContext.auditSummary);
    }

    const latestJob = [...history].reverse().find((step) => step.jobId);
    if (latestJob?.jobId) {
      setLastJobId(latestJob.jobId);
    }

    historyContextSlugRef.current = slug;
  };

  const loadTuningHistory = useCallback(async (slug: string, password: string) => {
    if (!slug || !password) return;

    const response = await fetch(`/api/admin/configs/${slug}/history`, {
      headers: { "x-admin-password": password },
    });
    const payload = await readJsonResponse<{ history?: TuneStep[]; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error || "Could not load tuning history.");

    const history = payload.history || [];
    setTuneSteps(history);
    applyLatestHistoryContext(slug, history);
  }, []);

  const addStep = (type: TuneStep["type"], stepMessage: string, extra: Partial<TuneStep> = {}) => {
    const step: TuneStep = {
      id: `${type}-${Date.now()}`,
      type,
      timestamp: Date.now(),
      message: stepMessage,
      context: currentContext(),
      ...extra,
    };

    setTuneSteps((prev) => [...prev, step]);

    if (selectedSlug && adminPassword) {
      fetch(`/api/admin/configs/${selectedSlug}/history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ entry: step }),
      })
        .then(async (response) => {
          const payload = await readJsonResponse<{ history?: TuneStep[] }>(response);
          if (response.ok && payload.history) {
            setTuneSteps(payload.history);
          }
        })
        .catch(() => undefined);
    }
  };

  const loadConfigs = useCallback(async () => {
    const response = await fetch("/api/admin/configs");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load configs.");
    const nextConfigs = (payload.configs || []) as SpecialistConfigMeta[];
    setConfigs(nextConfigs);
    const textileConfig = nextConfigs.find((config) => config.slug === TUNING_SCOPE_SLUG);
    if (textileConfig && selectedSlug !== TUNING_SCOPE_SLUG) {
      setSelectedSlug(TUNING_SCOPE_SLUG);
      return;
    }
    if (!selectedSlug && nextConfigs.length > 0) {
      setSelectedSlug(nextConfigs[0].slug);
    }
  }, [selectedSlug]);

  useEffect(() => {
    setAdminPassword(localStorage.getItem(STORAGE_KEY) || "");
    loadConfigs().catch((err) => setError(err instanceof Error ? err.message : "Failed to load configs."));
  }, [loadConfigs]);

  useEffect(() => {
    historyContextSlugRef.current = "";
    setTuneSteps([]);
    setLastJobId("");
    setJobEvidence(null);
    setAutoFilledJobId("");
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedSlug || !adminPassword) return;
    loadTuningHistory(selectedSlug, adminPassword).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load tuning history.");
    });
  }, [selectedSlug, adminPassword, loadTuningHistory]);

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

  useEffect(() => {
    if (!lastJobId || !adminPassword) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const payload = await loadJobEvidence(lastJobId, { silent: true });
        if (cancelled || !payload) return;

        const hasEvidence = Boolean(payload.evidence?.report || payload.evidence?.leadPreview || payload.evidence?.auditPreview);
        if (hasEvidence && autoFilledJobId !== lastJobId) {
          applyEvidenceToInputs(payload, lastJobId);
        }

        const status = String(payload.job?.status || "");
        if (status === "delivered" && !payload.evidence?.report) {
          await loadJobEvidence(lastJobId, { fillInputs: autoFilledJobId !== lastJobId, ensureReport: true, silent: true });
          return;
        }

        if (!["delivered", "failed", "rejected"].includes(status)) {
          timer = setTimeout(poll, 8000);
        }
      } catch {
        if (!cancelled) {
          timer = setTimeout(poll, 12000);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [adminPassword, applyEvidenceToInputs, autoFilledJobId, lastJobId, loadJobEvidence]);

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
        headers: await adminHeaders(true),
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
      const jobId = payload.jobId || payload.job?.id || "";
      setLastJobId(jobId);
      setJobEvidence(null);
      setAutoFilledJobId("");
      setMessage(payload.warning ? `Job created, but not queued: ${payload.warning}` : "Tuning test queued.");
      addStep("test_run", `Queued ${testLimit}-lead ${selectedSlug} test for ${region}.`, { jobId });
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
      const result = await readJsonResponse<TuneResult>(response);
      if (!response.ok || result.error) throw new Error(result.error || "Tune analysis failed.");

      setTuneResult({ ...result, suggestions: result.suggestions || [], warnings: result.warnings || [] });
      setAcceptedSuggestions(new Set());
      addStep("analysis", `Gemini scored the config ${result.score}/10.`, {
        score: result.score,
        warnings: result.warnings || [],
      });
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
        const targetKey = suggestion.target.split(".").pop() || "host_parts";
        updatedYaml = addYamlListItem(updatedYaml, targetKey, suggestion.value);
      } else if (suggestion.type === "add_seed_url") {
        updatedYaml = addYamlSeedUrl(updatedYaml, suggestion.target, suggestion.value, region);
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
      const result = await readJsonResponse<CriticResult>(response);
      if (!response.ok || result.error) throw new Error(result.error || "Critic check failed.");

      setCriticResult(result);
      addStep("critic", result.approved ? `Critic approved ${selectedSlug} as ${result.tier}.` : `Critic needs work: ${result.verdict}`, {
        approved: result.approved,
        tier: result.tier,
        verdict: result.verdict,
      });
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
            Textile-apparel tuning only for now. Gemini analysis and critic checks are single calls; scraper tests are capped by lead and page limits.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[#8b949e]">
            {["Test", "Analyze", "Apply", "Save", "Retest", "Critic"].map((label, index) => (
              <span key={label} className="rounded border border-[#30363d] bg-[#0d1117] px-2 py-0.5">
                {index + 1}. {label}
              </span>
            ))}
          </div>
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
              {scopedConfigs.map((config) => (
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

      {!configs.some((config) => config.slug === TUNING_SCOPE_SLUG) && (
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
      )}

      {tuneSteps.length > 0 && (
        <div className="rounded border border-[#30363d] bg-[#0d1117] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-[#8b949e]">Tuning history</h3>
            <span className="text-[10px] text-[#8b949e]">{selectedSlug}</span>
          </div>
          <div className="flex max-h-48 flex-col gap-1 overflow-auto">
            {[...tuneSteps].reverse().map((step) => (
              <div key={step.id} className="rounded border border-[#21262d] bg-[#010409] px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[#8b949e]">{new Date(step.timestamp).toLocaleTimeString()}</span>
                  <span className="text-[#c9d1d9]">{step.message}</span>
                  {step.jobId && <span className="font-mono text-[10px] text-[#58a6ff]">job {step.jobId.slice(0, 8)}</span>}
                  {step.jobId && (
                    <button
                      type="button"
                      onClick={() => void openTuningJob(step.jobId || "")}
                      className="rounded border border-[#30363d] px-1.5 py-0.5 text-[10px] text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff]"
                    >
                      Open
                    </button>
                  )}
                  {typeof step.score === "number" && <span className="text-[10px] text-[#d29922]">score {step.score}/10</span>}
                  {step.tier && <span className="text-[10px] text-[#8b949e]">{step.tier}</span>}
                </div>
                {step.context?.scenario && (
                  <div className="mt-0.5 truncate text-[10px] text-[#8b949e]">
                    {step.context.region || region} - {step.context.scenario}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {lastJobId && (
        <div ref={liveTerminalRef} className="rounded border border-[#30363d] bg-[#0d1117] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-[#8b949e]">Live tuning terminal</h3>
              <p className="mt-0.5 font-mono text-[10px] text-[#00ffff]">job {lastJobId.slice(0, 8)}</p>
            </div>
            {!canShowLiveTerminal && (
              <span className="text-[10px] text-[#8b949e]">Live logs need browser Supabase env vars.</span>
            )}
          </div>
          {canShowLiveTerminal ? (
            <div className="h-[34rem] min-h-0 overflow-hidden">
              <DualLiveTerminal jobId={lastJobId} initialEvents={[]} />
            </div>
          ) : (
            <div className="border border-[#30363d] bg-black px-3 py-2 text-xs text-[#8b949e]">
              Waiting for browser Supabase configuration before opening live logs.
            </div>
          )}
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
            {lastJobId && (
              <div className="mt-2 border-t border-[#30363d] pt-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-[10px] text-[#58a6ff]">job {lastJobId.slice(0, 8)}</p>
                    {jobEvidence?.job?.status && <p className="text-[10px] text-[#8b949e]">status: {jobEvidence.job.status}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void openTuningJob(lastJobId)}
                    disabled={evidenceLoading}
                    className="inline-flex items-center gap-1.5 rounded border border-[#30363d] px-2 py-1 text-[10px] text-[#c9d1d9] hover:border-[#58a6ff] hover:text-[#58a6ff] disabled:opacity-50"
                  >
                    <Search size={11} />
                    {evidenceLoading ? "Importing..." : "Import run evidence"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadExport(jobEvidence?.evidence?.leadExportId)}
                    disabled={!jobEvidence?.evidence?.leadExportId}
                    className="inline-flex items-center gap-1.5 rounded border border-[#30363d] px-2 py-1 text-[10px] text-[#c9d1d9] hover:border-[#00ffff] hover:text-[#00ffff] disabled:opacity-50"
                  >
                    <Download size={11} />
                    Leads CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadExport(jobEvidence?.evidence?.auditExportId)}
                    disabled={!jobEvidence?.evidence?.auditExportId}
                    className="inline-flex items-center gap-1.5 rounded border border-[#30363d] px-2 py-1 text-[10px] text-[#c9d1d9] hover:border-[#00ffff] hover:text-[#00ffff] disabled:opacity-50"
                  >
                    <Download size={11} />
                    Audit CSV
                  </button>
                  <button
                    type="button"
                    onClick={downloadReport}
                    disabled={!jobEvidence?.evidence?.report}
                    className="inline-flex items-center gap-1.5 rounded border border-[#30363d] px-2 py-1 text-[10px] text-[#c9d1d9] hover:border-[#00ffff] hover:text-[#00ffff] disabled:opacity-50"
                  >
                    <Download size={11} />
                    AI report
                  </button>
                </div>
              </div>
            )}
          </div>

          {jobEvidence?.evidence?.report && (
            <div className="rounded border border-[#2dd4bf]/40 bg-[#2dd4bf]/10 p-3">
              <JobReportCard report={jobEvidence.evidence.report as any} />
            </div>
          )}

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
