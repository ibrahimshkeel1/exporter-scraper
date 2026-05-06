"use client";

import { useState } from "react";
import { AgenticChat, DualLiveTerminal } from "../../components/AgenticChat";
import { JobTable } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";

export default function DashboardPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [activeTerminalJobId, setActiveTerminalJobId] = useState<string | undefined>(undefined);

  return (
    <VSCodeLayout
      mode="dashboard"
      title="Agentic Lead Search"
      subtitle="Single SSE stream, dual live lanes"
      activeTerminalJobId={activeTerminalJobId}
      mainEditor={
        <AgenticChat
          onJobCreated={() => setRefreshSignal((value) => value + 1)}
          onActiveJobChange={(jobId) => setActiveTerminalJobId(jobId)}
        />
      }
      jobsPanel={<JobTable refreshSignal={refreshSignal} compact />}
      terminalContent={
        activeTerminalJobId ? (
          <DualLiveTerminal jobId={activeTerminalJobId} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[#8b949e]">
            No active job. Start a search to see live worker lanes.
          </div>
        )
      }
    />
  );
}
