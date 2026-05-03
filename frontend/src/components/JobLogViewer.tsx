"use client";

import { X, Terminal } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createBrowserSupabase();

  // Sort events by time
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );

  useEffect(() => {
    if (!jobId) return;

    // Subscribe to new events for this job
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
            // Avoid duplicates
            if (current.some(e => e.id === newEvent.id)) return current;
            return [...current, newEvent];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, supabase]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="bg-[#0a0a0a] border border-[#333] rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 bg-[#1a1a1a] border-b border-[#333]">
          <div className="flex space-x-2 w-16">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 focus:outline-none flex items-center justify-center group">
              <X size={8} className="text-black opacity-0 group-hover:opacity-100" />
            </button>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="flex-1 text-center text-[#888] text-xs font-mono font-medium select-none flex items-center justify-center gap-2">
            <Terminal size={12} />
            JOB_ID: {jobId}
          </div>
          <div className="w-16 flex justify-end">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-400 font-mono">LIVE</span>
            </div>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          className="p-4 overflow-y-auto font-mono text-sm leading-relaxed flex-1 space-y-1 scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent"
        >
          {sortedEvents.length === 0 ? (
            <div className="text-[#666]">Connecting to stream...</div>
          ) : (
            sortedEvents.map((evt, idx) => {
              const isError = evt.status === "failed" || evt.type === "error" || evt.status === "error";
              const isSuccess = evt.status === "completed" || evt.status === "delivered" || evt.type === "success";
              const isTerminal = evt.type === "terminal" || evt.status === "terminal";
              
              let colorClass = "text-[#ccc]";
              if (isError) colorClass = "text-red-400";
              else if (isSuccess) colorClass = "text-green-400";
              else if (isTerminal) colorClass = "text-blue-300";

              const time = evt.created_at ? new Date(evt.created_at).toLocaleTimeString([], { hour12: false }) : "";

              return (
                <div key={evt.id || idx} className="flex gap-4 group">
                  <span className="text-[#444] shrink-0 select-none">[{time}]</span>
                  <span className={`${colorClass} whitespace-pre-wrap break-all`}>
                    {!isTerminal && <span className="font-bold uppercase opacity-80">[{evt.type || evt.status || "info"}] </span>}
                    {evt.message || JSON.stringify(evt.metadata || evt)}
                  </span>
                </div>
              );
            })
          )}
          <div className="text-[#666] animate-pulse">_</div>
        </div>
      </div>
    </div>
  );
}
