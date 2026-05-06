"use client";

import { ReactNode, useState } from "react";
import { X, FileJson2, FileSpreadsheet } from "lucide-react";

type SplitViewItem = {
  id: string;
  title: string;
  type: "csv" | "json" | "xlsx" | "log" | "report";
  content?: ReactNode;
};

type RightSidebarProps = {
  jobsPanel: ReactNode;
  activeJobId?: string | null;
};

export function RightSidebar({ jobsPanel }: RightSidebarProps) {
  const [splitViews, setSplitViews] = useState<SplitViewItem[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  function openSplitView(item: SplitViewItem) {
    setSplitViews((prev) => {
      if (prev.some((v) => v.id === item.id)) return prev;
      return [...prev, item];
    });
    setActiveViewId(item.id);
  }

  function closeSplitView(id: string) {
    setSplitViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      if (activeViewId === id) {
        setActiveViewId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }

  const activeView = splitViews.find((v) => v.id === activeViewId) ?? null;

  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      {/* Jobs panel always visible in right sidebar */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {jobsPanel}
      </div>

      {/* Split view panel for file previews */}
      {splitViews.length > 0 && (
        <div className="border-t border-[#30363d]" style={{ height: "45%", minHeight: "180px" }}>
          <div className="flex h-full flex-col">
            {/* Tab bar */}
            <div className="flex items-center border-b border-[#30363d] bg-[#161b22]">
              {splitViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveViewId(view.id)}
                  className={`flex items-center gap-1.5 border-r border-[#30363d] px-3 py-1.5 text-[11px] ${
                    activeViewId === view.id
                      ? "bg-[#0d1117] text-[#00ffff]"
                      : "text-[#8b949e] hover:text-[#c9d1d9]"
                  }`}
                >
                  {view.type === "json" && <FileJson2 size={12} />}
                  {view.type === "xlsx" && <FileSpreadsheet size={12} />}
                  {view.type === "csv" && <FileSpreadsheet size={12} />}
                  <span className="max-w-[100px] truncate">{view.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSplitView(view.id);
                    }}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center text-[#8b949e] hover:text-[#ff6b6b]"
                  >
                    <X size={10} />
                  </button>
                </button>
              ))}
            </div>
            {/* Content area */}
            <div className="min-h-0 flex-1 overflow-auto bg-[#0d1117] p-2">
              {activeView ? (
                activeView.content ?? (
                  <div className="flex h-full items-center justify-center text-xs text-[#8b949e]">
                    Preview for {activeView.title}
                  </div>
                )
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[#8b949e]">
                  Select a file to preview
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
