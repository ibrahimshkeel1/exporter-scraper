"use client";

import { ReactNode } from "react";
import { X, SquareTerminal, Minus } from "lucide-react";

type BottomPanelProps = {
  children: ReactNode;
  onClose: () => void;
  jobId?: string | null;
  summary?: string;
};

export function BottomPanel({ children, onClose, jobId, summary }: BottomPanelProps) {
  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      {/* Panel header */}
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] px-3 py-1">
        <div className="inline-flex min-w-0 items-center gap-2">
          <SquareTerminal size={12} className="text-[#00ffff]" />
          <span className="text-[11px] font-mono uppercase tracking-[0.1em] text-[#8b949e]">
            Terminal
          </span>
          {jobId && (
            <span className="text-[10px] font-mono text-[#00ffff]">
              job:{jobId.slice(0, 8)}
            </span>
          )}
        </div>
        {summary && (
          <div className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-[#00ffff]" title={summary}>
            {summary}
          </div>
        )}
        <div className="inline-flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center text-[#8b949e] hover:text-[#00ffff]"
            title="Close Panel"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center text-[#8b949e] hover:text-[#ff6b6b]"
            title="Close Panel"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      {/* Panel content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
