"use client";

import { X } from "lucide-react";

export type JobEvent = {
  id?: string;
  type?: string;
  status?: string;
  message?: string;
  created_at?: string;
  [key: string]: any;
};

type JobLogViewerProps = {
  events: JobEvent[];
  onClose: () => void;
};

export function JobLogViewer({ events, onClose }: JobLogViewerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div 
        className="bg-[#0a0a0a] border border-[#333] rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]"
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
          <div className="flex-1 text-center text-[#888] text-xs font-sans font-medium select-none">
            Job Logs — Terminal
          </div>
          <div className="w-16"></div>
        </div>
        
        <div className="p-4 overflow-y-auto font-mono text-sm leading-relaxed flex-1 space-y-2 max-h-[60vh]">
          {events.length === 0 ? (
            <div className="text-[#666]">No logs available for this job.</div>
          ) : (
            [...events].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()).map((evt, idx) => {
              const isError = evt.status === "failed" || evt.type === "error" || evt.status === "error";
              const isSuccess = evt.status === "completed" || evt.status === "delivered" || evt.type === "success";
              
              let colorClass = "text-[#ccc]";
              if (isError) colorClass = "text-red-400";
              else if (isSuccess) colorClass = "text-green-400";

              const time = evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : "";
              const isTerminal = evt.type === "terminal" || evt.status === "terminal";

              return (
                <div key={evt.id || idx} className="flex gap-4 whitespace-pre-wrap">
                  <span className="text-[#666] shrink-0">[{time}]</span>
                  <span className={colorClass}>
                    {!isTerminal && <span className="font-semibold">[{evt.type || evt.status || "info"}] </span>}
                    {evt.message || JSON.stringify(evt)}
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
