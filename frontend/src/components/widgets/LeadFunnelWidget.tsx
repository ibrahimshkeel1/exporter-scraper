"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { auditRowsForJob, DashboardSnapshot, leadRowsForJob } from "./dashboard-data";

type LeadFunnelWidgetProps = {
  snapshot: DashboardSnapshot;
};

export function LeadFunnelWidget({ snapshot }: LeadFunnelWidgetProps) {
  const data = useMemo(() => {
    const recentJobs = snapshot.jobs.filter((job) => {
      const created = new Date(job.created_at).getTime();
      return created >= Date.now() - 14 * 24 * 60 * 60 * 1000;
    });

    const searched = recentJobs.reduce((sum, job) => sum + Number(job.lead_limit || 0), 0);
    const queued = recentJobs
      .filter((job) => ["approved", "queued", "running", "delivered", "failed"].includes(job.status))
      .reduce((sum, job) => sum + Number(job.lead_limit || 0), 0);
    const enriched = recentJobs.reduce((sum, job) => sum + auditRowsForJob(job), 0);
    const delivered = recentJobs
      .filter((job) => job.status === "delivered")
      .reduce((sum, job) => sum + leadRowsForJob(job), 0);

    return [
      { stage: "Searched", value: searched, color: "#569cd6" },
      { stage: "Queued", value: queued, color: "#00d4aa" },
      { stage: "Enriched", value: enriched, color: "#6a9955" },
      { stage: "Delivered", value: delivered, color: "#7fff00" },
    ];
  }, [snapshot.jobs]);

  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const conversionRate = ((data[3].value / maxValue) * 100).toFixed(1);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-vercel-muted">Last 14 days pipeline</span>
        <span className="text-[11px] font-mono text-[#6a9955]">{conversionRate}% top-stage conv.</span>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="funnelGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#569cd6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#569cd6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="stage"
              tick={{ fill: "#858585", fontSize: 10, fontFamily: "monospace" }}
              axisLine={{ stroke: "#3c3c3c" }}
              tickLine={false}
            />
            <YAxis hide domain={[0, maxValue * 1.1]} />
            <Tooltip
              contentStyle={{
                background: "#252526",
                border: "1px solid #3c3c3c",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "monospace",
                color: "#d4d4d4",
              }}
              itemStyle={{ color: "#569cd6" }}
              formatter={(value) => [typeof value === "number" ? value.toLocaleString() : String(value), "Count"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#569cd6"
              strokeWidth={2}
              fill="url(#funnelGradient)"
              dot={{ r: 3, fill: "#569cd6", stroke: "#1e1e1e", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "#569cd6" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {data.map((item, idx) => {
          const prev = idx > 0 ? data[idx - 1].value : item.value;
          const dropoff = idx > 0 && prev > 0 ? ((1 - item.value / prev) * 100).toFixed(0) : null;
          return (
            <div key={item.stage} className="border border-[#3c3c3c] bg-[#1e1e1e] p-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-vercel-muted">{item.stage}</div>
              <div className="mt-1 text-sm font-mono font-medium" style={{ color: item.color }}>
                {item.value.toLocaleString()}
              </div>
              {dropoff && <div className="text-[9px] text-[#ff6b6b] font-mono">-{dropoff}%</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
