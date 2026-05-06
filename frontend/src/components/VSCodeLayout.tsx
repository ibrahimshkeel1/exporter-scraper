"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { ActivityBar } from "./ActivityBar";
import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./RightSidebar";
import { BottomPanel } from "./BottomPanel";

type WorkspaceMode = "dashboard" | "outreach" | "admin";

type VSCodeLayoutProps = {
  mode: WorkspaceMode;
  title: string;
  subtitle: string;
  mainEditor: ReactNode;
  jobsPanel: ReactNode;
  terminalContent?: ReactNode;
  activeTerminalJobId?: string | null;
  onJobCreated?: () => void;
};

export function VSCodeLayout({
  mode,
  title,
  subtitle,
  mainEditor,
  jobsPanel,
  terminalContent,
  activeTerminalJobId,
}: VSCodeLayoutProps) {
  // Default sidebar states - always open for full IDE aesthetic
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Focus mode: collapse all peripheral panels
  useEffect(() => {
    if (focusMode) {
      setLeftOpen(false);
      setRightOpen(false);
      setTerminalOpen(false);
    }
  }, [focusMode]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const mod = isMac ? event.metaKey : event.ctrlKey;

      if (mod && event.key.toLowerCase() === "b" && !event.shiftKey) {
        event.preventDefault();
        toggleLeft();
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleRight();
      }
      if (mod && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleTerminal();
      }
      if (mod && event.key.toLowerCase() === "k") {
        setFocusMode(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [leftOpen, rightOpen, terminalOpen]);

  const toggleLeft = useCallback(() => {
    setLeftOpen((v) => {
      const next = !v;
      if (next && focusMode) setFocusMode(false);
      return next;
    });
  }, [focusMode]);

  const toggleRight = useCallback(() => {
    setRightOpen((v) => {
      const next = !v;
      if (next && focusMode) setFocusMode(false);
      return next;
    });
  }, [focusMode]);

  const toggleTerminal = useCallback(() => {
    setTerminalOpen((v) => {
      const next = !v;
      if (next && focusMode) setFocusMode(false);
      return next;
    });
  }, [focusMode]);

  const zoomIn = useCallback(() => {
    setZoomLevel((v) => Math.min(1.5, Math.round((v + 0.1) * 10) / 10));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((v) => Math.max(0.7, Math.round((v - 0.1) * 10) / 10));
  }, []);

  const toggleFocus = useCallback(() => {
    setFocusMode((v) => !v);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0d1117] text-vercel-text">
      {/* Middle section: Activity Bar + Sidebars + Editor */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Activity Bar — fixed narrow icon column */}
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

        {/* Left Sidebar */}
        <div
          className={`h-full flex-shrink-0 overflow-hidden transition-all duration-200 ${
            leftOpen ? "w-64" : "w-0"
          }`}
        >
          <LeftSidebar mode={mode} />
        </div>

        {/* Main Content Area — fills remaining space */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          {/* Editor row + Right Sidebar */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Main Editor — takes all remaining width */}
            <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
              {/* Editor tab bar */}
              <div className="flex items-center border-b border-[#30363d] bg-[#161b22]">
                <div className="flex items-center gap-2 border-r border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-[11px] text-[#c9d1d9]">
                  <span>{title}</span>
                  <span className="text-[#8b949e]">x</span>
                </div>
                <div className="px-3 text-[11px] text-[#8b949e]">{subtitle}</div>
                {focusMode && (
                  <div className="ml-auto px-3 text-[10px] uppercase tracking-[0.1em] text-[#00ffff]">
                    Focus Mode
                  </div>
                )}
              </div>

              {/* Editor content with zoom */}
              <div
                className="flex flex-1 overflow-hidden bg-[#0d1117]"
                style={{ zoom: zoomLevel }}
              >
                {mainEditor}
              </div>
            </div>

            {/* Right Sidebar */}
            <div
              className={`h-full flex-shrink-0 overflow-hidden transition-all duration-200 ${
                rightOpen ? "w-80" : "w-0"
              }`}
            >
              <RightSidebar jobsPanel={jobsPanel} activeJobId={activeTerminalJobId} />
            </div>
          </div>

          {/* Bottom Panel — terminal */}
          {terminalContent && (
            <div
              className={`flex-shrink-0 overflow-hidden transition-all duration-200 ${
                terminalOpen ? "h-64" : "h-0"
              }`}
            >
              <BottomPanel onClose={toggleTerminal} jobId={activeTerminalJobId}>
                {terminalContent}
              </BottomPanel>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
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
