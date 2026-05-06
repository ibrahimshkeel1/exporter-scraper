"use client";

import { WidgetDashboard } from "../../components/widgets/WidgetDashboard";
import { JobTable } from "../../components/JobTable";
import { VSCodeLayout } from "../../components/VSCodeLayout";

export default function DashboardPage() {
  return (
    <VSCodeLayout
      mode="dashboard"
      title="Dashboard Hub"
      subtitle="Widget grid — drag, resize, customize"
      mainEditor={<WidgetDashboard />}
      jobsPanel={<JobTable refreshSignal={0} compact />}
    />
  );
}
