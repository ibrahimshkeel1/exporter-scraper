"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Terminal, X } from "lucide-react";
import { createBrowserSupabase } from "../lib/supabase-client";
import { laneFromPayload } from "../lib/log-lanes";
import { JobReportCard } from "./JobReportCard";

export type JobEvent = {
  id?: string;
  status?: string;
  message?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type JobLogViewerProps = {
  jobId: string;
  initialEvents: JobEvent[];
  onClose: () => void;
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
    return { source, status, message, engine, lane, proxyBefore, proxyAfter, reason };
  } catch {
    return { source: "worker", status: "terminal", message: event.data, engine: "", lane: "", proxyBefore: "", proxyAfter: "", reason: "" };
  }
}

type DiscoveryLane = "bing" | "duckduckgo" | "yahoo";

function workerLogFromJobEvent(event: JobEvent): WorkerLog | null {
  const metadata = event.metadata || {};
  const message =
    typeof metadata.message === "string"
      ? metadata.message
      : typeof event.message === "string"
      ? event.message
      : "";
  if (!message) return null;

  return {
    message,
    source: typeof metadata.source === "string" ? metadata.source : "worker",
    status: typeof metadata.status === "string" ? metadata.status : event.status || "terminal",
    time: event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour12: false }) : logTime(),
    engine: typeof metadata.engine === "string" ? metadata.engine : "",
    lane: typeof metadata.lane === "string" ? metadata.lane : "",
    proxyBefore: typeof metadata.proxy_before === "string" ? metadata.proxy_before : "",
    proxyAfter: typeof metadata.proxy_after === "string" ? metadata.proxy_after : "",
    reason: typeof metadata.reason === "string" ? metadata.reason : "",
  };
}

export function JobLogViewer({ jobId, initialEvents, onClose }: JobLogViewerProps) {
  const [events, setEvents] = useState<JobEvent[]>(initialEvents);
  const [discoveryLogs, setDiscoveryLogs] = useState<Record<DiscoveryLane, WorkerLog[]>>({
    bing: [],
    duckduckgo: [],
    yahoo: [],
  });
  const [enrichmentLogs, setEnrichmentLogs] = useState<WorkerLog[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "retrying">("connecting");
  const [copiedLane, setCopiedLane] = useState<"bing" | "duckduckgo" | "yahoo" | "enrichment" | null>(null);
  const [supabase] = useState(() => createBrowserSupabase());
  const discoveryBingRef = useRef<HTMLDivElement>(null);
  const discoveryDuckRef = useRef<HTMLDivElement>(null);
  const discoveryYahooRef = useRef<HTMLDivElement>(null);
  const enrichmentRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLDivElement>(null);

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const latestReportEvent = [...sortedEvents].reverse().find((event) => event.status === "report_ready");
  const latestReport = (latestReportEvent?.metadata?.report as any) || null;

  useEffect(() => {
    setEvents(initialEvents);
    const seededDiscoveryLogs: Record<DiscoveryLane, WorkerLog[]> = { bing: [], duckduckgo: [], yahoo: [] };
    const seededEnrichmentLogs: WorkerLog[] = [];
    for (const event of initialEvents) {
      const entry = workerLogFromJobEvent(event);
      if (!entry) continue;
      const lane = laneFromPayload(entry);
      if (lane === "enrichment") {
        seededEnrichmentLogs.push(entry);
      } else {
        seededDiscoveryLogs[lane].push(entry);
      }
    }
    setDiscoveryLogs(seededDiscoveryLogs);
    setEnrichmentLogs(seededEnrichmentLogs);
    setState("connecting");
  }, [jobId, initialEvents]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`job-logs-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_events",
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const nextEvent = payload.new as JobEvent;
          setEvents((current) => {
            if (current.some((event) => event.id === nextEvent.id)) return current;
            return [...current, nextEvent];
          });
        }
      )
      .subscribe();

    const sseUrl = `/api/jobs/${encodeURIComponent(jobId)}/logs`;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const appendLog = (entry: WorkerLog) => {
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
      appendLog({
        source: payload.source,
        status: payload.status,
        message: payload.message,
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
      supabase.removeChannel(channel);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [jobId, supabase]);

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

  useEffect(() => {
    if (eventRef.current) {
      eventRef.current.scrollTop = eventRef.current.scrollHeight;
    }
  }, [sortedEvents]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="ide-panel flex h-[90vh] w-full max-w-[84rem] flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-4 py-2">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-[#569cd6]">
            <Terminal size={13} />
            JOB {jobId.slice(0, 8)}... LIVE LOGS
          </div>
          <button
            onClick={onClose}
            className="ide-btn inline-flex h-8 w-8 items-center justify-center text-vercel-text"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 xl:grid-cols-3 xl:grid-rows-[minmax(18rem,1.2fr)_minmax(18rem,1fr)]">
          <section className="ide-terminal grid min-h-0 grid-cols-1 gap-2 overflow-hidden p-2 xl:col-span-3 xl:grid-cols-3 xl:row-span-1">
            {[
              { key: "bing", label: "DISCOVERY / BING", ref: discoveryBingRef },
              { key: "duckduckgo", label: "DISCOVERY / DUCKDUCKGO", ref: discoveryDuckRef },
              { key: "yahoo", label: "DISCOVERY / YAHOO", ref: discoveryYahooRef },
            ].map((laneRow) => (
              <div key={laneRow.key} className="flex min-h-0 flex-col overflow-hidden border border-[#3c3c3c] bg-[#1e1e1e]">
                <header className="flex items-center justify-between border-b border-[#3c3c3c] px-2 py-1.5 text-[10px] font-mono text-[#569cd6]">
                  <span>{laneRow.label}</span>
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
                </header>
                <div ref={laneRow.ref} className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-5 text-[#6a9955]">
                  {(discoveryLogs[laneRow.key as DiscoveryLane] || []).map((log, index) => (
                    <div key={`${laneRow.key}-${index}`} className="whitespace-pre-wrap break-words">
                      <span className="text-[#569cd6]">[{log.time}]</span> {log.message}
                      {log.proxyBefore && log.proxyAfter && (
                        <div className="text-[10px] text-[#569cd6]">
                          proxy rotated: {log.proxyBefore} → {log.proxyAfter}
                        </div>
                      )}
                    </div>
                  ))}
                  {(discoveryLogs[laneRow.key as DiscoveryLane] || []).length === 0 && (
                    <div className="text-[#858585]">Waiting for {laneRow.key} lane...</div>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className="ide-terminal flex min-h-0 flex-col overflow-hidden xl:col-span-2 xl:row-span-1">
            <header className="flex items-center justify-between border-b border-[#3c3c3c] px-3 py-1.5 text-[11px] font-mono text-[#569cd6]">
              <span>ENRICH / SCORE</span>
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
            </header>
            <div ref={enrichmentRef} className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-xs leading-5 text-[#6a9955]">
              {enrichmentLogs.map((log, index) => (
                <div key={`e-${index}`} className="whitespace-pre-wrap break-words">
                  <span className="text-[#569cd6]">[{log.time}]</span> {log.message}
                  {log.proxyBefore && log.proxyAfter && (
                    <div className="text-[11px] text-[#569cd6]">
                      proxy rotated: {log.proxyBefore} → {log.proxyAfter}
                    </div>
                  )}
                </div>
              ))}
              {enrichmentLogs.length === 0 && <div className="text-[#858585]">Waiting for enrichment lane...</div>}
            </div>
          </section>

          <section className="ide-terminal flex min-h-0 flex-col overflow-hidden xl:col-span-1 xl:row-span-1">
            <header className="border-b border-[#3c3c3c] bg-[#252526] px-3 py-2 text-[11px] font-mono text-[#858585]">MILESTONES</header>
            <div ref={eventRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 font-mono text-[11px] leading-5">
              {latestReport !== null && (
                <div className="mb-3 font-sans">
                  <JobReportCard report={latestReport} />
                </div>
              )}
              {sortedEvents.map((event, index) => (
                <div key={event.id || `event-${index}`} className="border border-[#3c3c3c] bg-[#1e1e1e] p-2">
                  <p className="text-[10px] uppercase text-[#569cd6]">{event.status || "event"}</p>
                  <p className="whitespace-pre-wrap text-vercel-text">{event.message || ""}</p>
                </div>
              ))}
              {sortedEvents.length === 0 && <div className="text-vercel-muted">No milestones yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
