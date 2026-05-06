import { AdminConsole } from "../../components/AdminConsole";
import { VSCodeLayout } from "../../components/VSCodeLayout";

export default function AdminPage() {
  return (
    <VSCodeLayout
      mode="admin"
      title="Operator Console"
      subtitle="Queue control, retries, and job diagnostics"
      mainEditor={
        <div className="h-full overflow-auto">
          <AdminConsole />
        </div>
      }
      jobsPanel={
        <div className="flex h-full items-center justify-center text-xs text-[#8b949e]">
          No jobs panel
        </div>
      }
    />
  );
}
