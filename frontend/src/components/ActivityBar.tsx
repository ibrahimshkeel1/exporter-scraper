"use client";

import Link from "next/link";
import { LayoutDashboard, Mail, Search, Shield, Settings, PanelLeft, PanelRight, SquareTerminal, Focus, ZoomIn, ZoomOut } from "lucide-react";
import { WorkspaceMode } from "./workspace-types";

type ActivityBarProps = {
  mode: WorkspaceMode;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleTerminal: () => void;
  onToggleFocus: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
  terminalOpen: boolean;
  focusMode: boolean;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mode: "dashboard" as const },
  { href: "/search", label: "Search", icon: Search, mode: "search" as const },
  { href: "/outreach", label: "Outreach", icon: Mail, mode: "outreach" as const },
  { href: "/admin", label: "Admin", icon: Shield, mode: "admin" as const },
];

export function ActivityBar({
  mode,
  onToggleLeft,
  onToggleRight,
  onToggleTerminal,
  onToggleFocus,
  onZoomIn,
  onZoomOut,
  leftOpen,
  rightOpen,
  terminalOpen,
  focusMode,
}: ActivityBarProps) {
  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-[#30363d] bg-[#010409]">
      {/* Top nav icons */}
      <div className="flex flex-col items-center gap-1 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.mode === mode;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative inline-flex h-10 w-10 items-center justify-center text-[#8b949e] transition-colors hover:text-[#00ffff] ${
                active ? "text-[#00ffff]" : ""
              }`}
              title={item.label}
            >
              {active && <span className="absolute left-[-1px] top-0 h-full w-[2px] bg-[#00ffff]" />}
              <Icon size={18} />
            </Link>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Layout toggle icons */}
      <div className="flex flex-col items-center gap-1 border-t border-[#30363d] py-2">
        <button
          type="button"
          onClick={onZoomOut}
          className="inline-flex h-9 w-9 items-center justify-center text-[#8b949e] hover:text-[#00ffff]"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          className="inline-flex h-9 w-9 items-center justify-center text-[#8b949e] hover:text-[#00ffff]"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleFocus}
          className={`inline-flex h-9 w-9 items-center justify-center transition-colors ${
            focusMode ? "text-[#00ffff]" : "text-[#8b949e] hover:text-[#00ffff]"
          }`}
          title={focusMode ? "Exit Focus Mode" : "Focus Mode"}
        >
          <Focus size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleLeft}
          className={`inline-flex h-9 w-9 items-center justify-center transition-colors ${
            leftOpen ? "text-[#00ffff]" : "text-[#8b949e] hover:text-[#00ffff]"
          }`}
          title="Toggle Left Sidebar"
        >
          <PanelLeft size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleRight}
          className={`inline-flex h-9 w-9 items-center justify-center transition-colors ${
            rightOpen ? "text-[#00ffff]" : "text-[#8b949e] hover:text-[#00ffff]"
          }`}
          title="Toggle Right Sidebar"
        >
          <PanelRight size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleTerminal}
          className={`inline-flex h-9 w-9 items-center justify-center transition-colors ${
            terminalOpen ? "text-[#00ffff]" : "text-[#8b949e] hover:text-[#00ffff]"
          }`}
          title="Toggle Terminal"
        >
          <SquareTerminal size={16} />
        </button>
      </div>

      <div className="border-t border-[#30363d] py-2">
        <Link
          href="/settings"
          className={`inline-flex h-10 w-10 items-center justify-center ${
            mode === "settings" ? "text-[#00ffff]" : "text-[#8b949e] hover:text-[#00ffff]"
          }`}
          title="Settings"
        >
          <Settings size={18} />
        </Link>
      </div>
    </div>
  );
}
