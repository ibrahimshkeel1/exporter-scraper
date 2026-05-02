"use client";

import { useState } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { JobTable } from "@/components/JobTable";
import { LeadRequestWizard } from "@/components/LeadRequestWizard";

export default function DashboardPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const refresh = () => setRefreshSignal((value) => value + 1);

  return (
    <main className="shell stack">
      <div className="row">
        <div className="tight-stack">
          <span className="eyebrow">Customer dashboard</span>
          <h1 style={{ fontSize: 42 }}>Create and track verified buyer lead packs.</h1>
        </div>
      </div>
      <AuthPanel onSessionChange={refresh} />
      <LeadRequestWizard onJobCreated={refresh} />
      <JobTable refreshSignal={refreshSignal} />
    </main>
  );
}
