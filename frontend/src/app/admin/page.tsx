import { AdminConsole } from "../../components/AdminConsole";

export default function AdminPage() {
  return (
    <main className="flex flex-col gap-8 w-full pb-12">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold text-vercel-muted tracking-widest uppercase">Operator console</span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-vercel-text">Approve payments and control lead jobs.</h1>
        <p className="text-vercel-muted text-lg">Use this for first-circle demos, payment checks, retries, and manual delivery overrides.</p>
      </div>
      <AdminConsole />
    </main>
  );
}
