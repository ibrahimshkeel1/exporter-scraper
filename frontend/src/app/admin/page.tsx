"use client";

import { AdminConsole } from "../../components/AdminConsole";
import { DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { useLeadSessionWorkspace } from "../../components/lead-session-workspace";

export default function AdminPage() {
  const workspace = useLeadSessionWorkspace();

  return (
    <VSCodeLayout
      mode="admin"
      title="Operator Console"
      subtitle="Queue control, retries, and job diagnostics"
      activeTerminalJobId={workspace.terminalJobId}
      explorerContext={workspace.explorerContext}
      activeSessionOpenToken={workspace.sessionOpenToken}
      onSelectSession={(jobId) => workspace.selectJob(jobId, true)}
      terminalSummary={workspace.terminalSummary}
      mainEditor={
        <div className="h-full w-full overflow-auto">
          <AdminConsole />
        </div>
      }
      jobsPanel={<JobTable refreshSignal={0} compact showFilesPane={false} {...workspace.jobTableProps} />}
      terminalContent={
        workspace.terminalJobId ? (
          <DualLiveTerminal jobId={workspace.terminalJobId} initialEvents={workspace.terminalEvents} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#858585]">
            Select a job from the jobs panel to inspect logs.
          </div>
        )
      }
    />
  );
}
