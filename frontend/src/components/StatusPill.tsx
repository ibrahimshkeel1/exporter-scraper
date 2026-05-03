import { LeadJobStatus } from "@/lib/types";

export function StatusPill({ status }: { status: LeadJobStatus | string }) {
  let colorClass = "bg-gray-100 text-gray-800 border-gray-200";
  if (status === "delivered" || status === "completed" || status === "approved") {
    colorClass = "bg-green-100 text-green-800 border-green-200";
  } else if (status === "running" || status === "processing" || status === "queued") {
    colorClass = "bg-blue-100 text-blue-800 border-blue-200";
  } else if (status === "failed" || status === "rejected") {
    colorClass = "bg-red-100 text-red-800 border-red-200";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize whitespace-nowrap ${colorClass}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
