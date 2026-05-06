"use client";

import { WidgetDashboard } from "../../components/widgets/WidgetDashboard";
import { JobTable } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { DualLiveTerminal } from "../../components/AgenticChat";
import { useLeadSessionWorkspace } from "../../components/lead-session-workspace";

export default function DashboardPage() {
  const workspace = useLeadSessionWorkspace();

  return (
    <VSCodeLayout
      mode="dashboard"
      title="Dashboard Hub"
      subtitle="Widget grid — drag, resize, customize"
      activeTerminalJobId={workspace.terminalJobId}
      explorerContext={workspace.explorerContext}
      activeSessionOpenToken={workspace.sessionOpenToken}
      terminalSummary={workspace.terminalSummary}
      mainEditor={<WidgetDashboard />}
      jobsPanel={<JobTable refreshSignal={0} compact showFilesPane={false} {...workspace.jobTableProps} />}
      terminalContent={
        workspace.terminalJobId ? (
          <DualLiveTerminal jobId={workspace.terminalJobId} initialEvents={workspace.terminalEvents} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#8b949e]">
            Select a recent job to inspect saved and live logs.
          </div>
        )
      }
    />
  );
}
