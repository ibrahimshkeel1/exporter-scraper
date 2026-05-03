"use client";

import { X, Terminal, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { createBrowserSupabase } from "../lib/supabase-client";

export type JobEvent = {
  id?: string;
  type?: string;
  status?: string;
  message?: string;
  created_at?: string;
  [key: string]: any;
};

type JobLogViewerProps = {
  jobId: string;
  initialEvents: JobEvent[];
  onClose: () => void;
};

export function JobLogViewer({ jobId, initialEvents, onClose }: JobLogViewerProps) {
  const [events, setEvents] = useState<JobEvent[]>(initialEvents);
  const [terminalLogs, setTerminalLogs] = useState<{message: string, time: string}[]>([]);
  const [isLive, setIsLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createBrowserSupabase();

  // Combine and sort Supabase events
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );

  useEffect(() => {
    if (!jobId) return;

    // 1. Subscribe to Milestones via Supabase Realtime
    const channel = supabase
      .channel(`job-logs-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_events',
          filter: `job_id=eq.${jobId}`
        },
        (payload) => {
          const newEvent = payload.new as JobEvent;
          setEvents((current) => {
            if (current.some(e => e.id === newEvent.id)) return current;
            return [...current, newEvent];
          });
        }
      )
      .subscribe();

    // 2. Subscribe to Raw Terminal Noise via SSE
    // Use worker.cristalinawater.com or similar if set, otherwise fallback to a default
    // We assume the user has configured Nginx to proxy /api/logs to the worker
    const rawWorkerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "https://worker.cristalinawater.com";
    const workerUrl = rawWorkerUrl.endsWith("/") ? rawWorkerUrl.slice(0, -1) : rawWorkerUrl;
    const sseUrl = `${workerUrl}/api/logs/${jobId}`;
    
    let eventSource: EventSource | null = null;
    
    const connectSSE = () => {
      if (eventSource) eventSource.close();
      
      eventSource = new EventSource(sseUrl);
      
      eventSource.onopen = () => {
        setIsLive(true);
        console.log("SSE connected to worker logs");
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message) {
            setTerminalLogs((prev) => [
              ...prev, 
              { 
                message: data.message, 
                time: new Date().toLocaleTimeString([], { hour12: false }) 
              }
            ]);
          }
        } catch (e) {
          console.error("Failed to parse SSE data", e);
        }
      };
      
      eventSource.onerror = (e) => {
        setIsLive(false);
        console.error("SSE error, reconnecting in 5s...", e);
        eventSource?.close();
        setTimeout(connectSSE, 5000);
      };
    };

    connectSSE();

    return () => {
      supabase.removeChannel(channel);
      if (eventSource) eventSource.close();
    };
  }, [jobId, supabase]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sortedEvents, terminalLogs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="bg-[#0a0a0a] border border-[#333] rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 bg-[#1a1a1a] border-b border-[#333]">
          <div className="flex space-x-2 w-24">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 focus:outline-none flex items-center justify-center group">
              <X size={8} className="text-black opacity-0 group-hover:opacity-100" />
            </button>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="flex-1 text-center text-[#888] text-xs font-mono font-medium select-none flex items-center justify-center gap-2">
            <Terminal size={12} />
            LIVE_LOGS: {jobId.slice(0, 8)}...
          </div>
          <div className="w-24 flex justify-end">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${isLive ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              <span className={`text-[10px] font-mono ${isLive ? "text-green-400" : "text-red-400"}`}>
                {isLive ? "LIVE" : "OFFLINE"}
              </span>
            </div>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          className="p-4 overflow-y-auto font-mono text-sm leading-relaxed flex-1 space-y-1 bg-black scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent"
        >
          {/* Historical / Milestone Events */}
          {sortedEvents.map((evt, idx) => {
            const isError = evt.status === "failed" || evt.type === "error";
            const isSuccess = evt.status === "delivered" || evt.type === "success";
            
            let colorClass = "text-white";
            if (isError) colorClass = "text-red-400";
            else if (isSuccess) colorClass = "text-green-400";
            else colorClass = "text-vercel-accent font-bold";

            const time = evt.created_at ? new Date(evt.created_at).toLocaleTimeString([], { hour12: false }) : "";

            return (
              <div key={evt.id || idx} className="flex gap-4 group border-l-2 border-white/5 pl-2 mb-2 bg-white/5 py-1 rounded">
                <span className="text-[#666] shrink-0 select-none">[{time}]</span>
                <span className={`${colorClass} whitespace-pre-wrap break-all uppercase text-[10px]`}>
                  [{evt.status || "EVENT"}] {evt.message}
                </span>
              </div>
            );
          })}

          {/* Real-time Terminal Logs */}
          {terminalLogs.map((log, idx) => (
            <div key={idx} className="flex gap-4 group">
              <span className="text-[#444] shrink-0 select-none">[{log.time}]</span>
              <span className="text-[#ccc] whitespace-pre-wrap break-all font-light">
                {log.message}
              </span>
            </div>
          ))}

          {terminalLogs.length === 0 && !isLive && (
            <div className="text-amber-500/80 animate-pulse py-2">
              Waiting for worker output...
            </div>
          )}
          
          <div className="text-[#666] animate-pulse">_</div>
        </div>

        <div className="px-4 py-2 bg-[#111] border-t border-[#333] text-[10px] text-[#555] flex justify-between">
          <span>SUPABASE_REALTIME: ENABLED</span>
          <span>WORKER_SSE: {isLive ? "ACTIVE" : "RECONNECTING"}</span>
        </div>
      </div>
    </div>
  );
}
