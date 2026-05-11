"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Mail, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings, ShieldClose, X } from "lucide-react";
import { AuthPanel } from "./AuthPanel";

type WorkspaceMode = "dashboard" | "outreach" | "admin";

type WorkspaceShellProps = {
  mode: WorkspaceMode;
  title: string;
  subtitle: string;
  children: ReactNode;
};

function navItems() {
  return [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mode: "dashboard" as const },
    { href: "/outreach", label: "Outreach", icon: Mail, mode: "outreach" as const },
    { href: "/admin", label: "Admin", icon: ShieldClose, mode: "admin" as const },
    { href: "/dashboard", label: "Settings", icon: Settings, mode: "settings" as const },
  ];
}

function SideBar({ mode, compact, onClose }: { mode: WorkspaceMode; compact?: boolean; onClose?: () => void }) {
  return (
    <div className={`flex h-full flex-col bg-[#252526] ${compact ? "p-2" : "p-3"}`}>
      <div className="mb-3 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-[#858585]">
        Explorer
      </div>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new Event("exportflow:new-chat"));
          onClose?.();
        }}
        className="ide-btn ide-btn-primary mb-3 inline-flex h-9 items-center justify-center gap-2 px-2 text-xs"
      >
        <Plus size={14} />
        New Search
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        <div className="space-y-1 font-mono text-xs">
          <p className="text-[#858585]">workspace</p>
          <p className="text-[#858585]">- frontend/</p>
          <p className={`${mode === "dashboard" ? "text-[#569cd6]" : "text-[#d4d4d4]"}`}>  - agentic-lead-search.tsx</p>
          <p className={`${mode === "outreach" ? "text-[#569cd6]" : "text-[#d4d4d4]"}`}>  - outreach-funnel.tsx</p>
          <p className={`${mode === "admin" ? "text-[#569cd6]" : "text-[#d4d4d4]"}`}>  - operator-console.tsx</p>
          <p className="text-[#858585]">- exports/</p>
          <p className="text-[#858585]">  - *_leads.csv</p>
          <p className="text-[#858585]">  - *_audit.xlsx</p>
          <p className="text-[#858585]">- events/</p>
          <p className="text-[#858585]">  - stdout.log</p>
          <p className="text-[#858585]">  - report.json</p>
        </div>
      </div>
      {!compact && <div className="mt-3"><AuthPanel compact /></div>}
    </div>
  );
}

export function WorkspaceShell({ mode, title, subtitle, children }: WorkspaceShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#1e1e1e] text-vercel-text">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-12 bg-[#333333] lg:flex lg:flex-col lg:items-center lg:py-2">
          {navItems().map((item) => {
            const Icon = item.icon;
            const active = item.mode === mode;
            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                className={`relative mb-1 inline-flex h-10 w-10 items-center justify-center text-[#858585] hover:text-[#569cd6] ${
                  active ? "text-[#569cd6]" : ""
                }`}
                title={item.label}
              >
                {active && <span className="absolute left-0 top-1 h-8 w-[2px] bg-[#007acc]" />}
                <Icon size={16} />
              </Link>
            );
          })}
        </aside>

        <aside className={`hidden bg-[#252526] lg:block ${sidebarOpen ? "w-[250px]" : "w-0 overflow-hidden"}`}>
          <SideBar mode={mode} />
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <header className="border-b border-[#3c3c3c] bg-[#252526]">
            <div className="flex h-9 items-center px-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="ide-btn mr-2 inline-flex h-8 w-8 items-center justify-center lg:hidden"
              >
                <Menu size={15} />
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen((value) => !value)}
                className="ide-btn mr-2 hidden h-8 w-8 items-center justify-center lg:inline-flex"
              >
                {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>
              <div className="mr-2 h-full border-r border-[#3c3c3c] border-t-2 border-t-[#007acc] bg-[#1e1e1e] px-3 py-1.5 text-xs text-[#d4d4d4]">
                {title}
              </div>
              <div className="text-[11px] text-[#858585]">{subtitle}</div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden bg-[#1e1e1e] p-2">{children}</main>

          <footer className="flex h-[22px] items-center justify-between border-t border-[#3c3c3c] bg-[#252526] px-2 text-[11px] text-[#858585]">
            <span>WS: exportflow</span>
            <span className="text-[#6a9955]">SSE: LIVE</span>
          </footer>
        </section>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden">
          <aside className="h-full w-[90vw] max-w-[300px] bg-[#252526]">
            <div className="flex items-center justify-between border-b border-[#3c3c3c] p-2">
              <p className="text-xs uppercase tracking-[0.14em] text-[#858585]">Sidebar</p>
              <button type="button" className="ide-btn inline-flex h-8 w-8 items-center justify-center" onClick={() => setMobileOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <SideBar mode={mode} compact onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
