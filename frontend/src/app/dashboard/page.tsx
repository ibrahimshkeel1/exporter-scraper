"use client";

import { useState } from "react";
import { AgenticChat } from "../../components/AgenticChat";
import { JobTable } from "../../components/JobTable";
import { WorkspaceShell } from "../../components/WorkspaceShell";

export default function DashboardPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <WorkspaceShell mode="dashboard" title="Agentic Lead Search" subtitle="Single SSE stream, dual live lanes">
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-rows-[minmax(0,1fr)_minmax(300px,38vh)]">
        <AgenticChat onJobCreated={() => setRefreshSignal((value) => value + 1)} />
        <div className="min-h-0 overflow-y-auto">
          <JobTable refreshSignal={refreshSignal} />
        </div>
      </div>
    </WorkspaceShell>
  );
}
