"use client";

import { useState } from "react";
import { WidgetDashboard } from "../../components/widgets/WidgetDashboard";
import { JobTable } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";

export default function DashboardPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <VSCodeLayout
      mode="dashboard"
      title="Dashboard Hub"
      subtitle="Widget grid — drag, resize, customize"
      mainEditor={<WidgetDashboard />}
      jobsPanel={<JobTable refreshSignal={refreshSignal} compact />}
    />
  );
}
