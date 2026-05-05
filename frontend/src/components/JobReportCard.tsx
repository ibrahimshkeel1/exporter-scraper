"use client";

type JobReportCardProps = {
  report: {
    headline: string;
    executiveSummary: string;
    outcome: string;
    leadCount: number;
    auditCount: number;
    strongestPatterns: string[];
    concerns: string[];
    nextActions: string[];
    qualityAssessment: string;
    confidence: "low" | "medium" | "high";
    recommendedFollowUpSearches: string[];
    notableLeads: string[];
    warnings: string[];
  };
};

function chipTone(confidence: "low" | "medium" | "high") {
  if (confidence === "high") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
  if (confidence === "medium") return "border-cyan-300/20 bg-cyan-300/10 text-cyan-200";
  return "border-amber-300/20 bg-amber-300/10 text-amber-200";
}

export function JobReportCard({ report }: JobReportCardProps) {
  return (
    <section className="ide-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#00ffff]">AI run report</p>
          <h3 className="mt-2 text-lg font-semibold text-vercel-text">{report.headline}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${chipTone(report.confidence)}`}>
          {report.confidence} confidence
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-vercel-text/90">{report.executiveSummary}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Outcome</p>
          <p className="mt-1 text-sm font-semibold text-vercel-text">{report.outcome}</p>
        </div>
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Final leads</p>
          <p className="mt-1 text-sm font-semibold text-vercel-text">{report.leadCount}</p>
        </div>
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Audit rows</p>
          <p className="mt-1 text-sm font-semibold text-vercel-text">{report.auditCount}</p>
        </div>
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Assessment</p>
          <p className="mt-1 text-sm font-semibold text-vercel-text">{report.qualityAssessment}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Strongest patterns</p>
          <ul className="mt-2 space-y-2 text-sm text-vercel-text">
            {report.strongestPatterns.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2">
                <span className="text-cyan-300">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Concerns</p>
          <ul className="mt-2 space-y-2 text-sm text-vercel-text">
            {report.concerns.length > 0 ? report.concerns.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2">
                <span className="text-amber-300">•</span>
                <span>{item}</span>
              </li>
            )) : <li className="text-vercel-muted">No major concerns flagged.</li>}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Next actions</p>
          <ul className="mt-2 space-y-2 text-sm text-vercel-text">
            {report.nextActions.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2">
                <span className="text-emerald-300">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Follow-up searches</p>
          <ul className="mt-2 space-y-2 text-sm text-vercel-text">
            {report.recommendedFollowUpSearches.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2">
                <span className="text-violet-300">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {report.notableLeads.length > 0 && (
        <div className="mt-4 border border-[#30363d] bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Notable leads</p>
          <p className="mt-2 text-sm leading-6 text-vercel-text">{report.notableLeads.join(" • ")}</p>
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="mt-4 border border-[#ff6b6b] bg-[#220b0b] p-3 text-xs leading-5 text-[#ff6b6b]">
          {report.warnings.join(" ")}
        </div>
      )}
    </section>
  );
}
