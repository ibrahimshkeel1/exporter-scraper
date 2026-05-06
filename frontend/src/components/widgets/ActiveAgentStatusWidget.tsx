"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, Globe, Search } from "lucide-react";

const MOCK_AGENTS = [
  { id: "agent-1", name: "Bing Scraper", status: "running", progress: 67, eta: "2m 14s", lanes: ["USA-Apparel", "UK-Textile"] },
  { id: "agent-2", name: "Yahoo Discovery", status: "running", progress: 42, eta: "4m 31s", lanes: ["EU-Furniture"] },
  { id: "agent-3", name: "Google Maps", status: "idle", progress: 0, eta: "—", lanes: [] },
  { id: "agent-4", name: "LinkedIn Enrich", status: "failed", progress: 12, eta: "Stopped", lanes: ["USA-Tech"] },
  { id: "agent-5", name: "Apollo.io", status: "running", progress: 89, eta: "45s", lanes: ["Global-SaaS"] },
];

export function ActiveAgentStatusWidget() {
  const runningCount = useMemo(() => MOCK_AGENTS.filter((a) => a.status === "running").length, []);
  const failedCount = useMemo(() => MOCK_AGENTS.filter((a) => a.status === "failed").length, []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff00] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00ff00]" />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#00ff00]">LIVE</span>
        </div>
        <span className="text-[11px] text-vercel-muted">{runningCount} running</span>
        {failedCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-[#ff6b6b]">
            <AlertTriangle size={10} />
            {failedCount} failed
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {MOCK_AGENTS.map((agent) => (
          <div
            key={agent.id}
            className="border border-[#30363d] bg-[#0d1117] p-2.5 transition-colors hover:border-[#30363d]/80"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {agent.status === "running" && <Activity size={12} className="text-[#00ffff]" />}
                {agent.status === "idle" && <Clock size={12} className="text-[#8b949e]" />}
                {agent.status === "failed" && <AlertTriangle size={12} className="text-[#ff6b6b]" />}
                <span className="text-xs font-medium text-vercel-text">{agent.name}</span>
              </div>
              <span
                className={`text-[10px] font-mono uppercase ${
                  agent.status === "running"
                    ? "text-[#00ff00]"
                    : agent.status === "failed"
                    ? "text-[#ff6b6b]"
                    : "text-[#8b949e]"
                }`}
              >
                {agent.status}
              </span>
            </div>

            {agent.status === "running" && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-vercel-muted mb-1">
                  <span>{agent.progress}%</span>
                  <span className="font-mono">ETA {agent.eta}</span>
                </div>
                <div className="h-1.5 w-full bg-[#21262d]">
                  <div
                    className="h-full bg-[#00ffff] transition-all"
                    style={{ width: `${agent.progress}%` }}
                  />
                </div>
              </div>
            )}

            {agent.lanes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {agent.lanes.map((lane) => (
                  <span
                    key={lane}
                    className="inline-flex items-center gap-1 border border-[#30363d] bg-[#161b22] px-1.5 py-0.5 text-[9px] text-vercel-muted"
                  >
                    <Search size={8} />
                    {lane}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
