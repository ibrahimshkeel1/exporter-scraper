"use client";

import { ReactNode } from "react";
import { X, SquareTerminal, Minus } from "lucide-react";

type BottomPanelProps = {
  children: ReactNode;
  onClose: () => void;
  jobId?: string | null;
};

export function BottomPanel({ children, onClose, jobId }: BottomPanelProps) {
  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-3 py-1">
        <div className="inline-flex items-center gap-2">
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
        <div className="inline-flex items-center gap-1">
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
