"use client";

import { useMemo } from "react";
import {
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { auditRowsForJob, DashboardSnapshot, hasReport, leadRowsForJob } from "./dashboard-data";

type QualityMetricsWidgetProps = {
  snapshot: DashboardSnapshot;
};

export function QualityMetricsWidget({ snapshot }: QualityMetricsWidgetProps) {
  const metrics = useMemo(() => {
    const jobs = snapshot.jobs;
    const finalJobs = jobs.filter((job) => job.status === "delivered" || job.status === "failed");
    const deliveredJobs = jobs.filter((job) => job.status === "delivered");

    const avgScore =
      deliveredJobs.length > 0
        ? deliveredJobs.reduce((sum, job) => sum + Number(job.min_score || 0), 0) / deliveredJobs.length
        : 0;
    const completion = finalJobs.length > 0 ? (deliveredJobs.length / finalJobs.length) * 100 : 0;
    const freshness = jobs.length > 0
      ? (jobs.filter((job) => Date.now() - new Date(job.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length / jobs.length) * 100
      : 0;
    const relevance = deliveredJobs.length > 0
      ? deliveredJobs.reduce((sum, job) => sum + Math.min(100, Number(job.min_score || 0) + 8), 0) / deliveredJobs.length
      : 0;
    const enrichment = deliveredJobs.length > 0
      ? (deliveredJobs.filter((job) => auditRowsForJob(job) > 0 || leadRowsForJob(job) > 0).length / deliveredJobs.length) * 100
      : 0;
    const validation = jobs.length > 0
      ? (jobs.filter((job) => job.payment_status === "approved" || job.payment_status === "not_required").length / jobs.length) * 100
      : 0;
    const aiCoverage = jobs.length > 0 ? (jobs.filter((job) => hasReport(job)).length / jobs.length) * 100 : 0;
    const fallback = Math.max(0, 100 - aiCoverage);

    return {
      radar: [
        { metric: "Avg Score", value: Math.round(avgScore), fullMark: 100 },
        { metric: "Completion", value: Math.round(completion), fullMark: 100 },
        { metric: "Freshness", value: Math.round(freshness), fullMark: 100 },
        { metric: "Relevance", value: Math.round(relevance), fullMark: 100 },
        { metric: "Enrichment", value: Math.round(enrichment), fullMark: 100 },
        { metric: "Validation", value: Math.round(validation), fullMark: 100 },
      ],
      pie: [
        { name: "AI Reported", value: Math.round(aiCoverage), color: "#569cd6" },
        { name: "No Report", value: Math.round(fallback), color: "#ff6b6b" },
      ],
      avgScore: Math.round(avgScore),
      fallback: Math.round(fallback),
    };
  }, [snapshot.jobs]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">Avg Score</span>
          <span className="text-sm font-mono font-bold text-[#6a9955]">{metrics.avgScore}</span>
        </div>
        <div className="flex items-center gap-2 border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">No Report</span>
          <span className="text-sm font-mono font-bold text-[#ff6b6b]">{metrics.fallback}%</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-2 gap-2">
        <div className="min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={metrics.radar} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <PolarGrid stroke="#3c3c3c" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#858585", fontSize: 9, fontFamily: "monospace" }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Quality" dataKey="value" stroke="#569cd6" strokeWidth={1.5} fill="#569cd6" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="min-h-0 flex flex-col items-center justify-center">
          <ResponsiveContainer width="100%" height="80%">
            <PieChart>
              <Pie
                data={metrics.pie}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {metrics.pie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex gap-2">
            {metrics.pie.map((d) => (
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
