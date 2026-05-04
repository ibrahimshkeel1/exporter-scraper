"use client";

import { useCallback, useState } from "react";
import { AuthPanel } from "../../components/AuthPanel";
import { AgenticChat } from "../../components/AgenticChat";

export default function DashboardPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const refresh = useCallback(() => setRefreshSignal((value) => value + 1), []);

  return (
    <main className="flex flex-col gap-8 w-full pb-12 max-w-5xl mx-auto h-[90vh]">
      <AuthPanel onSessionChange={refresh} />
      <AgenticChat onJobCreated={refresh} />
    </main>
  );
}
