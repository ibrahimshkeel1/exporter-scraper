"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Menu, PanelLeft, Plus, ShieldClose, X } from "lucide-react";
import { AuthPanel } from "./AuthPanel";

type WorkspaceMode = "dashboard" | "admin";

type WorkspaceShellProps = {
  mode: WorkspaceMode;
  title: string;
  subtitle: string;
  children: ReactNode;
};

function SideNav({
  mode,
  onClose,
}: {
  mode: WorkspaceMode;
  onClose?: () => void;
}) {
  const onNewSearch = () => {
    window.dispatchEvent(new Event("exportflow:new-chat"));
    onClose?.();
  };

  return (
    <div className="flex h-full flex-col gap-4 bg-[#0a0f16] p-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-wide text-vercel-text">
          ExportFlow Workspace
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-vercel-text hover:bg-white/10 lg:hidden"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNewSearch}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-200"
      >
        <Plus size={14} />
        New Search
      </button>

      <nav className="space-y-1">
        <Link
          href="/dashboard"
          onClick={onClose}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            mode === "dashboard" ? "bg-cyan-400/10 text-cyan-200" : "text-vercel-muted hover:bg-white/5 hover:text-vercel-text"
          }`}
        >
          <LayoutDashboard size={15} />
          Agentic Lead Search
        </Link>
        <Link
          href="/admin"
          onClick={onClose}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            mode === "admin" ? "bg-cyan-400/10 text-cyan-200" : "text-vercel-muted hover:bg-white/5 hover:text-vercel-text"
          }`}
        >
          <ShieldClose size={15} />
          Operator Console
        </Link>
      </nav>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-3">
        <AuthPanel />
      </div>
    </div>
  );
}

export function WorkspaceShell({ mode, title, subtitle, children }: WorkspaceShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#05090f] text-vercel-text">
      <div className="flex h-full min-h-0">
        <aside className={`hidden h-full border-r border-white/10 lg:block ${collapsed ? "w-[72px]" : "w-[340px]"}`}>
          {collapsed ? (
            <div className="flex h-full flex-col items-center gap-3 bg-[#0a0f16] py-4">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-vercel-text hover:bg-white/10"
              >
                <PanelLeft size={14} />
              </button>
              <Link href="/dashboard" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-vercel-text hover:bg-white/10">
                <LayoutDashboard size={15} />
              </Link>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("exportflow:new-chat"))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-cyan-300 text-black hover:bg-cyan-200"
              >
                <Plus size={15} />
              </button>
            </div>
          ) : (
            <SideNav mode={mode} />
          )}
        </aside>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/10 bg-black/30 px-4 py-3 lg:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-vercel-text hover:bg-white/10 lg:hidden"
              >
                <Menu size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-vercel-text hover:bg-white/10 lg:inline-flex"
              >
                <PanelLeft size={16} />
              </button>
              <div>
                <p className="text-sm font-semibold text-vercel-text">{title}</p>
                <p className="text-xs text-vercel-muted">{subtitle}</p>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 p-3 lg:p-5">{children}</main>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden">
          <aside className="h-full w-[88vw] max-w-[360px] border-r border-white/10">
            <SideNav mode={mode} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
