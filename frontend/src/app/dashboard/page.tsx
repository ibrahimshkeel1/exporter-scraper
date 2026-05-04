"use client";

import { AgenticChat } from "../../components/AgenticChat";
import { WorkspaceShell } from "../../components/WorkspaceShell";

export default function DashboardPage() {
  return (
    <WorkspaceShell mode="dashboard" title="Agentic Lead Search" subtitle="Single SSE stream, dual live lanes">
      <AgenticChat />
    </WorkspaceShell>
  );
}
