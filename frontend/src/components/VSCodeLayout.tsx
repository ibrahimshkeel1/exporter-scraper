"use client";

import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Group as PanelGroup,
  Panel,
  PanelImperativeHandle,
  PanelSize,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { ActivityBar } from "./ActivityBar";
import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./RightSidebar";
import { BottomPanel } from "./BottomPanel";
import { WorkspaceArtifact, WorkspaceContext, WorkspaceMode } from "./workspace-types";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";

const MAIN_TAB_ID = "__main_editor__";
const DEFAULT_LEFT_SIZE = 20;
const DEFAULT_RIGHT_SIZE = 24;
const DEFAULT_TERMINAL_SIZE = 28;
const MIN_LEFT_SIZE = 12;
const MIN_RIGHT_SIZE = 16;
const MIN_TERMINAL_SIZE = 14;

function mimeTypeForArtifact(kind: WorkspaceArtifact["kind"]) {
  if (kind === "json" || kind === "report") return "application/json";
  if (kind === "csv") return "text/csv";
  if (kind === "markdown") return "text/markdown";
  if (kind === "log" || kind === "text") return "text/plain";
  return "application/octet-stream";
}

function parseCsvRow(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvPreview(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => parseCsvRow(line));
}

function CsvPreviewPanel({ content }: { content: string }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    setQuery("");
  }, [content]);
  const rows = useMemo(() => parseCsvPreview(content), [content]);
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? dataRows.filter((row) => row.some((cell) => cell.toLowerCase().includes(normalizedQuery)))
    : dataRows;
  const visible = filtered.slice(0, 300);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="ide-input h-8 min-w-[220px] flex-1 px-2 text-xs"
          placeholder="Search CSV rows..."
        />
        <span className="text-[11px] text-[#8b949e]">
          {filtered.length.toLocaleString()} rows
          {filtered.length > visible.length ? ` (showing ${visible.length})` : ""}
        </span>
      </div>

      <div className="min-h-0 w-full flex-1 overflow-auto border border-[#30363d] bg-black/30">
        {headers.length === 0 ? (
          <div className="p-3 text-xs text-[#8b949e]">No CSV rows to preview.</div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#10161f]">
              <tr>
                {headers.map((header, index) => (
                  <th key={`${header}-${index}`} className="border-b border-[#30363d] px-2 py-1.5 font-semibold text-[#8cf5ff]">
                    {header || `Column ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="border-b border-[#1c2128] align-top">
                  {headers.map((_, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`} className="px-2 py-1.5 text-[#c9d1d9]">
                      <span className="block overflow-hidden whitespace-pre-wrap break-words" title={row[cellIndex] || ""}>
                        {row[cellIndex] || ""}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td className="px-2 py-2 text-[#8b949e]" colSpan={Math.max(1, headers.length)}>
                    No rows match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type VSCodeLayoutProps = {
  mode: WorkspaceMode;
  title: string;
  subtitle: string;
  mainEditor: ReactNode;
  jobsPanel: ReactNode;
  terminalContent?: ReactNode;
  terminalSummary?: string;
  activeTerminalJobId?: string | null;
  explorerContext?: WorkspaceContext | null;
  renderArtifact?: (artifact: WorkspaceArtifact) => ReactNode;
  activeSessionOpenToken?: number;
};

function ArtifactPreviewPanel({ artifact }: { artifact: WorkspaceArtifact }) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [previewText, setPreviewText] = useState<string>(artifact.content || "No inline preview available for this artifact.");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function authToken() {
    if (!supabase) throw new Error("Supabase public env vars are not configured.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sign in required.");
    return token;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      setPreviewError(null);
      if (artifact.preview?.kind !== "export") {
        setPreviewText(artifact.content || "No inline preview available for this artifact.");
        return;
      }

      setPreviewLoading(true);
      try {
        const token = await authToken();
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(artifact.preview.jobId)}/exports?mode=preview&exportId=${encodeURIComponent(artifact.preview.exportId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Could not load preview.");
        }
        const text = typeof payload.preview === "string" ? payload.preview : "Preview is unavailable for this file.";
        if (!cancelled) {
          const suffix = payload.truncated ? "\n\n...preview truncated" : "";
          setPreviewText(`${text}${suffix}`);
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : "Could not load preview.");
          setPreviewText(artifact.content || "No inline preview available for this artifact.");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [artifact.content, artifact.id, artifact.preview?.exportId, artifact.preview?.jobId, artifact.preview?.kind]);

  async function downloadArtifact() {
    setDownloadLoading(true);
    setDownloadError(null);
    try {
      if (artifact.download?.kind === "external") {
        window.open(artifact.download.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (artifact.download?.kind === "report") {
        const reportText = artifact.content || "{}";
        const blob = new Blob([reportText], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = artifact.download.filename || artifact.name;
        anchor.click();
        window.URL.revokeObjectURL(url);
        return;
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
        window.open(payload.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (artifact.externalUrl) {
        window.open(artifact.externalUrl, "_blank", "noopener,noreferrer");
        return;
      }

      if (artifact.content) {
        const blob = new Blob([artifact.content], { type: mimeTypeForArtifact(artifact.kind) });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = artifact.name;
        anchor.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not download artifact.");
    } finally {
      setDownloadLoading(false);
    }
  }

  const aiStyledArtifact =
    artifact.kind === "markdown" &&
    (artifact.name.toLowerCase().includes("ai") ||
      artifact.name.toLowerCase().includes("report") ||
      artifact.folder.toLowerCase().includes("analysis"));

  return (
    <div className="h-full w-full overflow-auto bg-[#0d1117] p-4">
      <div className="mb-3 flex items-start justify-between gap-3 border border-[#30363d] bg-black/35 p-3 text-xs">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#8b949e]">{artifact.folder}</p>
          <p className="mt-1 font-mono text-[#00ffff]">{artifact.name}</p>
          {artifact.meta && <p className="mt-1 text-[#8b949e]">{artifact.meta}</p>}
        </div>
        {(artifact.download || artifact.externalUrl || artifact.content) && (
          <button
            type="button"
            onClick={() => void downloadArtifact()}
            disabled={downloadLoading}
            className="ide-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            {downloadLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Download
          </button>
        )}
      </div>

      {previewError && (
        <div className="mb-3 border border-[#ff6b6b] bg-[#220b0b] px-3 py-2 text-xs text-[#ff6b6b]">
          {previewError}
        </div>
      )}
      {downloadError && (
        <div className="mb-3 border border-[#ff6b6b] bg-[#220b0b] px-3 py-2 text-xs text-[#ff6b6b]">
          {downloadError}
        </div>
      )}

      {previewLoading ? (
        <pre className="whitespace-pre-wrap break-words border border-[#30363d] bg-black/40 p-3 text-xs leading-5 text-[#c9d1d9]">
          Loading preview...
        </pre>
      ) : artifact.kind === "csv" ? (
        <CsvPreviewPanel content={previewText} />
      ) : (
        <pre
          className={`whitespace-pre-wrap break-words border p-3 text-xs leading-5 w-full ${
            aiStyledArtifact
              ? "border-[#2dd4bf] bg-[#2dd4bf] text-black"
              : "border-[#30363d] bg-black/40 text-[#c9d1d9]"
          }`}
        >
          {previewText}
        </pre>
      )}
      {artifact.externalUrl && (
        <a
          href={artifact.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs text-[#c9d1d9] hover:border-[#00ffff] hover:text-[#00ffff]"
        >
          <ExternalLink size={12} />
          Open External File
        </a>
      )}
    </div>
  );
}

export function VSCodeLayout({
  mode,
  title,
  subtitle,
  mainEditor,
  jobsPanel,
  terminalContent,
  terminalSummary,
  activeTerminalJobId,
  explorerContext,
  renderArtifact,
  activeSessionOpenToken = 0,
}: VSCodeLayoutProps) {
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const terminalPanelRef = useRef<PanelImperativeHandle | null>(null);
  const lastSessionTabRef = useRef<{ id: string | null; token: number }>({ id: null, token: -1 });
  const terminalManuallyChangedRef = useRef(false);

  const rightDefaultOpen = true;
  const hasTerminalContent = Boolean(terminalContent);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(rightDefaultOpen);
  const [terminalOpen, setTerminalOpen] = useState(hasTerminalContent);
  const [focusMode, setFocusMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [leftSize, setLeftSize] = useState(DEFAULT_LEFT_SIZE);
  const [rightSize, setRightSize] = useState(DEFAULT_RIGHT_SIZE);
  const [terminalSize, setTerminalSize] = useState(DEFAULT_TERMINAL_SIZE);
  const [openArtifacts, setOpenArtifacts] = useState<WorkspaceArtifact[]>([]);
  const [activeTabId, setActiveTabId] = useState(MAIN_TAB_ID);

  useEffect(() => {
    if (!hasTerminalContent) {
      setTerminalOpen(false);
      terminalManuallyChangedRef.current = false;
      return;
    }
    if (!terminalManuallyChangedRef.current) {
      setTerminalOpen(true);
      window.requestAnimationFrame(() => {
        terminalPanelRef.current?.expand?.();
        terminalPanelRef.current?.resize?.(`${Math.max(MIN_TERMINAL_SIZE, terminalSize)}%`);
      });
    }
  }, [activeTerminalJobId, hasTerminalContent, terminalSize]);

  useEffect(() => {
    if (!explorerContext || explorerContext.artifacts.length === 0) {
      setOpenArtifacts([]);
      setActiveTabId(MAIN_TAB_ID);
      return;
    }
    setOpenArtifacts((current) => current.filter((artifact) => explorerContext.artifacts.some((item) => item.id === artifact.id)));
    setActiveTabId((current) => {
      if (current === MAIN_TAB_ID) return current;
      const stillExists = explorerContext.artifacts.some((item) => item.id === current);
      return stillExists ? current : MAIN_TAB_ID;
    });
  }, [explorerContext]);

  useEffect(() => {
    if (!explorerContext?.activeSessionId) {
      lastSessionTabRef.current = { id: null, token: -1 };
      return;
    }
    const alreadyOpened =
      lastSessionTabRef.current.id === explorerContext.activeSessionId &&
      lastSessionTabRef.current.token === activeSessionOpenToken;
    if (alreadyOpened) {
      return;
    }
    lastSessionTabRef.current = { id: explorerContext.activeSessionId, token: activeSessionOpenToken };
    const sessionTabId = `session-${explorerContext.activeSessionId}-summary`;
    const sessionArtifact = explorerContext.artifacts.find((artifact) => artifact.id === sessionTabId);
    if (!sessionArtifact) return;
    setOpenArtifacts((current) => (current.some((entry) => entry.id === sessionArtifact.id) ? current : [...current, sessionArtifact]));
    setActiveTabId(sessionArtifact.id);
  }, [activeSessionOpenToken, explorerContext]);

  const collapsePanel = useCallback((ref: RefObject<PanelImperativeHandle | null>) => {
    ref.current?.collapse?.();
  }, []);

  const expandPanel = useCallback((ref: RefObject<PanelImperativeHandle | null>, size: number) => {
    ref.current?.expand?.();
    ref.current?.resize?.(`${size}%`);
  }, []);

  const toggleLeft = useCallback(() => {
    if (leftOpen) {
      const currentSize = leftPanelRef.current?.getSize?.();
      if (currentSize?.asPercentage && currentSize.asPercentage > MIN_LEFT_SIZE) setLeftSize(currentSize.asPercentage);
      collapsePanel(leftPanelRef);
      setLeftOpen(false);
    } else {
      expandPanel(leftPanelRef, Math.max(MIN_LEFT_SIZE, leftSize));
      setLeftOpen(true);
      if (focusMode) setFocusMode(false);
    }
  }, [collapsePanel, expandPanel, focusMode, leftOpen, leftSize]);

  const toggleRight = useCallback(() => {
    if (rightOpen) {
      const currentSize = rightPanelRef.current?.getSize?.();
      if (currentSize?.asPercentage && currentSize.asPercentage > MIN_RIGHT_SIZE) setRightSize(currentSize.asPercentage);
      collapsePanel(rightPanelRef);
      setRightOpen(false);
    } else {
      expandPanel(rightPanelRef, Math.max(MIN_RIGHT_SIZE, rightSize));
      setRightOpen(true);
      if (focusMode) setFocusMode(false);
    }
  }, [collapsePanel, expandPanel, focusMode, rightOpen, rightSize]);

  const toggleTerminal = useCallback(() => {
    if (!hasTerminalContent) return;
    terminalManuallyChangedRef.current = true;
    if (terminalOpen) {
      const currentSize = terminalPanelRef.current?.getSize?.();
      if (currentSize?.asPercentage && currentSize.asPercentage > MIN_TERMINAL_SIZE) setTerminalSize(currentSize.asPercentage);
      collapsePanel(terminalPanelRef);
      setTerminalOpen(false);
    } else {
      expandPanel(terminalPanelRef, Math.max(MIN_TERMINAL_SIZE, terminalSize));
      setTerminalOpen(true);
      if (focusMode) setFocusMode(false);
    }
  }, [collapsePanel, expandPanel, focusMode, hasTerminalContent, terminalOpen, terminalSize]);

  const zoomIn = useCallback(() => {
    setZoomLevel((value) => Math.min(1.5, Math.round((value + 0.1) * 10) / 10));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((value) => Math.max(0.7, Math.round((value - 0.1) * 10) / 10));
  }, []);

  const toggleFocus = useCallback(() => {
    setFocusMode((value) => !value);
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    collapsePanel(leftPanelRef);
    collapsePanel(rightPanelRef);
    collapsePanel(terminalPanelRef);
    setLeftOpen(false);
    setRightOpen(false);
    setTerminalOpen(false);
  }, [collapsePanel, focusMode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod) return;

      if (event.key.toLowerCase() === "b" && !event.shiftKey) {
        event.preventDefault();
        toggleLeft();
      }
      if (event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleRight();
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleTerminal();
      }
      if (event.key.toLowerCase() === "k") {
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleLeft, toggleRight, toggleTerminal]);

  const openArtifact = useCallback((artifact: WorkspaceArtifact) => {
    setOpenArtifacts((current) => {
      if (current.some((entry) => entry.id === artifact.id)) return current;
      return [...current, artifact];
    });
    setActiveTabId(artifact.id);
  }, []);

  const toggleArtifact = useCallback((artifact: WorkspaceArtifact) => {
    setOpenArtifacts((current) => {
      if (current.some((entry) => entry.id === artifact.id)) {
        setActiveTabId(artifact.id);
        return current;
      }
      return [...current, artifact];
    });
    setActiveTabId(artifact.id);
  }, []);

  const closeArtifact = useCallback((artifactId: string) => {
    setOpenArtifacts((current) => current.filter((artifact) => artifact.id !== artifactId));
    setActiveTabId((current) => (current === artifactId ? MAIN_TAB_ID : current));
  }, []);

  const activeArtifact = useMemo(
    () => openArtifacts.find((artifact) => artifact.id === activeTabId) ?? null,
    [activeTabId, openArtifacts]
  );

  const miniTerminalSummary = terminalSummary || (activeTerminalJobId ? `Scoring: LIVE | Job: ${activeTerminalJobId.slice(0, 8)} | SSE: connected` : "Terminal idle");
  const activeArtifactId = activeTabId === MAIN_TAB_ID ? null : activeTabId;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0d1117] text-vercel-text">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="h-full w-12 flex-shrink-0">
          <ActivityBar
            mode={mode}
            onToggleLeft={toggleLeft}
            onToggleRight={toggleRight}
            onToggleTerminal={toggleTerminal}
            onToggleFocus={toggleFocus}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            leftOpen={leftOpen}
            rightOpen={rightOpen}
            terminalOpen={terminalOpen}
            focusMode={focusMode}
          />
        </div>

        <PanelGroup orientation="horizontal" className="min-h-0 min-w-0 flex-1">
          <Panel
            id="left-sidebar"
            panelRef={leftPanelRef}
            defaultSize={`${DEFAULT_LEFT_SIZE}%`}
            minSize={`${MIN_LEFT_SIZE}%`}
            maxSize="34%"
            collapsible
            collapsedSize="0%"
            onResize={(size: PanelSize) => {
              if (size.asPercentage > MIN_LEFT_SIZE) setLeftSize(size.asPercentage);
              setLeftOpen(size.asPercentage > 0.5);
            }}
            className="min-w-0"
          >
            <LeftSidebar
              mode={mode}
              explorerContext={explorerContext}
              activeArtifactId={activeArtifactId}
              onOpenArtifact={openArtifact}
            />
          </Panel>

          <PanelResizeHandle className="ide-panel-handle ide-panel-handle-x" />

          <Panel id="workspace" minSize="40%" className="min-w-0">
            <PanelGroup orientation="vertical" className="min-h-0 w-full">
              <Panel id="editor-row" defaultSize={terminalContent ? "72%" : "100%"} minSize="28%" className="min-h-0">
                <PanelGroup orientation="horizontal" className="min-h-0 min-w-0">
                  <Panel id="editor-main" minSize="50%" className="min-w-0">
                    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                      <div className="flex items-center border-b border-[#30363d] bg-[#161b22]">
                        <button
                          type="button"
                          onClick={() => setActiveTabId(MAIN_TAB_ID)}
                          className={`flex items-center gap-2 border-r border-[#30363d] px-3 py-1.5 text-[11px] ${
                            activeTabId === MAIN_TAB_ID ? "bg-[#0d1117] text-[#c9d1d9]" : "text-[#8b949e] hover:text-[#c9d1d9]"
                          }`}
                        >
                          <span>{title}</span>
                        </button>
                        {openArtifacts.map((artifact) => (
                          <button
                            key={artifact.id}
                            type="button"
                            onClick={() => setActiveTabId(artifact.id)}
                            className={`flex items-center gap-2 border-r border-[#30363d] px-3 py-1.5 text-[11px] ${
                              activeTabId === artifact.id ? "bg-[#0d1117] text-[#00ffff]" : "text-[#8b949e] hover:text-[#c9d1d9]"
                            }`}
                          >
                            <span className="max-w-[220px] truncate">{artifact.name}</span>
                            <span
                              className="text-[#8b949e] hover:text-[#ff6b6b]"
                              onClick={(event) => {
                                event.stopPropagation();
                                closeArtifact(artifact.id);
                              }}
                            >
                              x
                            </span>
                          </button>
                        ))}
                        <div className="px-3 text-[11px] text-[#8b949e]">{subtitle}</div>
                        {focusMode && (
                          <div className="ml-auto px-3 text-[10px] uppercase tracking-[0.1em] text-[#00ffff]">
                            Focus Mode
                          </div>
                        )}
                      </div>

                      <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-[#0d1117]" style={{ zoom: zoomLevel }}>
                        {activeArtifact
                          ? (renderArtifact?.(activeArtifact) ?? <ArtifactPreviewPanel artifact={activeArtifact} />)
                          : mainEditor}
                      </div>
                    </div>
                  </Panel>

                  <PanelResizeHandle className="ide-panel-handle ide-panel-handle-x" />

                  <Panel
                    id="right-sidebar"
                    panelRef={rightPanelRef}
                    defaultSize={rightDefaultOpen ? `${DEFAULT_RIGHT_SIZE}%` : "0%"}
                    minSize={`${MIN_RIGHT_SIZE}%`}
                    maxSize="38%"
                    collapsible
                    collapsedSize="0%"
                    onResize={(size: PanelSize) => {
                      if (size.asPercentage > MIN_RIGHT_SIZE) setRightSize(size.asPercentage);
                      setRightOpen(size.asPercentage > 0.5);
                    }}
                    className="min-w-0"
                  >
                    <RightSidebar jobsPanel={jobsPanel} activeJobId={activeTerminalJobId} />
                  </Panel>
                </PanelGroup>
              </Panel>

              {terminalContent && <PanelResizeHandle className="ide-panel-handle ide-panel-handle-y" />}

              {terminalContent && (
                <Panel
                  id="terminal"
                  panelRef={terminalPanelRef}
                  defaultSize={`${DEFAULT_TERMINAL_SIZE}%`}
                  minSize={`${MIN_TERMINAL_SIZE}%`}
                  maxSize="58%"
                  collapsible
                  collapsedSize="6%"
                  onResize={(size: PanelSize) => {
                    if (size.asPercentage > MIN_TERMINAL_SIZE) setTerminalSize(size.asPercentage);
                    setTerminalOpen(size.asPercentage > 6.1);
                  }}
                  className="min-h-0"
                >
                  {terminalOpen ? (
                    <BottomPanel onClose={toggleTerminal} jobId={activeTerminalJobId}>
                      {terminalContent}
                    </BottomPanel>
                  ) : (
                    <button
                      type="button"
                      onClick={toggleTerminal}
                      className="flex h-full w-full items-center justify-between border-t border-[#30363d] bg-[#11161d] px-3 text-left"
                    >
                      <span className="text-[10px] uppercase tracking-[0.14em] text-[#8b949e]">Terminal</span>
                      <span className="font-mono text-[11px] text-[#00ffff]">{miniTerminalSummary}</span>
                    </button>
                  )}
                </Panel>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      <div className="flex h-[22px] items-center justify-between border-t border-[#30363d] bg-[#161b22] px-3 text-[11px] text-[#8b949e]">
        <div className="flex items-center gap-3">
          <span>WS: exportflow</span>
          <span className="text-[#00ff00]">SSE: LIVE</span>
          {activeTerminalJobId && (
            <span className="font-mono text-[10px] text-[#00ffff]">
              job:{activeTerminalJobId.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>{Math.round(zoomLevel * 100)}%</span>
          <span>{focusMode ? "Focus" : "Normal"}</span>
        </div>
      </div>
    </div>
  );
}
