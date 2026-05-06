"use client";

import { Mail, MailOpen, MousePointerClick, Send, UserCheck } from "lucide-react";

const OUTREACH_METRICS = [
  { label: "Campaigns", value: 3, icon: Send, color: "#00ffff" },
  { label: "Emails Sent", value: 142, icon: Mail, color: "#00ff00" },
  { label: "Opened", value: 89, icon: MailOpen, color: "#7fff00" },
  { label: "Clicked", value: 34, icon: MousePointerClick, color: "#ff9f43" },
  { label: "Replied", value: 12, icon: UserCheck, color: "#a855f7" },
];

export function OutreachSummaryWidget() {
  const openRate = ((OUTREACH_METRICS[2].value / OUTREACH_METRICS[1].value) * 100).toFixed(1);
  const replyRate = ((OUTREACH_METRICS[4].value / OUTREACH_METRICS[1].value) * 100).toFixed(1);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 border border-[#30363d] bg-[#0d1117] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">Open Rate</span>
          <span className="text-xs font-mono font-bold text-[#00ff00]">{openRate}%</span>
        </div>
        <div className="flex items-center gap-1.5 border border-[#30363d] bg-[#0d1117] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">Reply Rate</span>
          <span className="text-xs font-mono font-bold text-[#a855f7]">{replyRate}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {OUTREACH_METRICS.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="flex items-center justify-between border border-[#30363d] bg-[#0d1117] px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <Icon size={12} style={{ color: metric.color }} />
                <span className="text-[11px] text-vercel-text">{metric.label}</span>
              </div>
              <span className="text-sm font-mono font-medium" style={{ color: metric.color }}>
                {metric.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
