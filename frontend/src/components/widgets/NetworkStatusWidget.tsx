"use client";

import { Globe, Server } from "lucide-react";
import { DashboardSnapshot } from "./dashboard-data";

type NetworkStatusWidgetProps = {
  snapshot: DashboardSnapshot;
};

function statusTone(status: "online" | "degraded" | "offline") {
  if (status === "online") return "bg-[#00ff00]";
  if (status === "degraded") return "bg-[#ff9f43]";
  return "bg-[#ff6b6b]";
}

function latencyTone(latency: number) {
  if (latency < 100) return "text-[#00ff00]";
  if (latency < 220) return "text-[#ff9f43]";
  return "text-[#ff6b6b]";
}

export function NetworkStatusWidget({ snapshot }: NetworkStatusWidgetProps) {
  const ageMs = snapshot.refreshedAt ? Date.now() - new Date(snapshot.refreshedAt).getTime() : Number.POSITIVE_INFINITY;
  const stale = ageMs > 45_000;
  const health = snapshot.error ? "degraded" : stale ? "degraded" : "online";
  const mockLatency = Math.min(450, Math.max(20, Math.round(ageMs / 12)));

  const nodes: Array<{
    id: string;
    name: string;
    region: string;
    latency: number;
    status: "online" | "degraded" | "offline";
  }> = [
    {
      id: "jobs-api",
      name: "Jobs API",
      region: "App",
      latency: mockLatency,
      status: snapshot.error ? "degraded" : "online" as const,
    },
    {
      id: "outreach-api",
      name: "Outreach API",
      region: "App",
      latency: mockLatency + 14,
      status: snapshot.campaigns.length > 0 || !snapshot.error ? "online" as const : "degraded" as const,
    },
    {
      id: "sync-channel",
      name: "Supabase Sync",
      region: "DB",
      latency: mockLatency + 22,
      status: stale ? "degraded" as const : "online" as const,
    },
    {
      id: "worker-lanes",
      name: "Worker Lanes",
      region: "Runtime",
      latency: mockLatency + 33,
      status: snapshot.jobs.some((job) => job.status === "running") ? "online" as const : "degraded" as const,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center gap-2">
        <Globe size={12} className="text-[#00ffff]" />
        <span className="text-[11px] text-vercel-muted">
          {nodes.filter((node) => node.status === "online").length}/{nodes.length} nodes healthy
        </span>
        <span className={`ml-auto h-2 w-2 ${statusTone(health)} rounded-full`} />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="flex items-center justify-between border border-[#30363d] bg-[#0d1117] px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 ${statusTone(node.status)}`} />
              <Server size={10} className="text-[#8b949e]" />
              <span className="text-[11px] text-vercel-text">{node.name}</span>
              <span className="text-[9px] text-vercel-muted">{node.region}</span>
            </div>
            <span className={`text-[10px] font-mono ${latencyTone(node.latency)}`}>
              {node.latency}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
