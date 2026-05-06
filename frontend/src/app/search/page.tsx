"use client";

import { useState } from "react";
import { AgenticChat, DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";
import { useLeadSessionWorkspace } from "../../components/lead-session-workspace";

export default function SearchPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const workspace = useLeadSessionWorkspace();

  return (
    <VSCodeLayout
      mode="search"
      title="Agentic Lead Search"
      subtitle="Single SSE stream, dual live lanes"
      activeTerminalJobId={workspace.terminalJobId}
      explorerContext={workspace.explorerContext}
      activeSessionOpenToken={workspace.sessionOpenToken}
      terminalSummary={workspace.terminalSummary}
      mainEditor={
        <AgenticChat
          onJobCreated={() => setRefreshSignal((value) => value + 1)}
          onActiveJobChange={(jobId) => {
            if (jobId) workspace.selectJob(jobId, false);
          }}
        />
      }
      jobsPanel={
        <JobTable
          refreshSignal={refreshSignal}
          compact
          showFilesPane={false}
          {...workspace.jobTableProps}
        />
      }
      terminalContent={
        workspace.terminalJobId ? (
          <DualLiveTerminal jobId={workspace.terminalJobId} initialEvents={workspace.terminalEvents} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[#8b949e]">
            No lead session yet. Start a search or select a recent job.
          </div>
        )
      }
    />
  );
}
