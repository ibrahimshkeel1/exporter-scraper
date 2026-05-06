"use client";

import Link from "next/link";
import { LayoutDashboard, Mail, Search, Shield } from "lucide-react";
import { DashboardSnapshot } from "./dashboard-data";

const ACTIONS = [
  { label: "New Lead Search", href: "/search", icon: Search, color: "text-[#00ffff]", border: "border-[#00ffff]" },
  { label: "New Outreach", href: "/outreach", icon: Mail, color: "text-[#00ff00]", border: "border-[#00ff00]" },
  { label: "Admin Console", href: "/admin", icon: Shield, color: "text-[#ff6b6b]", border: "border-[#ff6b6b]" },
  { label: "View All Jobs", href: "/search", icon: LayoutDashboard, color: "text-vercel-text", border: "border-[#30363d]" },
];

type QuickActionsWidgetProps = {
  snapshot: DashboardSnapshot;
};

export function QuickActionsWidget(_props: QuickActionsWidgetProps) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className={`flex flex-col items-center justify-center gap-1.5 border ${action.border} bg-[#0d1117] p-3 transition-colors hover:bg-[#161b22]`}
            >
              <Icon size={16} className={action.color} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${action.color}`}>
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
