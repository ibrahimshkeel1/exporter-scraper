"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const FUNNEL_DATA = [
  { stage: "Searched", value: 12500, color: "#00ffff" },
  { stage: "Validated", value: 8430, color: "#00d4aa" },
  { stage: "Enriched", value: 6210, color: "#00ff00" },
  { stage: "Delivered", value: 4890, color: "#7fff00" },
];

export function LeadFunnelWidget() {
  const maxValue = Math.max(...FUNNEL_DATA.map((d) => d.value));
  const conversionRate = ((FUNNEL_DATA[3].value / FUNNEL_DATA[0].value) * 100).toFixed(1);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-vercel-muted">Last 7 days pipeline</span>
        <span className="text-[11px] font-mono text-[#00ff00]">
          {conversionRate}% conv.
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={FUNNEL_DATA} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="funnelGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ffff" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#00ffff" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="stage" 
              tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }} 
              axisLine={{ stroke: "#30363d" }}
              tickLine={false}
            />
            <YAxis 
              hide 
              domain={[0, maxValue * 1.1]} 
            />
            <Tooltip
              contentStyle={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "monospace",
                color: "#c9d1d9",
              }}
              itemStyle={{ color: "#00ffff" }}
              formatter={(value) => [typeof value === "number" ? value.toLocaleString() : String(value), "Leads"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#00ffff"
              strokeWidth={2}
              fill="url(#funnelGradient)"
              dot={{ r: 3, fill: "#00ffff", stroke: "#0d1117", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "#00ffff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {FUNNEL_DATA.map((item, idx) => {
          const prev = idx > 0 ? FUNNEL_DATA[idx - 1].value : item.value;
          const dropoff = idx > 0 ? ((1 - item.value / prev) * 100).toFixed(0) : null;
          return (
            <div key={item.stage} className="border border-[#30363d] bg-[#0d1117] p-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-vercel-muted">{item.stage}</div>
              <div className="mt-1 text-sm font-mono font-medium" style={{ color: item.color }}>
                {item.value.toLocaleString()}
              </div>
              {dropoff && (
                <div className="text-[9px] text-[#ff6b6b] font-mono">-{dropoff}%</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
