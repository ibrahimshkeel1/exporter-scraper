import { LeadJobStatus } from "@/lib/types";

export function StatusPill({ status }: { status: LeadJobStatus | string }) {
  return <span className={`status status-${status}`}>{status.replaceAll("_", " ")}</span>;
}
