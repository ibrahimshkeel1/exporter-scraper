"use client";

import { useCallback, useState } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { JobTable } from "@/components/JobTable";
import { LeadRequestWizard } from "@/components/LeadRequestWizard";

export default function DashboardPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const refresh = useCallback(() => setRefreshSignal((value) => value + 1), []);

  return (
    <main className="flex flex-col gap-8 w-full pb-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-vercel-muted tracking-widest uppercase">Customer dashboard</span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-vercel-text">Create and track verified buyer lead packs.</h1>
        </div>
      </div>
      <AuthPanel onSessionChange={refresh} />
      <LeadRequestWizard onJobCreated={refresh} />
      <JobTable refreshSignal={refreshSignal} />
    </main>
  );
}
