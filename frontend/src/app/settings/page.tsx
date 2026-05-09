"use client";

import { useEffect, useMemo, useState } from "react";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { AuthPanel } from "../../components/AuthPanel";
import { DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable } from "../../components/JobTable";
import { WorkspaceContext } from "../../components/workspace-types";
import { mergeWorkspaceContexts, useLeadSessionWorkspace } from "../../components/lead-session-workspace";

function readBooleanSetting(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

function writeBooleanSetting(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

export default function SettingsPage() {
  const workspace = useLeadSessionWorkspace();
  const [autoRefreshJobs, setAutoRefreshJobs] = useState(true);
  const [compactDashboard, setCompactDashboard] = useState(false);
  const [persistWidgetLayout, setPersistWidgetLayout] = useState(true);

  useEffect(() => {
    setAutoRefreshJobs(readBooleanSetting("exportflow:auto_refresh_jobs", true));
    setCompactDashboard(readBooleanSetting("exportflow:compact_dashboard", false));
    setPersistWidgetLayout(readBooleanSetting("exportflow:persist_layout", true));
  }, []);

  useEffect(() => writeBooleanSetting("exportflow:auto_refresh_jobs", autoRefreshJobs), [autoRefreshJobs]);
  useEffect(() => writeBooleanSetting("exportflow:compact_dashboard", compactDashboard), [compactDashboard]);
  useEffect(() => writeBooleanSetting("exportflow:persist_layout", persistWidgetLayout), [persistWidgetLayout]);

  const localContext = useMemo<WorkspaceContext>(
    () => ({
      id: "workspace-settings",
      label: "Workspace Settings",
      description: "Local preferences",
      artifacts: [
        {
          id: "settings-json",
          name: "settings.json",
          folder: "Insights",
          kind: "json",
          content: JSON.stringify(
            {
              autoRefreshJobs,
              compactDashboard,
              persistWidgetLayout,
            },
            null,
            2
          ),
        },
      ],
    }),
    [autoRefreshJobs, compactDashboard, persistWidgetLayout]
  );
  const explorerContext = useMemo(
    () => mergeWorkspaceContexts(workspace.explorerContext, localContext, "Settings"),
    [localContext, workspace.explorerContext]
  );

  const mainEditor = (
    <div className="grid h-full min-h-0 w-full grid-cols-1 gap-4 overflow-auto p-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
      <section className="ide-panel h-fit space-y-4 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#8b949e]">Preferences</p>
          <h1 className="text-lg font-semibold text-vercel-text">Workspace behavior</h1>
        </div>

        <label className="flex items-center justify-between border border-[#30363d] bg-black/30 px-3 py-2 text-sm">
          <span className="text-vercel-text">Auto refresh jobs panel</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={autoRefreshJobs}
            onChange={(event) => setAutoRefreshJobs(event.target.checked)}
          />
        </label>

        <label className="flex items-center justify-between border border-[#30363d] bg-black/30 px-3 py-2 text-sm">
          <span className="text-vercel-text">Compact dashboard widgets</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={compactDashboard}
            onChange={(event) => setCompactDashboard(event.target.checked)}
          />
        </label>

        <label className="flex items-center justify-between border border-[#30363d] bg-black/30 px-3 py-2 text-sm">
          <span className="text-vercel-text">Persist widget layout</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={persistWidgetLayout}
            onChange={(event) => setPersistWidgetLayout(event.target.checked)}
          />
        </label>

        <div className="border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs text-[#8b949e]">
          Keyboard: `Ctrl/Cmd+B` toggle left, `Ctrl/Cmd+Shift+B` toggle right, `Ctrl/Cmd+J` toggle terminal.
        </div>
      </section>

      <div className="space-y-4">
        <AuthPanel />
      </div>
    </div>
  );

  return (
    <VSCodeLayout
      mode="settings"
      title="Settings"
      subtitle="User and workspace preferences"
      activeTerminalJobId={workspace.terminalJobId}
      explorerContext={explorerContext}
      activeSessionOpenToken={workspace.sessionOpenToken}
      onSelectSession={(jobId) => workspace.selectJob(jobId, true)}
      terminalSummary={workspace.terminalSummary}
      mainEditor={mainEditor}
      jobsPanel={<JobTable refreshSignal={0} compact showFilesPane={false} {...workspace.jobTableProps} />}
      terminalContent={
        workspace.terminalJobId ? (
          <DualLiveTerminal jobId={workspace.terminalJobId} initialEvents={workspace.terminalEvents} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#8b949e]">
            Select a lead session to inspect logs.
          </div>
        )
      }
    />
  );
}
