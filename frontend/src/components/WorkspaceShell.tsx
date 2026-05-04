"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings, ShieldClose, X } from "lucide-react";
import { AuthPanel } from "./AuthPanel";

type WorkspaceMode = "dashboard" | "admin";

type WorkspaceShellProps = {
  mode: WorkspaceMode;
  title: string;
  subtitle: string;
  children: ReactNode;
};

function navItems() {
  return [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mode: "dashboard" as const },
    { href: "/admin", label: "Admin", icon: ShieldClose, mode: "admin" as const },
    { href: "/dashboard", label: "Settings", icon: Settings, mode: "settings" as const },
  ];
}

function SideBar({ mode, compact, onClose }: { mode: WorkspaceMode; compact?: boolean; onClose?: () => void }) {
  return (
    <div className={`flex h-full flex-col bg-[#0d1117] ${compact ? "p-2" : "p-3"}`}>
      <div className="mb-3 border border-[#30363d] bg-[#010409] px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-[#8b949e]">
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
      <div className="ide-panel min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-1 font-mono text-xs">
          <p className="text-[#8b949e]">workspace</p>
          <p className={`${mode === "dashboard" ? "text-[#00ffff]" : "text-[#c9d1d9]"}`}>- agentic-lead-search.tsx</p>
          <p className={`${mode === "admin" ? "text-[#00ffff]" : "text-[#c9d1d9]"}`}>- operator-console.tsx</p>
          <p className="text-[#8b949e]">- job-events.log</p>
          <p className="text-[#8b949e]">- delivery-report.json</p>
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
    <div className="h-screen w-screen overflow-hidden bg-[#0d1117] text-vercel-text">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-12 border-r border-[#30363d] bg-[#010409] lg:flex lg:flex-col lg:items-center lg:py-2">
          {navItems().map((item) => {
            const Icon = item.icon;
            const active = item.mode === mode;
            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                className={`relative mb-1 inline-flex h-10 w-10 items-center justify-center border border-transparent text-[#8b949e] hover:text-[#00ffff] ${
                  active ? "text-[#00ffff]" : ""
                }`}
                title={item.label}
              >
                {active && <span className="absolute left-[-9px] top-0 h-full w-[2px] bg-[#00ffff]" />}
                <Icon size={16} />
              </Link>
            );
          })}
        </aside>

        <aside className={`hidden border-r border-[#30363d] bg-[#0d1117] lg:block ${sidebarOpen ? "w-[250px]" : "w-0 overflow-hidden"}`}>
          <SideBar mode={mode} />
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <header className="border-b border-[#30363d] bg-[#161b22]">
            <div className="flex items-center border-b border-[#30363d] px-2">
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
              <div className="ide-panel mr-2 border-b-0 bg-[#0d1117] px-3 py-1.5 text-xs text-[#c9d1d9]">
                [ {title} x ]
              </div>
              <div className="text-[11px] text-[#8b949e]">{subtitle}</div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-auto bg-[#0d1117] p-3">{children}</main>

          <footer className="flex h-[22px] items-center justify-between border-t border-[#30363d] bg-[#161b22] px-2 text-[11px] text-[#8b949e]">
            <span>WS: exportflow</span>
            <span className="text-[#00ff00]">SSE: LIVE</span>
          </footer>
        </section>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden">
          <aside className="h-full w-[90vw] max-w-[300px] border-r border-[#30363d] bg-[#0d1117]">
            <div className="flex items-center justify-between border-b border-[#30363d] p-2">
              <p className="text-xs uppercase tracking-[0.14em] text-[#8b949e]">Sidebar</p>
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
