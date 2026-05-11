"use client";

import { ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FolderClosed,
  FolderOpen,
  Loader2,
  Plus,
  ScrollText,
} from "lucide-react";
import { AuthPanel } from "./AuthPanel";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { createZipBlob } from "../lib/zip";
import { WorkspaceArtifact, WorkspaceContext, WorkspaceMode } from "./workspace-types";

type LeftSidebarProps = {
  mode: WorkspaceMode;
  explorerContext?: WorkspaceContext | null;
  activeArtifactId?: string | null;
  onOpenArtifact?: (artifact: WorkspaceArtifact) => void;
  onSelectSession?: (sessionId: string) => void;
};

type FolderNode = {
  id: string;
  name: string;
  path: string;
  folders: FolderNode[];
  artifacts: WorkspaceArtifact[];
};

function fileIcon(kind: WorkspaceArtifact["kind"]) {
  if (kind === "csv" || kind === "xlsx") return <FileSpreadsheet size={12} />;
  if (kind === "json") return <FileJson2 size={12} />;
  if (kind === "log") return <ScrollText size={12} />;
  if (kind === "markdown" || kind === "text" || kind === "report") return <FileText size={12} />;
  return <FileCode2 size={12} />;
}

function mimeTypeForArtifact(kind: WorkspaceArtifact["kind"]) {
  if (kind === "json" || kind === "report") return "application/json";
  if (kind === "csv") return "text/csv";
  if (kind === "markdown") return "text/markdown";
  if (kind === "log" || kind === "text") return "text/plain";
  return "application/octet-stream";
}

function safeZipName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "files";
}

function buildFolderTree(artifacts: WorkspaceArtifact[]) {
  const root: FolderNode = {
    id: "root",
    name: "root",
    path: "",
    folders: [],
    artifacts: [],
  };

  for (const artifact of artifacts) {
    const parts = (artifact.folder || "Files")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    let current = root;
    for (const part of parts) {
      const nextPath = current.path ? `${current.path}/${part}` : part;
      let child = current.folders.find((folder) => folder.path === nextPath);
      if (!child) {
        child = {
          id: `folder:${nextPath}`,
          name: part,
          path: nextPath,
          folders: [],
          artifacts: [],
        };
        current.folders.push(child);
      }
      current = child;
    }

    current.artifacts.push(artifact);
  }

  const sortNode = (node: FolderNode) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    node.artifacts.sort((a, b) => a.name.localeCompare(b.name));
    node.folders.forEach(sortNode);
  };
  sortNode(root);

  return root;
}

function collectDownloadableArtifacts(node: FolderNode): WorkspaceArtifact[] {
  const own = node.artifacts.filter((artifact) => artifact.download || artifact.externalUrl || artifact.content);
  const nested = node.folders.flatMap((folder) => collectDownloadableArtifacts(folder));
  return [...own, ...nested];
}

export function LeftSidebar({
  mode,
  explorerContext,
  activeArtifactId,
  onOpenArtifact,
  onSelectSession,
}: LeftSidebarProps) {
  const router = useRouter();
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const folderTree = useMemo(
    () => buildFolderTree(explorerContext?.artifacts || []),
    [explorerContext?.artifacts]
  );

  function toggleFolder(folderPath: string) {
    setExpandedFolders((current) => ({
      ...current,
      [folderPath]: !(current[folderPath] ?? true),
    }));
  }

  function setDownloading(key: string, value: boolean) {
    setDownloadingIds((current) => ({ ...current, [key]: value }));
  }

  async function authToken() {
    if (!supabase) throw new Error("Supabase public env vars are not configured.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sign in required for download.");
    return token;
  }

  async function resolveDownloadUrl(artifact: WorkspaceArtifact) {
    if (artifact.download?.kind === "external") return artifact.download.url;
    if (artifact.externalUrl) return artifact.externalUrl;

    if (artifact.download?.kind === "report") {
      const reportText = artifact.content || "{}";
      const blob = new Blob([reportText], { type: "application/json" });
      const blobUrl = window.URL.createObjectURL(blob);
      return blobUrl;
    }

    if (artifact.download?.kind === "export") {
      const token = await authToken();
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(artifact.download.jobId)}/exports?mode=url&exportId=${encodeURIComponent(artifact.download.exportId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not fetch download URL.");
      }
      return payload.url as string;
    }

    if (artifact.content) {
      const blob = new Blob([artifact.content], { type: mimeTypeForArtifact(artifact.kind) });
      return window.URL.createObjectURL(blob);
    }

    return null;
  }

  async function resolveArtifactBlob(artifact: WorkspaceArtifact) {
    if (artifact.download?.kind === "report") {
      return new Blob([artifact.content || "{}"], { type: "application/json" });
    }

    if (artifact.content && !artifact.download) {
      return new Blob([artifact.content], { type: mimeTypeForArtifact(artifact.kind) });
    }

    const url = await resolveDownloadUrl(artifact);
    if (!url) return null;
    if (url.startsWith("blob:")) {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not read temporary blob.");
      return await response.blob();
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not fetch file (${response.status}).`);
    return await response.blob();
  }

  async function downloadArtifact(artifact: WorkspaceArtifact) {
    const key = `file:${artifact.id}`;
    setDownloading(key, true);
    setErrorMessage(null);
    try {
      const url = await resolveDownloadUrl(artifact);
      if (!url) return;
      if (url.startsWith("blob:")) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = artifact.download?.filename || artifact.name;
        anchor.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 2500);
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.download = artifact.download?.filename || artifact.name;
      anchor.click();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not download file.");
    } finally {
      setDownloading(key, false);
    }
  }

  async function downloadFolder(folder: FolderNode) {
    const key = `folder:${folder.path}`;
    setDownloading(key, true);
    setErrorMessage(null);
    try {
      const files = collectDownloadableArtifacts(folder);
      if (files.length === 0) {
        setErrorMessage("No downloadable files in this folder.");
        return;
      }

      const entries: Array<{ path: string; data: Uint8Array }> = [];
      for (const artifact of files) {
        try {
          const blob = await resolveArtifactBlob(artifact);
          if (!blob) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const filePath = `${artifact.folder}/${artifact.download?.filename || artifact.name}`
            .replace(/^\/+/, "")
            .replace(/\\/g, "/");
          entries.push({ path: filePath, data: bytes });
        } catch {
          continue;
        }
      }

      if (entries.length === 0) {
        setErrorMessage("Could not package this folder. Some files may not be accessible yet.");
        return;
      }

      const zip = createZipBlob(entries);
      const zipUrl = window.URL.createObjectURL(zip);
      const anchor = document.createElement("a");
      anchor.href = zipUrl;
      anchor.download = `${safeZipName(folder.name)}.zip`;
      anchor.click();
      setTimeout(() => window.URL.revokeObjectURL(zipUrl), 4000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not download folder files.");
    } finally {
      setDownloading(key, false);
    }
  }

  function startNewSearch() {
    window.dispatchEvent(new Event("exportflow:new-chat"));
    if (window.location.pathname !== "/search") {
      router.push("/search");
    }
  }

  function openArtifactOrSession(artifact: WorkspaceArtifact) {
    if (artifact.sessionJobId) {
      onSelectSession?.(artifact.sessionJobId);
      return;
    }
    onOpenArtifact?.(artifact);
  }

  function renderFolder(node: FolderNode, depth = 0): ReactNode {
    const folderKey = `folder:${node.path}`;
    const expanded = expandedFolders[node.path] ?? true;
    const downloadableCount = collectDownloadableArtifacts(node).length;

    return (
      <div key={node.path}>
        <div className="group flex items-center justify-between" style={{ paddingLeft: `${depth * 10}px` }}>
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            className="inline-flex min-w-0 items-center gap-1 text-[#858585] hover:text-[#d4d4d4]"
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {expanded ? <FolderOpen size={12} /> : <FolderClosed size={12} />}
            <span className="truncate">{node.name}</span>
          </button>

          {downloadableCount > 0 && (
            <button
              type="button"
              onClick={() => void downloadFolder(node)}
              className="invisible inline-flex h-5 w-5 items-center justify-center rounded text-[#858585] hover:bg-[#333333] hover:text-[#569cd6] group-hover:visible"
              title={`Download all (${downloadableCount})`}
            >
              {downloadingIds[folderKey] ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
            </button>
          )}
        </div>

        {expanded && (
          <div className="space-y-1 pt-1">
            {node.folders.map((child) => renderFolder(child, depth + 1))}
            {node.artifacts.map((artifact) => {
              const fileKey = `file:${artifact.id}`;
              const canDownload = Boolean(artifact.download || artifact.externalUrl || artifact.content);
              const isCsv = artifact.kind === "csv";
              return (
                <div key={artifact.id} className="group flex items-center justify-between" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
                  <button
                    type="button"
                    onClick={() => openArtifactOrSession(artifact)}
                    className={`inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left ${
                      isCsv
                        ? "bg-[#1f3a4f] text-[#d4d4d4] hover:bg-[#264f78]"
                        : activeArtifactId === artifact.id
                        ? "bg-[#333333] text-[#569cd6]"
                        : "text-[#d4d4d4] hover:bg-[#333333] hover:text-[#569cd6]"
                    }`}
                  >
                    {fileIcon(artifact.kind)}
                    <span className="truncate">{artifact.name}</span>
                    {isCsv && <span className="ml-1 text-[9px] uppercase tracking-[0.12em] text-[#569cd6]">View</span>}
                  </button>
                  {canDownload && (
                    <button
                      type="button"
                      onClick={() => void downloadArtifact(artifact)}
                      className="invisible inline-flex h-5 w-5 items-center justify-center rounded text-[#858585] hover:bg-[#333333] hover:text-[#569cd6] group-hover:visible"
                      title="Download file"
                    >
                      {downloadingIds[fileKey] ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#252526]">
      <div className="mb-2 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-[#858585]">
        Explorer
      </div>
      {(mode === "dashboard" || mode === "search") && (
        <button
          type="button"
          onClick={startNewSearch}
          className="ide-btn ide-btn-primary mx-2 mb-3 inline-flex h-9 items-center justify-center gap-2 px-2 text-xs"
        >
          <Plus size={14} />
          New Search
        </button>
      )}

      <div className="mx-2 min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-3 font-mono text-xs">
          <div>
            <p className="text-[#858585]">workspace</p>
            <p className="text-[#858585]">- lead-sessions</p>
          </div>

          {explorerContext && (
            <>
              <div className="border-t border-[#333333] pt-2">
                <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[#858585]">Active Context</p>
                <p className="truncate text-[#569cd6]">{explorerContext.label}</p>
                {explorerContext.description && (
                  <p className="truncate text-[11px] text-[#858585]">{explorerContext.description}</p>
                )}
              </div>

              {explorerContext.sessions && explorerContext.sessions.length > 0 && (
                <div className="border-t border-[#333333] pt-2">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[#858585]">Sessions</p>
                  <div className="space-y-1">
                    {explorerContext.sessions.map((session) => {
                      const active = session.id === explorerContext.activeSessionId;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => onSelectSession?.(session.id)}
                          className={`w-full rounded px-2 py-1.5 text-left ${
                            active
                              ? "bg-[#333333] text-[#569cd6]"
                              : "text-[#d4d4d4] hover:bg-[#333333] hover:text-[#569cd6]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{session.label}</span>
                            {session.status && <span className="text-[9px] uppercase text-[#858585]">{session.status}</span>}
                          </div>
                          {session.description && <p className="mt-0.5 truncate text-[10px] text-[#858585]">{session.description}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-[#333333] pt-2">
                <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[#858585]">Files</p>
                {errorMessage && (
                  <div className="mb-2 border border-[#ff6b6b] bg-[#220b0b] px-2 py-1.5 text-[10px] text-[#ff6b6b]">
                    {errorMessage}
                  </div>
                )}
                <div className="space-y-1">
                  {folderTree.folders.length === 0 && (
                    <p className="text-[11px] text-[#858585]">No files yet for this session.</p>
                  )}
                  {folderTree.folders.map((folder) => renderFolder(folder))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 px-2 pb-2">
        <AuthPanel compact />
      </div>
    </div>
  );
}
