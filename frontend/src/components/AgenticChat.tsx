"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, Check, Copy, Download, Loader2, Send, Sparkles, Terminal, UserRound } from "lucide-react";
import { leadPacks } from "../lib/pricing";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { TargetingPreflight } from "../lib/types";
import { JobReportCard } from "./JobReportCard";

export type AgenticMessage = {
  id: string;
  role: "assistant" | "user";
  type: "text" | "config" | "terminal" | "report";
  content?: string;
  payload?: any;
  created_at: string;
};

type AgenticChatProps = {
  onJobCreated?: () => void;
};

type WorkerLog = {
  message: string;
  source: string;
  status: string;
  time: string;
  engine?: string;
  lane?: string;
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
    return { message, source, status, engine, lane };
  } catch {
    return { message: event.data, source: "worker", status: "terminal", engine: "", lane: "" };
  }
}

type DiscoveryLane = "main" | "bing" | "duckduckgo" | "yahoo";

function discoveryLaneForPayload(payload: { source: string; lane?: string; engine?: string }) {
  if (payload.source === "enrichment" || payload.source === "scoring") return "enrichment";
  const lane = (payload.lane || "").toLowerCase();
  const engine = (payload.engine || "").toLowerCase();
  if (lane === "bing" || engine === "bing") return "bing";
  if (lane === "duckduckgo" || engine === "duckduckgo") return "duckduckgo";
  if (lane === "yahoo" || engine === "yahoo") return "yahoo";
  return "main";
}

function DualLiveTerminal({ jobId }: { jobId: string }) {
  const [discoveryLogs, setDiscoveryLogs] = useState<Record<DiscoveryLane, WorkerLog[]>>({
    main: [],
    bing: [],
    duckduckgo: [],
    yahoo: [],
  });
  const [enrichmentLogs, setEnrichmentLogs] = useState<WorkerLog[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "retrying">("connecting");
  const [copiedLane, setCopiedLane] = useState<"main" | "bing" | "duckduckgo" | "yahoo" | "enrichment" | null>(null);
  const discoveryMainRef = useRef<HTMLDivElement>(null);
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

    setDiscoveryLogs({ main: [], bing: [], duckduckgo: [], yahoo: [] });
    setEnrichmentLogs([]);
    setState("connecting");

    const pushLog = (entry: WorkerLog) => {
      if (!entry.message) return;
      const lane = discoveryLaneForPayload(entry);
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
    if (discoveryMainRef.current) discoveryMainRef.current.scrollTop = discoveryMainRef.current.scrollHeight;
    if (discoveryBingRef.current) discoveryBingRef.current.scrollTop = discoveryBingRef.current.scrollHeight;
    if (discoveryDuckRef.current) discoveryDuckRef.current.scrollTop = discoveryDuckRef.current.scrollHeight;
    if (discoveryYahooRef.current) discoveryYahooRef.current.scrollTop = discoveryYahooRef.current.scrollHeight;
  }, [discoveryLogs]);

  useEffect(() => {
    if (enrichmentRef.current) {
      enrichmentRef.current.scrollTop = enrichmentRef.current.scrollHeight;
    }
  }, [enrichmentLogs]);

  async function copyLaneLogs(lane: "main" | "bing" | "duckduckgo" | "yahoo" | "enrichment") {
    const logs = lane === "enrichment" ? enrichmentLogs : discoveryLogs[lane];
    if (logs.length === 0 || typeof navigator === "undefined" || !navigator.clipboard) return;
    const text = logs.map((log) => `[${log.time}] [${log.source}] ${log.message}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedLane(lane);
    setTimeout(() => setCopiedLane((current) => (current === lane ? null : current)), 1200);
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
      <section className="grid h-[22rem] min-h-0 grid-cols-1 gap-2 overflow-hidden rounded-xl border border-cyan-500/30 bg-black p-2">
        {[
          { key: "main", label: "DISCOVERY / MAIN", ref: discoveryMainRef },
          { key: "bing", label: "DISCOVERY / BING", ref: discoveryBingRef },
          { key: "duckduckgo", label: "DISCOVERY / DUCKDUCKGO", ref: discoveryDuckRef },
          { key: "yahoo", label: "DISCOVERY / YAHOO", ref: discoveryYahooRef },
        ].map((laneRow) => (
          <div key={laneRow.key} className="flex min-h-0 flex-col overflow-hidden rounded border border-cyan-500/20">
            <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-500/10 px-2 py-1.5 text-[10px] font-mono text-cyan-200">
              <span className="inline-flex items-center gap-1.5">
                <Terminal size={11} />
                {laneRow.label}
              </span>
              <div className="inline-flex items-center gap-2">
                <span>{state.toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => void copyLaneLogs(laneRow.key as DiscoveryLane)}
                  className="inline-flex h-5 items-center gap-1 rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 text-[9px] hover:bg-cyan-500/20"
                >
                  {copiedLane === laneRow.key ? <Check size={10} /> : <Copy size={10} />}
                  Copy
                </button>
              </div>
            </div>
            <div ref={laneRow.ref} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-5 text-cyan-100/90">
              {(discoveryLogs[laneRow.key as DiscoveryLane] || []).map((log, index) => (
                <div key={`${laneRow.key}-${index}`} className="whitespace-pre-wrap break-words">
                  <span className="text-cyan-500/70">[{log.time}]</span> {log.message}
                </div>
              ))}
              {(discoveryLogs[laneRow.key as DiscoveryLane] || []).length === 0 && (
                <div className="text-cyan-300/60">Waiting for {laneRow.key} logs...</div>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="flex h-[22rem] min-h-0 flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-black">
        <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-mono text-emerald-200">
          <span className="inline-flex items-center gap-1.5">
            <Terminal size={12} />
            ENRICH / SCORE
          </span>
          <div className="inline-flex items-center gap-2">
              <span>{state.toUpperCase()}</span>
              <button
                type="button"
                onClick={() => void copyLaneLogs("enrichment")}
              className="inline-flex h-6 items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-2 text-[10px] hover:bg-emerald-500/20"
            >
              {copiedLane === "enrichment" ? <Check size={11} /> : <Copy size={11} />}
              Copy
            </button>
          </div>
        </div>
        <div ref={enrichmentRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 text-emerald-100/90">
          {enrichmentLogs.map((log, index) => (
            <div key={`e-${index}`} className="whitespace-pre-wrap break-words">
              <span className="text-emerald-500/70">[{log.time}]</span> {log.message}
            </div>
          ))}
          {enrichmentLogs.length === 0 && <div className="text-emerald-300/60">Waiting for enrichment logs...</div>}
        </div>
      </section>
    </div>
  );
}

function ReportDownloads({
  jobId,
  supabase,
}: {
  jobId: string;
  supabase: ReturnType<typeof createBrowserSupabase> | null;
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openExport("csv")}
          disabled={downloadingFormat !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <Download size={14} />
          Leads CSV
        </button>
        <button
          type="button"
          onClick={() => void openExport("xlsx")}
          disabled={downloadingFormat !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-vercel-text hover:bg-white/10 disabled:opacity-50"
        >
          <Download size={14} />
          Audit XLSX
        </button>
      </div>
      {downloadError && <p className="text-xs text-amber-300">{downloadError}</p>}
    </div>
  );
}

export function AgenticChat({ onJobCreated }: AgenticChatProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [messages, setMessages] = useState<AgenticMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!supabase || messages.length === 0) return;
    const runningJobs = messages.filter((item) => item.type === "terminal").map((item) => String(item.payload?.jobId || ""));
    if (runningJobs.length === 0) return;

    const channel = supabase
      .channel("chat-job-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_events" }, (payload) => {
        const evt = payload.new as { status: string; job_id: string; metadata?: Record<string, unknown> };
        if (!runningJobs.includes(evt.job_id)) return;
        if (evt.status !== "report_ready" && evt.status !== "delivered" && evt.status !== "failed") return;

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
          return [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              type: "text",
              content: `Job ${evt.status}. Check dashboard downloads for outputs.`,
              created_at: new Date().toISOString(),
            },
          ];
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, messages]);

  async function analyzeConversation(nextMessages: AgenticMessage[]) {
    setIsThinking(true);
    try {
      const lastJobArtifactIndex = nextMessages.reduce((lastIndex, message, index) => {
        return ["config", "terminal", "report"].includes(message.type) ? index : lastIndex;
      }, -1);
      const activeThread = nextMessages.slice(lastJobArtifactIndex + 1);
      const conversation = activeThread
        .filter((message) => message.type === "text")
        .map((message) => ({ role: message.role, content: message.content || "" }));
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

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-[#090d12] shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">Agentic Lead Search</p>
          <h2 className="text-lg font-semibold text-vercel-text">Live discovery + enrichment workspace</h2>
        </div>
        <span className="text-xs text-vercel-muted">{sessionLoaded ? "Session synced" : "Loading session..."}</span>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            {message.role === "assistant" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <Bot size={16} />
              </div>
            )}
            <div className={message.role === "user" ? "max-w-[78%]" : "w-full max-w-5xl"}>
              {message.type === "text" && (
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-white text-black"
                      : "border border-white/10 bg-black/40 text-vercel-text"
                  }`}
                >
                  {message.content}
                </div>
              )}

              {message.type === "config" && Boolean(message.payload?.brief) && (
                <ConfigWidget
                  brief={message.payload.brief as TargetingPreflight}
                  messages={messages}
                  supabase={supabase}
                  onJobStarted={(jobId) => {
                    setMessages((current) => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        type: "terminal",
                        payload: { jobId },
                        created_at: new Date().toISOString(),
                      },
                    ]);
                    onJobCreated?.();
                  }}
                />
              )}

              {message.type === "terminal" && typeof message.payload?.jobId === "string" && (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <p className="text-xs text-vercel-muted">Live worker logs for `{message.payload.jobId.slice(0, 8)}...`</p>
                  <DualLiveTerminal jobId={message.payload.jobId} />
                </div>
              )}

              {message.type === "report" && Boolean(message.payload?.report) && (
                <div className="space-y-3">
                  <JobReportCard report={message.payload.report as any} />
                  <ReportDownloads jobId={String(message.payload.jobId)} supabase={supabase} />
                </div>
              )}
            </div>
            {message.role === "user" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white">
                <UserRound size={16} />
              </div>
            )}
          </div>
        ))}

        {isThinking && (
          <div className="flex gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
              <Bot size={16} />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-cyan-100">
              <Loader2 size={15} className="animate-spin" />
              Analyzing request...
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 bg-black/35 px-4 py-4 sm:px-6">
        <form className="mx-auto flex max-w-5xl gap-3" onSubmit={appendUserMessage}>
          <textarea
            className="h-14 flex-1 resize-none rounded-xl border border-white/10 bg-[#121920] px-4 py-3 text-sm text-vercel-text outline-none transition focus:border-cyan-300/40"
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
            className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-white text-black transition hover:bg-cyan-100 disabled:opacity-50"
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
  supabase,
  onJobStarted,
}: {
  brief: TargetingPreflight;
  messages: AgenticMessage[];
  supabase: ReturnType<typeof createBrowserSupabase> | null;
  onJobStarted: (id: string) => void;
}) {
  const [packId, setPackId] = useState("starter");
  const [market, setMarket] = useState(normalizeRegion(brief.targetMarkets?.[0] || "International"));
  const [minScore, setMinScore] = useState(brief.recommendedMinScore ? Math.max(35, Math.min(85, brief.recommendedMinScore)) : 55);
  const [allowNoEmail, setAllowNoEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

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

    setHasStarted(true);
    if (payload.job?.id) onJobStarted(payload.job.id);
  }

  if (hasStarted) {
    return <div className="text-sm text-vercel-muted">Job request sent. Streaming will appear below.</div>;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
      <div className="flex items-center gap-2 text-emerald-300">
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

      <div className="space-y-4 border-t border-white/10 pt-4">
        <div className="grid grid-cols-3 gap-2">
          {leadPacks.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setPackId(pack.id)}
              className={`rounded-lg px-2 py-2 text-xs transition ${
                pack.id === packId ? "bg-white text-black" : "border border-white/10 bg-black/40 text-vercel-muted hover:text-white"
              }`}
            >
              {pack.leads} leads
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex max-w-[240px] flex-col gap-1 text-xs text-vercel-text">
            <span className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Min Quality Score: {minScore}</span>
            <input type="range" min="35" max="85" value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} className="w-full accent-cyan-300" />
          </label>
          <label className="flex items-center gap-2 text-xs text-vercel-text">
            <input type="checkbox" checked={allowNoEmail} onChange={(event) => setAllowNoEmail(event.target.checked)} className="rounded border-white/20" />
            Allow missing emails
          </label>
        </div>
      </div>

      <button
        onClick={createJob}
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:opacity-50"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        Run this search
      </button>
    </div>
  );
}
