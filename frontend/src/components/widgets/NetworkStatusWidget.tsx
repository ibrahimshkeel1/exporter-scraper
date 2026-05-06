"use client";

import { useEffect, useState } from "react";
import { Globe, Server } from "lucide-react";

const NODES = [
  { id: "us-east", name: "US-East", region: "Virginia", latency: 42, status: "online" as const },
  { id: "us-west", name: "US-West", region: "Oregon", latency: 78, status: "online" as const },
  { id: "eu-west", name: "EU-West", region: "Ireland", latency: 112, status: "online" as const },
  { id: "eu-central", name: "EU-Central", region: "Frankfurt", latency: 134, status: "degraded" as const },
  { id: "ap-south", name: "AP-South", region: "Mumbai", latency: 210, status: "online" as const },
  { id: "bing-api", name: "Bing API", region: "Global", latency: 89, status: "online" as const },
  { id: "gemini-api", name: "Gemini", region: "Global", latency: 156, status: "online" as const },
  { id: "n8n-webhook", name: "n8n Hook", region: "Global", latency: 34, status: "online" as const },
];

export function NetworkStatusWidget() {
  const [latencies, setLatencies] = useState(NODES);

  useEffect(() => {
    const interval = setInterval(() => {
      setLatencies((prev) =>
        prev.map((node) => ({
          ...node,
          latency: Math.max(10, node.latency + Math.floor(Math.random() * 20 - 10)),
        }))
      );
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center gap-2">
        <Globe size={12} className="text-[#00ffff]" />
        <span className="text-[11px] text-vercel-muted">{latencies.filter((n) => n.status === "online").length}/{latencies.length} nodes healthy</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {latencies.map((node) => (
          <div
            key={node.id}
            className="flex items-center justify-between border border-[#30363d] bg-[#0d1117] px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 ${
                  node.status === "online"
                    ? "bg-[#00ff00]"
                    : node.status === "degraded"
                    ? "bg-[#ff9f43]"
                    : "bg-[#ff6b6b]"
                }`}
              />
              <Server size={10} className="text-[#8b949e]" />
              <span className="text-[11px] text-vercel-text">{node.name}</span>
              <span className="text-[9px] text-vercel-muted">{node.region}</span>
            </div>
            <span
              className={`text-[10px] font-mono ${
                node.latency < 100
                  ? "text-[#00ff00]"
                  : node.latency < 200
                  ? "text-[#ff9f43]"
                  : "text-[#ff6b6b]"
              }`}
            >
              {node.latency}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
