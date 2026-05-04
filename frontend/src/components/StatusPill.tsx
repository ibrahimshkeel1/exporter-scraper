import { LeadJobStatus } from "../lib/types";

export function StatusPill({ status }: { status: LeadJobStatus | string }) {
  let colorClass = "border-[#30363d] text-[#c9d1d9]";
  if (status === "delivered" || status === "completed" || status === "approved") {
    colorClass = "border-[#00ff00] text-[#00ff00]";
  } else if (status === "running" || status === "processing" || status === "queued") {
    colorClass = "border-[#00ffff] text-[#00ffff]";
  } else if (status === "failed" || status === "rejected") {
    colorClass = "border-[#ff6b6b] text-[#ff6b6b]";
  }

  return (
    <span className={`inline-flex items-center border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] whitespace-nowrap ${colorClass}`}>
      [{status.replaceAll("_", " ")}]
    </span>
  );
}
