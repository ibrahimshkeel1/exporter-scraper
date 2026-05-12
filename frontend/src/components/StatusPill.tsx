import { LeadJobStatus } from "../lib/types";

export function StatusPill({ status }: { status: LeadJobStatus | string }) {
  let colorClass = "border-[#3c3c3c] text-[#d4d4d4]";
  if (status === "delivered" || status === "completed" || status === "approved") {
    colorClass = "border-[#6a9955] text-[#6a9955]";
  } else if (status === "running" || status === "processing" || status === "queued") {
    colorClass = "border-[#569cd6] text-[#569cd6]";
  } else if (status === "failed" || status === "rejected") {
    colorClass = "border-[#ff6b6b] text-[#ff6b6b]";
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap ${colorClass}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
