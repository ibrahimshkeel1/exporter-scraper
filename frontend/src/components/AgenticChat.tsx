"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Check, Copy, Download, Loader2, Mail, Send, Sparkles, Terminal } from "lucide-react";
import { leadPacks } from "../lib/pricing";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { TargetingPreflight } from "../lib/types";
import { parsePastedLeads } from "../lib/outreach";
import { laneFromPayload } from "../lib/log-lanes";
import { JobReportCard } from "./JobReportCard";

export type AgenticMessage = {
  id: string;
  role: "assistant" | "user";
  type: "text" | "config" | "terminal" | "report" | "outreach";
  content?: string;
  payload?: any;
  created_at: string;
};

type AgenticChatProps = {
  onJobCreated?: () => void;
  onActiveJobChange?: (jobId: string | undefined) => void;
};

type RunConfigSnapshot = {
  packId: string;
  leadCount: number;
  market: string;
  minScore: number;
  allowNoEmail: boolean;
};

type WorkerLog = {
  message: string;
  source: string;
  status: string;
  time: string;
  engine?: string;
  lane?: string;
  proxyBefore?: string;
  proxyAfter?: string;
  reason?: string;
};

const initialMessages: AgenticMessage[] = [
  {
    id: "initial",
    role: "assistant",
    type: "text",
    content:
      "Tell me what you sell, your website, who you want as clients, where you want to find them, and what makes a lead useful. I’ll ask follow-ups only if the search is still vague, then I’ll confirm the lead plan before we run it.",
    created_at: new Date().toISOString(),
  },
];

function normalizeRegion(value: string) {
  const lower = value.trim().toLowerCase();
  if (["usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "america", "american"].includes(lower)) {
    return "USA";
  }
  if (["uk", "u.k.", "united kingdom", "britain", "great britain", "england"].includes(lower)) {
    return "UK";
  }
  if (["eu", "europe", "european union"].includes(lower)) {
    return "Europe";
  }
  if (["international", "global", "worldwide"].includes(lower)) {
    return "International";
  }
  return value;
}

function logTime() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function parseWorkerPayload(event: MessageEvent) {
  try {
    const parsed = JSON.parse(event.data) as Record<string, unknown>;
    const source = typeof parsed.source === "string" ? parsed.source : "worker";
    const status = typeof parsed.status === "string" ? parsed.status : "terminal";
    const message = typeof parsed.message === "string" ? parsed.message : JSON.stringify(parsed);
    const engine = typeof parsed.engine === "string" ? parsed.engine : "";
    const lane = typeof parsed.lane === "string" ? parsed.lane : "";
    const proxyBefore = typeof parsed.proxy_before === "string" ? parsed.proxy_before : "";
    const proxyAfter = typeof parsed.proxy_after === "string" ? parsed.proxy_after : "";
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    return { message, source, status, engine, lane, proxyBefore, proxyAfter, reason };
  } catch {
    return { message: event.data, source: "worker", status: "terminal", engine: "", lane: "", proxyBefore: "", proxyAfter: "", reason: "" };
  }
}

type DiscoveryLane = "bing" | "duckduckgo" | "yahoo";

export function DualLiveTerminal({ jobId }: { jobId: string }) {
  const [discoveryLogs, setDiscoveryLogs] = useState<Record<DiscoveryLane, WorkerLog[]>>({
    bing: [],
    duckduckgo: [],
    yahoo: [],
  });
  const [enrichmentLogs, setEnrichmentLogs] = useState<WorkerLog[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "retrying">("connecting");
  const [copiedLane, setCopiedLane] = useState<"bing" | "duckduckgo" | "yahoo" | "enrichment" | null>(null);
  const discoveryBingRef = useRef<HTMLDivElement>(null);
  const discoveryDuckRef = useRef<HTMLDivElement>(null);
  const discoveryYahooRef = useRef<HTMLDivElement>(null);
  const enrichmentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobId) return;
    const sseUrl = `/api/jobs/${encodeURIComponent(jobId)}/logs`;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    setDiscoveryLogs({ bing: [], duckduckgo: [], yahoo: [] });
    setEnrichmentLogs([]);
    setState("connecting");

    const pushLog = (entry: WorkerLog) => {
      if (!entry.message) return;
      const lane = laneFromPayload(entry);
      if (lane === "enrichment") {
        setEnrichmentLogs((current) => [...current, entry]);
      } else {
        setDiscoveryLogs((current) => ({
          ...current,
          [lane]: [...current[lane], entry],
        }));
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const payload = parseWorkerPayload(event);
      pushLog({
        message: payload.message,
        source: payload.source,
        status: payload.status,
        time: logTime(),
        lane: payload.lane,
        engine: payload.engine,
        proxyBefore: payload.proxyBefore,
        proxyAfter: payload.proxyAfter,
        reason: payload.reason,
      });
    };

    const connect = () => {
      if (closed) return;
      eventSource = new EventSource(sseUrl);
      setState("connecting");

      eventSource.onopen = () => setState("live");
      eventSource.onmessage = handleMessage;
      eventSource.addEventListener("worker_event", handleMessage);
      eventSource.addEventListener("worker_status", handleMessage);
      eventSource.onerror = () => {
        if (closed) return;
        setState("retrying");
        eventSource?.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [jobId]);

  useEffect(() => {
    if (discoveryBingRef.current) discoveryBingRef.current.scrollTop = discoveryBingRef.current.scrollHeight;
    if (discoveryDuckRef.current) discoveryDuckRef.current.scrollTop = discoveryDuckRef.current.scrollHeight;
    if (discoveryYahooRef.current) discoveryYahooRef.current.scrollTop = discoveryYahooRef.current.scrollHeight;
  }, [discoveryLogs]);

  useEffect(() => {
    if (enrichmentRef.current) {
      enrichmentRef.current.scrollTop = enrichmentRef.current.scrollHeight;
    }
  }, [enrichmentLogs]);

  async function copyLaneLogs(lane: "bing" | "duckduckgo" | "yahoo" | "enrichment") {
    const logs = lane === "enrichment" ? enrichmentLogs : discoveryLogs[lane];
    if (logs.length === 0 || typeof navigator === "undefined" || !navigator.clipboard) return;
    const text = logs
      .map((log) => {
        const proxyRotation =
          log.proxyBefore && log.proxyAfter ? ` | proxy ${log.proxyBefore} -> ${log.proxyAfter}` : "";
        return `[${log.time}] [${log.source}] ${log.message}${proxyRotation}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedLane(lane);
    setTimeout(() => setCopiedLane((current) => (current === lane ? null : current)), 1200);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2 overflow-hidden xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="ide-terminal grid min-h-0 grid-cols-1 gap-2 overflow-hidden p-2 xl:col-span-3 xl:grid-cols-3">
        {[
          { key: "bing", label: "DISCOVERY / BING", ref: discoveryBingRef },
          { key: "duckduckgo", label: "DISCOVERY / DUCKDUCKGO", ref: discoveryDuckRef },
          { key: "yahoo", label: "DISCOVERY / YAHOO", ref: discoveryYahooRef },
        ].map((laneRow) => (
          <div key={laneRow.key} className="flex h-full min-h-0 flex-col overflow-hidden border border-[#30363d] bg-black">
            <div className="flex items-center justify-between border-b border-[#30363d] px-2 py-1 text-[10px] font-mono text-[#00ffff]">
              <span className="inline-flex items-center gap-1.5">
                <Terminal size={11} />
                {laneRow.label}
              </span>
              <div className="inline-flex items-center gap-2">
                <span>{state.toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => void copyLaneLogs(laneRow.key as DiscoveryLane)}
                  className="ide-btn inline-flex h-5 items-center gap-1 px-1.5 text-[9px]"
                >
                  {copiedLane === laneRow.key ? <Check size={10} /> : <Copy size={10} />}
                  Copy
                </button>
              </div>
            </div>
            <div ref={laneRow.ref} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-5 text-[#00ff00]">
              {(discoveryLogs[laneRow.key as DiscoveryLane] || []).map((log, index) => (
                <div key={`${laneRow.key}-${index}`} className="whitespace-pre-wrap break-words">
                  <span className="text-[#00ffff]">[{log.time}]</span> {log.message}
                  {log.proxyBefore && log.proxyAfter && (
                    <div className="text-[10px] text-[#00ffff]">
                      proxy rotated: {log.proxyBefore} → {log.proxyAfter}
                    </div>
                  )}
                </div>
              ))}
              {(discoveryLogs[laneRow.key as DiscoveryLane] || []).length === 0 && (
                <div className="text-[#8b949e]">Waiting for {laneRow.key} logs...</div>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="ide-terminal flex min-h-0 flex-col overflow-hidden xl:col-span-3">
        <div className="flex items-center justify-between border-b border-[#30363d] px-3 py-1.5 text-[11px] font-mono text-[#00ffff]">
          <span className="inline-flex items-center gap-1.5">
            <Terminal size={12} />
            ENRICH / SCORE
          </span>
          <div className="inline-flex items-center gap-2">
              <span>{state.toUpperCase()}</span>
              <button
                type="button"
                onClick={() => void copyLaneLogs("enrichment")}
              className="ide-btn inline-flex h-6 items-center gap-1 px-2 text-[10px]"
            >
              {copiedLane === "enrichment" ? <Check size={11} /> : <Copy size={11} />}
              Copy
            </button>
          </div>
        </div>
        <div ref={enrichmentRef} className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-5 text-[#00ff00]">
          {enrichmentLogs.map((log, index) => (
            <div key={`e-${index}`} className="whitespace-pre-wrap break-words">
              <span className="text-[#00ffff]">[{log.time}]</span> {log.message}
              {log.proxyBefore && log.proxyAfter && (
                <div className="text-[11px] text-[#00ffff]">
                  proxy rotated: {log.proxyBefore} → {log.proxyAfter}
                </div>
              )}
            </div>
          ))}
          {enrichmentLogs.length === 0 && <div className="text-[#8b949e]">Waiting for enrichment logs...</div>}
        </div>
      </section>
    </div>
  );
}

function ReportDownloads({
  jobId,
  supabase,
  report,
}: {
  jobId: string;
  supabase: ReturnType<typeof createBrowserSupabase> | null;
  report?: Record<string, unknown> | null;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  async function openExport(format: "csv" | "xlsx") {
    if (!supabase) return;
    setDownloadError(null);
    setDownloadingFormat(format);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setDownloadError("Sign in required for download.");
      setDownloadingFormat(null);
      return;
    }

    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/exports?format=${format}&mode=url`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    setDownloadingFormat(null);
    if (!response.ok || !payload.url) {
      setDownloadError(payload.error || "Could not fetch download URL.");
      return;
    }

    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  function downloadReportJson() {
    if (!report || typeof window === "undefined") return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${jobId}_ai_report.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {report && (
          <button
            type="button"
            onClick={downloadReportJson}
            className="ide-btn inline-flex items-center gap-2 px-3 py-2 text-sm"
          >
            <Download size={14} />
            AI Report
          </button>
        )}
        <button
          type="button"
          onClick={() => void openExport("csv")}
          disabled={downloadingFormat !== null}
          className="ide-btn ide-btn-primary inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"
        >
          <Download size={14} />
          Leads CSV
        </button>
        <button
          type="button"
          onClick={() => void openExport("xlsx")}
          disabled={downloadingFormat !== null}
          className="ide-btn inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"
        >
          <Download size={14} />
          Audit XLSX
        </button>
      </div>
      {downloadError && <p className="text-xs text-amber-300">{downloadError}</p>}
    </div>
  );
}

export function AgenticChat({ onJobCreated, onActiveJobChange }: AgenticChatProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [messages, setMessages] = useState<AgenticMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reportRequestedRef = useRef<Set<string>>(new Set());

  async function resetConversation() {
    setMessages(initialMessages);
    if (!supabase) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch("/api/chat", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
  }

  useEffect(() => {
    const onNewChat = () => {
      void resetConversation();
    };
    window.addEventListener("exportflow:new-chat", onNewChat);
    return () => window.removeEventListener("exportflow:new-chat", onNewChat);
  }, [supabase]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  useEffect(() => {
    async function loadSession() {
      if (!supabase) {
        setMessages(initialMessages);
        setSessionLoaded(true);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const res = await fetch("/api/chat", { headers: { Authorization: `Bearer ${session.access_token}` } });
          const json = await res.json();
          if (json.session && json.session.messages.length > 0) {
            setMessages(json.session.messages);
            setSessionLoaded(true);
            return;
          }
        } catch {
          // no-op
        }
      }
      setMessages(initialMessages);
      setSessionLoaded(true);
    }
    void loadSession();
  }, [supabase]);

  useEffect(() => {
    async function syncSession() {
      if (!supabase || !sessionLoaded || messages.length === 0 || messages === initialMessages) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ messages }),
        });
      }
    }
    void syncSession();
  }, [messages, sessionLoaded, supabase]);

  const runningJobIds = useMemo(
    () =>
      Array.from(
        new Set(
          messages
            .filter((item) => item.type === "terminal")
            .map((item) => String(item.payload?.jobId || ""))
            .filter(Boolean)
        )
      ),
    [messages]
  );

  useEffect(() => {
    if (!supabase || runningJobIds.length === 0) return;

    async function autoGenerateReport(jobId: string) {
      if (!supabase) return;
      if (reportRequestedRef.current.has(jobId)) return;
      reportRequestedRef.current.add(jobId);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      await fetch(`/api/jobs/${encodeURIComponent(jobId)}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    async function backfillReportCards() {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const response = await fetch("/api/jobs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) return;
      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

      setMessages((current) => {
        let changed = false;
        let next = current;

        for (const job of jobs) {
          const jobId = String(job?.id || "");
          if (!jobId || !runningJobIds.includes(jobId)) continue;
          const events = Array.isArray(job?.job_events) ? job.job_events : [];
          const reportEvent = [...events].reverse().find((event: any) => event?.status === "report_ready" && event?.metadata?.report);
          if (!reportEvent?.metadata?.report) continue;
          if (next.some((item) => item.type === "report" && item.payload?.jobId === jobId)) continue;
          changed = true;
          next = [
            ...next,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              type: "report",
              payload: { jobId, report: reportEvent.metadata.report },
              created_at: new Date().toISOString(),
            },
          ];
        }

        return changed ? next : current;
      });
    }

    const channel = supabase
      .channel("chat-job-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_events" }, (payload) => {
        const evt = payload.new as { status: string; job_id: string; message?: string; metadata?: Record<string, unknown> };
        if (!runningJobIds.includes(evt.job_id)) return;
        if (evt.status !== "report_ready" && evt.status !== "delivered" && evt.status !== "failed") return;

        if (evt.status === "delivered") {
          void autoGenerateReport(evt.job_id);
        }

        setMessages((current) => {
          if (evt.status === "report_ready" && evt.metadata?.report) {
            if (current.some((item) => item.type === "report" && item.payload?.jobId === evt.job_id)) return current;
            return [
              ...current,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "report",
                payload: { jobId: evt.job_id, report: evt.metadata.report },
                created_at: new Date().toISOString(),
              },
            ];
          }

          if (evt.status === "delivered") {
            if (
              current.some(
                (item) =>
                  item.type === "text" &&
                  item.payload?.kind === "delivery_notice" &&
                  item.payload?.jobId === evt.job_id
              )
            ) {
              return current;
            }
            const newMessages: AgenticMessage[] = [
              {
                id: crypto.randomUUID(),
                role: "assistant",
                type: "text",
                content: "Delivery complete. I'm generating the AI quality report now.",
                payload: { kind: "delivery_notice", jobId: evt.job_id },
                created_at: new Date().toISOString(),
              },
            ];
            if (!current.some((item) => item.type === "outreach" && item.payload?.jobId === evt.job_id)) {
              newMessages.push({
                id: crypto.randomUUID(),
                role: "assistant",
                type: "text",
                content: "Want to run an email outreach funnel on these leads? Type 'start outreach' or open the Outreach tab.",
                payload: { kind: "outreach_suggestion", jobId: evt.job_id },
                created_at: new Date().toISOString(),
              });
            }
            return [...current, ...newMessages];
          }

          if (
            current.some(
              (item) =>
                item.type === "text" &&
                item.payload?.kind === "failed_notice" &&
                item.payload?.jobId === evt.job_id
            )
          ) {
            return current;
          }

          const alreadyDelivered = current.some(
            (item) =>
              (item.type === "text" && item.payload?.kind === "delivery_notice" && item.payload?.jobId === evt.job_id) ||
              (item.type === "report" && item.payload?.jobId === evt.job_id)
          );
          if (alreadyDelivered) {
            return current;
          }
          const failedMessage = String(evt.message || "");
          const looksLikeDeliveryFailure =
            failedMessage.toLowerCase().includes("delivery failed") ||
            failedMessage.toLowerCase().includes("export delivery failed") ||
            failedMessage.toLowerCase().includes("upload failed");
          return [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              type: "text",
              content: looksLikeDeliveryFailure
                ? "Job run completed but export delivery failed. Open logs and retry delivery/upload."
                : "Job failed. Open live logs and check proxy/source health.",
              payload: { kind: "failed_notice", jobId: evt.job_id },
              created_at: new Date().toISOString(),
            },
          ];
        });
      })
      .subscribe();

    void backfillReportCards();
    const pollTimer = setInterval(() => {
      void backfillReportCards();
    }, 12000);

    return () => {
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [runningJobIds, supabase]);

  function detectOutreachIntent(text: string) {
    const lower = text.toLowerCase();
    const keywords = ["email campaign", "outreach", "email funnel", "send emails", "cold email", "followup", "follow up"];
    return keywords.some((kw) => lower.includes(kw));
  }

  async function analyzeConversation(nextMessages: AgenticMessage[]) {
    setIsThinking(true);
    try {
      const lastJobArtifactIndex = nextMessages.reduce((lastIndex, message, index) => {
        return ["config", "terminal", "report", "outreach"].includes(message.type) ? index : lastIndex;
      }, -1);
      const activeThread = nextMessages.slice(lastJobArtifactIndex + 1);
      const conversation = activeThread
        .filter((message) => message.type === "text")
        .map((message) => ({ role: message.role, content: message.content || "" }));

      const lastUserText = conversation.filter((m) => m.role === "user").at(-1)?.content || "";
      if (detectOutreachIntent(lastUserText)) {
        const preflightBrief = nextMessages.find((m) => m.type === "config" && m.payload?.brief)?.payload?.brief as TargetingPreflight | undefined;
        const prefill: Record<string, string> = {};
        if (preflightBrief) {
          prefill.business_plan = preflightBrief.offerSummary || "";
          prefill.target_buyer = preflightBrief.idealCustomerProfile || "";
        }
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "outreach",
            payload: { prefill },
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }

      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: "International",
          productCategory: "",
          buyerType: "",
          notes: "",
          conversation,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not analyze.");

      const brief = payload.preflight as TargetingPreflight;
      if (brief.needsMoreInfo) {
        const questions = brief.followUpQuestions?.length ? brief.followUpQuestions : ["Which countries should we prioritize?"];
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "text",
            content: "I need a bit more context before running:\n\n" + questions.map((q, index) => `${index + 1}. ${q}`).join("\n"),
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "config",
            payload: { brief },
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not analyze.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          type: "text",
          content: `I could not analyze that yet: ${message}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function appendUserMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isThinking) return;

    const nextMessages = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", type: "text", content, created_at: new Date().toISOString() } as AgenticMessage,
    ];
    setMessages(nextMessages);
    setDraft("");
    await analyzeConversation(nextMessages);
  }

  const activeTerminalJobId = [...messages]
    .reverse()
    .find((message) => message.type === "terminal" && typeof message.payload?.jobId === "string")?.payload?.jobId as
    | string
    | undefined;
  const visibleMessages = messages.filter((message) => message.type !== "terminal");

  useEffect(() => {
    onActiveJobChange?.(activeTerminalJobId);
  }, [activeTerminalJobId, onActiveJobChange]);

  return (
    <section className="ide-panel flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-3 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#8b949e]">Agentic Lead Search</p>
          <h2 className="text-sm font-semibold text-vercel-text">Live discovery + enrichment workspace</h2>
        </div>
        <div className="inline-flex items-center gap-2">
          <span className="ide-status">{sessionLoaded ? "session synced" : "loading session"}</span>
        </div>
      </header>

      <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {visibleMessages.map((message) => (
            <div key={message.id}>
              {message.type === "text" && (
                <div
                  className={`ide-panel px-3 py-2 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-transparent text-[#00ffff]"
                      : "border-[#10a3a3] bg-[#33dfdf] text-black"
                  }`}
                >
                  <span className={`mr-2 ${message.role === "user" ? "text-[#8b949e]" : "text-black/70"}`}>
                    {message.role === "user" ? ">" : "ai>"}
                  </span>
                  <span className="whitespace-pre-wrap">{message.content}</span>
                </div>
              )}

              {message.type === "config" && Boolean(message.payload?.brief) && (
                <div className="mt-2">
                  <ConfigWidget
                    brief={message.payload.brief as TargetingPreflight}
                    messages={messages}
                    startedConfig={message.payload?.runConfig as RunConfigSnapshot | undefined}
                    supabase={supabase}
                    onJobStarted={(jobId, runConfig) => {
                      setMessages((current) => {
                        const updated = current.map((item) =>
                          item.id === message.id
                            ? {
                                ...item,
                                payload: {
                                  ...(item.payload || {}),
                                  runConfig,
                                  startedJobId: jobId,
                                },
                              }
                            : item
                        );
                        return [
                          ...updated,
                          {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            type: "terminal",
                            payload: { jobId },
                            created_at: new Date().toISOString(),
                          },
                          {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            type: "text",
                            content: `Job ${jobId.slice(0, 8)} started. Streaming live lanes below.`,
                            created_at: new Date().toISOString(),
                          },
                        ];
                      });
                      onJobCreated?.();
                    }}
                  />
                </div>
              )}

              {message.type === "report" && Boolean(message.payload?.report) && (
                <div className="mt-2 space-y-2">
                  <JobReportCard report={message.payload.report as any} />
                  <ReportDownloads jobId={String(message.payload.jobId)} supabase={supabase} report={message.payload.report as Record<string, unknown>} />
                </div>
              )}

              {message.type === "outreach" && (
                <div className="mt-2">
                  <OutreachLauncherWidget
                    prefill={message.payload?.prefill as Record<string, string> | undefined}
                    supabase={supabase}
                  />
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="ide-panel inline-flex items-center gap-2 px-3 py-2 text-sm text-[#00ffff]">
              <Loader2 size={14} className="animate-spin" />
              analyzing request...
            </div>
          )}
        </div>

      </div>

      <footer className="border-t border-[#30363d] bg-[#161b22] p-3">
        <form className="flex gap-2" onSubmit={appendUserMessage}>
          <textarea
            className="ide-input h-14 flex-1 resize-none px-3 py-2 text-sm"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void appendUserMessage(event as unknown as FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="Describe your offer, market, and lead quality criteria..."
            disabled={isThinking}
          />
          <button
            className="ide-btn ide-btn-primary inline-flex h-14 w-14 items-center justify-center disabled:opacity-50"
            type="submit"
            disabled={isThinking || !draft.trim()}
          >
            {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </footer>
    </section>
  );
}

function ConfigWidget({
  brief,
  messages,
  startedConfig,
  supabase,
  onJobStarted,
}: {
  brief: TargetingPreflight;
  messages: AgenticMessage[];
  startedConfig?: RunConfigSnapshot;
  supabase: ReturnType<typeof createBrowserSupabase> | null;
  onJobStarted: (id: string, runConfig: RunConfigSnapshot) => void;
}) {
  const [packId, setPackId] = useState(startedConfig?.packId || "starter");
  const [market, setMarket] = useState(startedConfig?.market || normalizeRegion(brief.targetMarkets?.[0] || "International"));
  const [minScore, setMinScore] = useState(
    startedConfig?.minScore ?? (brief.recommendedMinScore ? Math.max(35, Math.min(85, brief.recommendedMinScore)) : 55)
  );
  const [allowNoEmail, setAllowNoEmail] = useState(startedConfig?.allowNoEmail ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [localStartedConfig, setLocalStartedConfig] = useState<RunConfigSnapshot | null>(startedConfig || null);

  useEffect(() => {
    if (startedConfig) {
      setLocalStartedConfig(startedConfig);
    }
  }, [startedConfig]);

  async function createJob() {
    if (!supabase) return;
    setSubmitting(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setSubmitting(false);
      return;
    }

    const userMessages = messages.filter((item) => item.role === "user");
    const productCategory = brief.offerSummary || brief.refinedIndustry || userMessages.at(-1)?.content || "AI lead search";
    const buyerType = brief.buyerTypes?.[0] || brief.idealCustomerProfile || "Ideal customers";

    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        packId,
        region: market,
        productCategory,
        buyerType,
        notes: messages
          .filter((item) => item.type === "text")
          .map((item) => `${item.role}: ${item.content || ""}`)
          .join("\n"),
        exportFormat: "all",
        preflight: brief,
        advanced: {
          allowNoEmail,
          allowWeakBuyerEvidence: true,
          minScore,
        },
      }),
    });

    const payload = await response.json();
    setSubmitting(false);
    if (!response.ok) return;

    const selectedPack = leadPacks.find((pack) => pack.id === packId);
    const runConfig: RunConfigSnapshot = {
      packId,
      leadCount: selectedPack?.leads ?? 0,
      market,
      minScore,
      allowNoEmail,
    };
    setLocalStartedConfig(runConfig);
    if (payload.job?.id) onJobStarted(payload.job.id, runConfig);
  }

  if (localStartedConfig) {
    return (
      <div className="ide-panel space-y-2 border-[#10a3a3] bg-[#33dfdf] px-3 py-3 text-sm text-black">
        <p className="font-semibold">Job started with this brief config:</p>
        <p className="text-xs uppercase tracking-[0.14em] text-black/70">
          {localStartedConfig.leadCount} leads • {localStartedConfig.market} • min score {localStartedConfig.minScore}
        </p>
        <p className="text-xs text-black/70">
          Missing email allowed: {localStartedConfig.allowNoEmail ? "yes" : "no"}
        </p>
      </div>
    );
  }

  return (
    <div className="ide-panel space-y-4 p-4">
      <div className="flex items-center gap-2 text-[#00ff00]">
        <CheckCircle2 size={18} />
        <h3 className="font-semibold">Brief ready to run</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Markets</p>
          <p className="mt-1 text-sm text-vercel-text">{brief.targetMarkets?.join(", ") || market}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Search Terms</p>
          <p className="mt-1 text-sm text-vercel-text">{brief.searchTerms?.slice(0, 3).join(" | ") || "N/A"}</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-[#30363d] pt-4">
        <div className="grid grid-cols-3 gap-2">
          {leadPacks.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setPackId(pack.id)}
              className={`ide-btn px-2 py-2 text-xs transition ${
                pack.id === packId ? "ide-btn-primary" : "text-vercel-muted hover:text-white"
              }`}
            >
              {pack.leads} leads
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex max-w-[240px] flex-col gap-1 text-xs text-vercel-text">
            <span className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Min Quality Score: {minScore}</span>
            <input type="range" min="35" max="85" value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} className="w-full accent-[#00ffff]" />
          </label>
          <label className="flex items-center gap-2 text-xs text-vercel-text">
            <input type="checkbox" checked={allowNoEmail} onChange={(event) => setAllowNoEmail(event.target.checked)} className="border border-[#30363d] bg-[#010409]" />
            Allow missing emails
          </label>
        </div>
      </div>

      <button
        onClick={createJob}
        disabled={submitting}
        className="ide-btn ide-btn-primary inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        Run this search
      </button>
    </div>
  );
}

function OutreachLauncherWidget({
  prefill,
  supabase,
}: {
  prefill?: Record<string, string>;
  supabase: ReturnType<typeof createBrowserSupabase> | null;
}) {
  const [businessPlan, setBusinessPlan] = useState(prefill?.business_plan || "");
  const [offer, setOffer] = useState("");
  const [targetBuyer, setTargetBuyer] = useState(prefill?.target_buyer || "");
  const [tone, setTone] = useState("professional");
  const [cta, setCta] = useState("Reply if this is relevant and I can send details.");
  const [signature, setSignature] = useState("Best,\nExportFlow");
  const [senderName, setSenderName] = useState("ExportFlow");
  const [senderEmail, setSenderEmail] = useState("");
  const [pastedLeads, setPastedLeads] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function createCampaign() {
    if (!supabase) return;
    const leads = pastedLeads.trim() ? parsePastedLeads(pastedLeads) : [];
    if (leads.length === 0) {
      setMessage("Add at least one lead (paste emails below).");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setMessage("Sign in first.");
        setLoading(false);
        return;
      }
      const response = await fetch("/api/outreach/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          business_plan: businessPlan,
          offer,
          target_buyer: targetBuyer,
          tone,
          cta,
          signature,
          sender_name: senderName,
          sender_email: senderEmail,
          leads,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create campaign.");
      setMessage("Campaign created! Open the Outreach tab to generate templates and send.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create campaign.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ide-panel space-y-3 p-4">
      <div className="flex items-center gap-2 text-[#00ffff]">
        <Mail size={16} />
        <h3 className="font-semibold">Quick outreach campaign</h3>
      </div>
      {message && <p className="text-xs text-amber-300">{message}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block space-y-1 text-xs text-[#8b949e]">
          <span>Business plan</span>
          <input className="ide-input h-9 w-full px-2 text-sm" value={businessPlan} onChange={(e) => setBusinessPlan(e.target.value)} placeholder="What you do" />
        </label>
        <label className="block space-y-1 text-xs text-[#8b949e]">
          <span>Offer</span>
          <input className="ide-input h-9 w-full px-2 text-sm" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Your offer" />
        </label>
        <label className="block space-y-1 text-xs text-[#8b949e]">
          <span>Target buyer</span>
          <input className="ide-input h-9 w-full px-2 text-sm" value={targetBuyer} onChange={(e) => setTargetBuyer(e.target.value)} placeholder="Who to reach" />
        </label>
        <label className="block space-y-1 text-xs text-[#8b949e]">
          <span>Tone</span>
          <select className="ide-input h-9 w-full px-2 text-sm" value={tone} onChange={(e) => setTone(e.target.value)}>
            {["professional", "direct", "warm", "premium", "bold", "convincing"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-xs text-[#8b949e]">
        <span>Pasted leads (name, company, email, website — one per line)</span>
        <textarea
          className="ide-input h-24 w-full resize-none px-2 py-2 font-mono text-xs"
          value={pastedLeads}
          onChange={(e) => setPastedLeads(e.target.value)}
          placeholder="Acme Textiles, Sarah Khan, sarah@example.com, https://example.com"
        />
      </label>
      <button
        type="button"
        onClick={() => void createCampaign()}
        disabled={loading}
        className="ide-btn ide-btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Create campaign
      </button>
    </div>
  );
}
