"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

const STATS = [
  { label: "Leads Today", value: 234, change: 12, changeType: "up" as const, color: "#00ffff" },
  { label: "Jobs Run", value: 8, change: -2, changeType: "down" as const, color: "#00ff00" },
  { label: "Success Rate", value: "91.2%", change: 3.4, changeType: "up" as const, color: "#7fff00" },
  { label: "Avg Score", value: 84, change: -1, changeType: "down" as const, color: "#ff9f43" },
];

export function DailyStatsWidget() {
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="grid grid-cols-2 gap-2">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col justify-between border border-[#30363d] bg-[#0d1117] p-2.5"
          >
            <span className="text-[10px] uppercase tracking-wider text-vercel-muted">{stat.label}</span>
            <div className="mt-1 flex items-end justify-between">
              <span className="text-lg font-mono font-bold" style={{ color: stat.color }}>
                {stat.value}
              </span>
              <span
                className={`flex items-center gap-0.5 text-[10px] font-mono ${
                  stat.changeType === "up" ? "text-[#00ff00]" : "text-[#ff6b6b]"
                }`}
              >
                {stat.changeType === "up" && <TrendingUp size={10} />}
                {stat.changeType === "down" && <TrendingDown size={10} />}
                {stat.change > 0 ? "+" : ""}
                {stat.change}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
