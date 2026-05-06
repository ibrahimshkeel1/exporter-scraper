"use client";

import { Mail, MailOpen, MessageSquare, Send, UserCheck } from "lucide-react";
import { DashboardSnapshot } from "./dashboard-data";

type OutreachSummaryWidgetProps = {
  snapshot: DashboardSnapshot;
};

export function OutreachSummaryWidget({ snapshot }: OutreachSummaryWidgetProps) {
  const campaigns = snapshot.campaigns || [];
  const messages = campaigns.flatMap((campaign) => campaign.outreach_messages || []);
  const leads = campaigns.flatMap((campaign) => campaign.outreach_leads || []);

  const sent = messages.filter((message) => message.status === "sent" || message.status === "test_sent").length;
  const queued = messages.filter((message) => message.status === "queued" || message.status === "sending").length;
  const failed = messages.filter((message) => message.status === "failed").length;
  const replied = leads.filter((lead) => lead.status === "replied").length;
  const activeLeads = leads.length;

  const metrics = [
    { label: "Campaigns", value: campaigns.length, icon: Send, color: "#00ffff" },
    { label: "Queued", value: queued, icon: MailOpen, color: "#ff9f43" },
    { label: "Sent", value: sent, icon: Mail, color: "#00ff00" },
    { label: "Replies", value: replied, icon: MessageSquare, color: "#7fff00" },
    { label: "Failed", value: failed, icon: UserCheck, color: "#ff6b6b" },
  ];

  const sendRate = activeLeads > 0 ? ((sent / activeLeads) * 100).toFixed(1) : "0.0";
  const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0.0";

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 border border-[#30363d] bg-[#0d1117] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">Send Rate</span>
          <span className="text-xs font-mono font-bold text-[#00ff00]">{sendRate}%</span>
        </div>
        <div className="flex items-center gap-1.5 border border-[#30363d] bg-[#0d1117] px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-vercel-muted">Reply Rate</span>
          <span className="text-xs font-mono font-bold text-[#00ffff]">{replyRate}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {metrics.map((metric) => {
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
