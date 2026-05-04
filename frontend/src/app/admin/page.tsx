import { AdminConsole } from "../../components/AdminConsole";
import { WorkspaceShell } from "../../components/WorkspaceShell";

export default function AdminPage() {
  return (
    <WorkspaceShell mode="admin" title="Operator Console" subtitle="Queue control, retries, and job diagnostics">
      <AdminConsole />
    </WorkspaceShell>
  );
}
