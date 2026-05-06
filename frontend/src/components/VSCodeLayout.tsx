"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Group as PanelGroup,
  Panel,
  PanelImperativeHandle,
  PanelSize,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { ActivityBar } from "./ActivityBar";
import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./RightSidebar";
import { BottomPanel } from "./BottomPanel";
import { WorkspaceArtifact, WorkspaceContext, WorkspaceMode } from "./workspace-types";

const MAIN_TAB_ID = "__main_editor__";
const DEFAULT_LEFT_SIZE = 20;
const DEFAULT_RIGHT_SIZE = 24;
const DEFAULT_TERMINAL_SIZE = 28;
const MIN_LEFT_SIZE = 12;
const MIN_RIGHT_SIZE = 16;
const MIN_TERMINAL_SIZE = 14;

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
};

function artifactPreview(artifact: WorkspaceArtifact) {
  const body = artifact.content || "No inline preview available for this artifact.";
  return (
    <div className="h-full overflow-auto bg-[#0d1117] p-4">
      <div className="mb-3 border border-[#30363d] bg-black/35 p-3 text-xs">
        <p className="text-[10px] uppercase tracking-[0.14em] text-[#8b949e]">{artifact.folder}</p>
        <p className="mt-1 font-mono text-[#00ffff]">{artifact.name}</p>
        {artifact.meta && <p className="mt-1 text-[#8b949e]">{artifact.meta}</p>}
      </div>
      <pre className="whitespace-pre-wrap break-words border border-[#30363d] bg-black/40 p-3 text-xs leading-5 text-[#c9d1d9]">
        {body}
      </pre>
      {artifact.externalUrl && (
        <a
          href={artifact.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs text-[#c9d1d9] hover:border-[#00ffff] hover:text-[#00ffff]"
        >
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
}: VSCodeLayoutProps) {
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const terminalPanelRef = useRef<PanelImperativeHandle | null>(null);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [leftSize, setLeftSize] = useState(DEFAULT_LEFT_SIZE);
  const [rightSize, setRightSize] = useState(DEFAULT_RIGHT_SIZE);
  const [terminalSize, setTerminalSize] = useState(DEFAULT_TERMINAL_SIZE);
  const [openArtifacts, setOpenArtifacts] = useState<WorkspaceArtifact[]>([]);
  const [activeTabId, setActiveTabId] = useState(MAIN_TAB_ID);

  useEffect(() => {
    if (!terminalContent) {
      setTerminalOpen(false);
    }
  }, [terminalContent]);

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

  const collapsePanel = useCallback((ref: React.RefObject<PanelImperativeHandle | null>) => {
    ref.current?.collapse?.();
  }, []);

  const expandPanel = useCallback((ref: React.RefObject<PanelImperativeHandle | null>, size: number) => {
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
    if (!terminalContent) return;
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
  }, [collapsePanel, expandPanel, focusMode, terminalContent, terminalOpen, terminalSize]);

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
            <PanelGroup orientation="vertical" className="min-h-0">
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

                      <div className="flex min-h-0 flex-1 overflow-hidden bg-[#0d1117]" style={{ zoom: zoomLevel }}>
                        {activeArtifact
                          ? (renderArtifact?.(activeArtifact) ?? artifactPreview(activeArtifact))
                          : mainEditor}
                      </div>
                    </div>
                  </Panel>

                  <PanelResizeHandle className="ide-panel-handle ide-panel-handle-x" />

                  <Panel
                    id="right-sidebar"
                    panelRef={rightPanelRef}
                    defaultSize={`${DEFAULT_RIGHT_SIZE}%`}
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
