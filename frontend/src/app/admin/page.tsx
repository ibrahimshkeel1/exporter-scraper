import { AdminConsole } from "@/components/AdminConsole";

export default function AdminPage() {
  return (
    <main className="shell stack">
      <div className="tight-stack">
        <span className="eyebrow">Operator console</span>
        <h1 style={{ fontSize: 42 }}>Approve payments and control lead jobs.</h1>
        <p>Use this for first-circle demos, payment checks, retries, and manual delivery overrides.</p>
      </div>
      <AdminConsole />
    </main>
  );
}
