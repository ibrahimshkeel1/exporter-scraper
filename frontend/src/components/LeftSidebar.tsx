"use client";

import { FileCode2, FileJson2, FileSpreadsheet, FileText, FolderClosed, Plus, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthPanel } from "./AuthPanel";
import { WorkspaceArtifact, WorkspaceContext, WorkspaceMode } from "./workspace-types";

function goToSearch() {
  window.dispatchEvent(new Event("exportflow:new-chat"));
  if (typeof window !== "undefined" && window.location.pathname !== "/search") {
    window.location.href = "/search";
  }
}

type LeftSidebarProps = {
  mode: WorkspaceMode;
  explorerContext?: WorkspaceContext | null;
  activeArtifactId?: string | null;
  onOpenArtifact?: (artifact: WorkspaceArtifact) => void;
};

function fileIcon(kind: WorkspaceArtifact["kind"]) {
  if (kind === "csv" || kind === "xlsx") return <FileSpreadsheet size={12} />;
  if (kind === "json") return <FileJson2 size={12} />;
  if (kind === "log") return <ScrollText size={12} />;
  if (kind === "markdown" || kind === "text" || kind === "report") return <FileText size={12} />;
  return <FileCode2 size={12} />;
}

export function LeftSidebar({ mode, explorerContext, activeArtifactId, onOpenArtifact }: LeftSidebarProps) {
  const pathname = usePathname?.() || "";
  const isSearch = pathname === "/search" || pathname === "/dashboard/search";
  const isDashboard = pathname === "/dashboard";
  const isOutreach = pathname === "/outreach";
  const isAdmin = pathname === "/admin";
  const isSettings = pathname === "/settings";

  const groupedArtifacts = (explorerContext?.artifacts || []).reduce<Record<string, WorkspaceArtifact[]>>(
    (acc, artifact) => {
      const folder = artifact.folder || "Files";
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(artifact);
      return acc;
    },
    {}
  );

  const folderOrder = ["Results", "Insights", "Logs", ...Object.keys(groupedArtifacts).filter((name) => !["Results", "Insights", "Logs"].includes(name))];

  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      <div className="mb-2 border border-[#30363d] bg-[#010409] px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-[#8b949e]">
        Explorer
      </div>
      {(mode === "dashboard" || mode === "search") && (
        <button
          type="button"
          onClick={goToSearch}
          className="ide-btn ide-btn-primary mx-2 mb-3 inline-flex h-9 items-center justify-center gap-2 px-2 text-xs"
        >
          <Plus size={14} />
          New Search
        </button>
      )}
      <div className="ide-panel mx-2 min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-1 font-mono text-xs">
          <p className="text-[#8b949e]">workspace</p>
          <p className="text-[#8b949e]">- frontend/</p>
          <Link href="/dashboard" className={`block ${isDashboard ? "text-[#00ffff]" : "text-[#c9d1d9] hover:text-[#00ffff]"}`}>
            - dashboard-hub.tsx
          </Link>
          <Link href="/search" className={`block ${isSearch ? "text-[#00ffff]" : "text-[#c9d1d9] hover:text-[#00ffff]"}`}>
            - agentic-lead-search.tsx
          </Link>
          <Link href="/outreach" className={`block ${isOutreach ? "text-[#00ffff]" : "text-[#c9d1d9] hover:text-[#00ffff]"}`}>
            - outreach-funnel.tsx
          </Link>
          <Link href="/admin" className={`block ${isAdmin ? "text-[#00ffff]" : "text-[#c9d1d9] hover:text-[#00ffff]"}`}>
            - operator-console.tsx
          </Link>
          <Link href="/settings" className={`block ${isSettings ? "text-[#00ffff]" : "text-[#c9d1d9] hover:text-[#00ffff]"}`}>
            - settings.json
          </Link>

          {explorerContext && (
            <div className="mt-3 border-t border-[#30363d] pt-2">
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[#8b949e]">
                Active Context
              </p>
              <p className="truncate text-[#00ffff]">{explorerContext.label}</p>
              {explorerContext.description && (
                <p className="truncate text-[11px] text-[#8b949e]">{explorerContext.description}</p>
              )}
              <div className="mt-2 space-y-2">
                {folderOrder.map((folderName) => {
                  const artifacts = groupedArtifacts[folderName] || [];
                  if (artifacts.length === 0) return null;
                  return (
                    <div key={folderName}>
                      <p className="mb-1 inline-flex items-center gap-1 text-[#8b949e]">
                        <FolderClosed size={12} />
                        {folderName}
                      </p>
                      <div className="space-y-1 pl-2">
                        {artifacts.map((artifact) => (
                          <button
                            key={artifact.id}
                            type="button"
                            onClick={() => onOpenArtifact?.(artifact)}
                            className={`flex w-full items-center gap-1.5 text-left ${
                              activeArtifactId === artifact.id
                                ? "text-[#00ffff]"
                                : "text-[#c9d1d9] hover:text-[#00ffff]"
                            }`}
                          >
                            {fileIcon(artifact.kind)}
                            <span className="truncate">{artifact.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 px-2 pb-2">
        <AuthPanel compact />
      </div>
    </div>
  );
}
