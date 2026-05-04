"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal, X } from "lucide-react";
import { createBrowserSupabase } from "../lib/supabase-client";
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
    return { source, status, message };
  } catch {
    return { source: "worker", status: "terminal", message: event.data };
  }
}

function laneForSource(source: string) {
  return source === "enrichment" || source === "scoring" ? "enrichment" : "discovery";
}

export function JobLogViewer({ jobId, initialEvents, onClose }: JobLogViewerProps) {
  const [events, setEvents] = useState<JobEvent[]>(initialEvents);
  const [discoveryLogs, setDiscoveryLogs] = useState<WorkerLog[]>([]);
  const [enrichmentLogs, setEnrichmentLogs] = useState<WorkerLog[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "retrying">("connecting");
  const [supabase] = useState(() => createBrowserSupabase());
  const discoveryRef = useRef<HTMLDivElement>(null);
  const enrichmentRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLDivElement>(null);

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const latestReportEvent = [...sortedEvents].reverse().find((event) => event.status === "report_ready");
  const latestReport = (latestReportEvent?.metadata?.report as any) || null;

  useEffect(() => {
    setEvents(initialEvents);
    setDiscoveryLogs([]);
    setEnrichmentLogs([]);
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
      const lane = laneForSource(entry.source);
      if (lane === "enrichment") {
        setEnrichmentLogs((current) => [...current, entry]);
      } else {
        setDiscoveryLogs((current) => [...current, entry]);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const payload = parseWorkerPayload(event);
      appendLog({
        source: payload.source,
        status: payload.status,
        message: payload.message,
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
      supabase.removeChannel(channel);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [jobId, supabase]);

  useEffect(() => {
    if (discoveryRef.current) {
      discoveryRef.current.scrollTop = discoveryRef.current.scrollHeight;
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#080b11] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-black/35 px-4 py-3">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-200">
            <Terminal size={13} />
            JOB {jobId.slice(0, 8)}... LIVE LOGS
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-vercel-text hover:bg-white/10"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 xl:grid-cols-[1.05fr_1.05fr_0.9fr]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-cyan-500/30 bg-black">
            <header className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-mono text-cyan-200">
              <span>DISCOVERY / MAIN</span>
              <span>{state.toUpperCase()}</span>
            </header>
            <div ref={discoveryRef} className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 text-cyan-100/90">
              {discoveryLogs.map((log, index) => (
                <div key={`d-${index}`} className="whitespace-pre-wrap break-words">
                  <span className="text-cyan-500/70">[{log.time}]</span> {log.message}
                </div>
              ))}
              {discoveryLogs.length === 0 && <div className="text-cyan-300/60">Waiting for discovery lane...</div>}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-emerald-500/30 bg-black">
            <header className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-mono text-emerald-200">
              <span>ENRICH / SCORE</span>
              <span>{state.toUpperCase()}</span>
            </header>
            <div ref={enrichmentRef} className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 text-emerald-100/90">
              {enrichmentLogs.map((log, index) => (
                <div key={`e-${index}`} className="whitespace-pre-wrap break-words">
                  <span className="text-emerald-500/70">[{log.time}]</span> {log.message}
                </div>
              ))}
              {enrichmentLogs.length === 0 && <div className="text-emerald-300/60">Waiting for enrichment lane...</div>}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/20">
            <header className="border-b border-white/10 bg-white/5 px-3 py-2 text-[11px] font-mono text-vercel-muted">MILESTONES</header>
            <div ref={eventRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 font-mono text-[11px] leading-5">
              {latestReport !== null && (
                <div className="mb-3 font-sans">
                  <JobReportCard report={latestReport} />
                </div>
              )}
              {sortedEvents.map((event, index) => (
                <div key={event.id || `event-${index}`} className="rounded-md border border-white/10 bg-black/35 p-2">
                  <p className="text-[10px] uppercase text-cyan-300/70">{event.status || "event"}</p>
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
