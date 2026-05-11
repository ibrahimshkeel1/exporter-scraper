"use client";

import { ReactNode } from "react";

type RightSidebarProps = {
  jobsPanel: ReactNode;
  activeJobId?: string | null;
};

export function RightSidebar({ jobsPanel }: RightSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="min-h-0 flex-1 overflow-hidden">{jobsPanel}</div>
    </div>
  );
}
