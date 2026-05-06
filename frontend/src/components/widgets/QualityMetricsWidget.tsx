"use client";

import { useMemo } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const RADAR_DATA = [
  { metric: "Avg Score", value: 82, fullMark: 100 },
  { metric: "Completion", value: 94, fullMark: 100 },
  { metric: "Freshness", value: 76, fullMark: 100 },
  { metric: "Relevance", value: 88, fullMark: 100 },
  { metric: "Enrichment", value: 71, fullMark: 100 },
  { metric: "Validation", value: 91, fullMark: 100 },
];

const FALLBACK_DATA = [
  { name: "AI Context", value: 78, color: "#00ffff" },
  { name: "Fallback", value: 22, color: "#ff6b6b" },
];

export function QualityMetricsWidget() {
  const avgScore = useMemo(() => Math.round(RADAR_DATA.reduce((a, b) => a + b.value, 0) / RADAR_DATA.length), []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 border border-[#30363d] bg-[#0d1117] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">Avg Score</span>
          <span className="text-sm font-mono font-bold text-[#00ff00]">{avgScore}</span>
        </div>
        <div className="flex items-center gap-2 border border-[#30363d] bg-[#0d1117] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">Fallback</span>
          <span className="text-sm font-mono font-bold text-[#ff6b6b]">22%</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-2 gap-2">
        <div className="min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={RADAR_DATA} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <PolarGrid stroke="#30363d" />
              <PolarAngleAxis 
                dataKey="metric" 
                tick={{ fill: "#8b949e", fontSize: 9, fontFamily: "monospace" }} 
              />
              <PolarRadiusAxis 
                angle={90} 
                domain={[0, 100]} 
                tick={false} 
                axisLine={false} 
              />
              <Radar
                name="Quality"
                dataKey="value"
                stroke="#00ffff"
                strokeWidth={1.5}
                fill="#00ffff"
                fillOpacity={0.15}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="min-h-0 flex flex-col items-center justify-center">
          <ResponsiveContainer width="100%" height="80%">
            <PieChart>
              <Pie
                data={FALLBACK_DATA}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {FALLBACK_DATA.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex gap-2">
            {FALLBACK_DATA.map((d) => (
              <span key={d.name} className="flex items-center gap-1 text-[9px] text-vercel-muted">
                <span className="h-1.5 w-1.5" style={{ background: d.color }} />
                {d.name} {d.value}%
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
