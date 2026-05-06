"use client";

import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { DashboardSnapshot, leadRowsForJob } from "./dashboard-data";

type DailyStatsWidgetProps = {
  snapshot: DashboardSnapshot;
};

function dayBounds(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function percentChange(current: number, previous: number) {
  if (previous <= 0 && current <= 0) return 0;
  if (previous <= 0) return 100;
  return ((current - previous) / previous) * 100;
}

export function DailyStatsWidget({ snapshot }: DailyStatsWidgetProps) {
  const metrics = useMemo(() => {
    const todayStart = dayBounds(0);
    const yesterdayStart = dayBounds(-1);
    const weekStart = dayBounds(-6);
    const previousWeekStart = dayBounds(-13);
    const previousWeekEnd = dayBounds(-7);

    const todayJobs = snapshot.jobs.filter((job) => new Date(job.created_at) >= todayStart);
    const yesterdayJobs = snapshot.jobs.filter((job) => {
      const created = new Date(job.created_at);
      return created >= yesterdayStart && created < todayStart;
    });

    const thisWeek = snapshot.jobs.filter((job) => new Date(job.created_at) >= weekStart);
    const previousWeek = snapshot.jobs.filter((job) => {
      const created = new Date(job.created_at);
      return created >= previousWeekStart && created < previousWeekEnd;
    });

    const leadsToday = todayJobs.reduce((sum, job) => sum + leadRowsForJob(job), 0);
    const leadsYesterday = yesterdayJobs.reduce((sum, job) => sum + leadRowsForJob(job), 0);

    const weekOutcomes = thisWeek.filter((job) => job.status === "delivered" || job.status === "failed");
    const previousWeekOutcomes = previousWeek.filter((job) => job.status === "delivered" || job.status === "failed");

    const weekDelivered = weekOutcomes.filter((job) => job.status === "delivered").length;
    const previousWeekDelivered = previousWeekOutcomes.filter((job) => job.status === "delivered").length;

    const successRate = weekOutcomes.length > 0 ? (weekDelivered / weekOutcomes.length) * 100 : 0;
    const previousSuccessRate =
      previousWeekOutcomes.length > 0 ? (previousWeekDelivered / previousWeekOutcomes.length) * 100 : 0;

    const deliveredWithScores = thisWeek.filter((job) => job.status === "delivered");
    const previousDeliveredWithScores = previousWeek.filter((job) => job.status === "delivered");
    const avgScore =
      deliveredWithScores.length > 0
        ? deliveredWithScores.reduce((sum, job) => sum + Number(job.min_score || 0), 0) / deliveredWithScores.length
        : 0;
    const previousAvgScore =
      previousDeliveredWithScores.length > 0
        ? previousDeliveredWithScores.reduce((sum, job) => sum + Number(job.min_score || 0), 0) / previousDeliveredWithScores.length
        : 0;

    return [
      {
        label: "Leads Today",
        value: leadsToday.toLocaleString(),
        change: percentChange(leadsToday, leadsYesterday),
        color: "#00ffff",
      },
      {
        label: "Jobs Today",
        value: String(todayJobs.length),
        change: percentChange(todayJobs.length, yesterdayJobs.length),
        color: "#00ff00",
      },
      {
        label: "Success (7d)",
        value: `${successRate.toFixed(1)}%`,
        change: successRate - previousSuccessRate,
        color: "#7fff00",
      },
      {
        label: "Avg Min Score",
        value: avgScore.toFixed(0),
        change: avgScore - previousAvgScore,
        color: "#ff9f43",
      },
    ];
  }, [snapshot.jobs]);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((stat) => {
          const up = stat.change >= 0;
          return (
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
                    up ? "text-[#00ff00]" : "text-[#ff6b6b]"
                  }`}
                >
                  {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {up ? "+" : ""}
                  {Math.abs(stat.change).toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
