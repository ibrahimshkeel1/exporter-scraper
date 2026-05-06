"use client";

import { Plus } from "lucide-react";
import { AuthPanel } from "./AuthPanel";

type LeftSidebarProps = {
  mode: "dashboard" | "outreach" | "admin";
};

export function LeftSidebar({ mode }: LeftSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      <div className="mb-2 border border-[#30363d] bg-[#010409] px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-[#8b949e]">
        Explorer
      </div>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new Event("exportflow:new-chat"));
        }}
        className="ide-btn ide-btn-primary mx-2 mb-3 inline-flex h-9 items-center justify-center gap-2 px-2 text-xs"
      >
        <Plus size={14} />
        New Search
      </button>
      <div className="ide-panel mx-2 min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-1 font-mono text-xs">
          <p className="text-[#8b949e]">workspace</p>
          <p className="text-[#8b949e]">- frontend/</p>
          <p className={`${mode === "dashboard" ? "text-[#00ffff]" : "text-[#c9d1d9]"}`}>  - agentic-lead-search.tsx</p>
          <p className={`${mode === "outreach" ? "text-[#00ffff]" : "text-[#c9d1d9]"}`}>  - outreach-funnel.tsx</p>
          <p className={`${mode === "admin" ? "text-[#00ffff]" : "text-[#c9d1d9]"}`}>  - operator-console.tsx</p>
          <p className="text-[#8b949e]">- exports/</p>
          <p className="text-[#8b949e]">  - *_leads.csv</p>
          <p className="text-[#8b949e]">  - *_audit.xlsx</p>
          <p className="text-[#8b949e]">- events/</p>
          <p className="text-[#8b949e]">  - stdout.log</p>
          <p className="text-[#8b949e]">  - report.json</p>
        </div>
      </div>
      <div className="mt-2 px-2 pb-2">
        <AuthPanel compact />
      </div>
    </div>
  );
}
