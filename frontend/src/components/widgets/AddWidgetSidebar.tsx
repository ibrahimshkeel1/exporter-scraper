"use client";

import { Search, X, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { WIDGET_REGISTRY, WidgetType } from "./registry";

type AddWidgetSidebarProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (type: WidgetType) => void;
  existingTypes: WidgetType[];
};

export function AddWidgetSidebar({ open, onClose, onAdd, existingTypes }: AddWidgetSidebarProps) {
  const [query, setQuery] = useState("");

  const available = useMemo(() => {
    const all = Object.values(WIDGET_REGISTRY);
    const filtered = all.filter((w) => !existingTypes.includes(w.type));
    if (!query.trim()) return filtered;
    const q = query.toLowerCase();
    return filtered.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q)
    );
  }, [existingTypes, query]);

  return (
    <div
      className={`absolute right-0 top-0 h-full flex-shrink-0 overflow-hidden transition-all duration-200 z-30 ${
        open ? "w-72" : "w-0"
      }`}
    >
      <div className="flex h-full w-72 flex-col border-l border-[#3c3c3c] bg-[#252526]">
        <div className="flex items-center justify-between border-b border-[#3c3c3c] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-vercel-text">
            Widget Catalog
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#858585] hover:text-[#569cd6]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="flex items-center gap-2 border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1.5">
            <Search size={12} className="text-[#858585]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search widgets..."
              className="flex-1 bg-transparent text-[11px] text-vercel-text placeholder:text-[#858585] outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {available.length === 0 && (
            <p className="py-4 text-center text-[11px] text-vercel-muted">
              {query.trim() ? "No matching widgets." : "All widgets are on your dashboard."}
            </p>
          )}
          {available.map((widget) => {
            const Icon = widget.icon;
            return (
              <button
                key={widget.type}
                type="button"
                onClick={() => {
                  onAdd(widget.type);
                  setQuery("");
                }}
                className="flex w-full items-start gap-2.5 border border-[#3c3c3c] bg-[#1e1e1e] p-2.5 text-left transition-colors hover:border-[#569cd6] hover:bg-[#252526]"
              >
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center border border-[#3c3c3c] bg-[#252526]">
                  <Icon size={14} className="text-[#858585]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-vercel-text">{widget.title}</div>
                  <div className="mt-0.5 text-[10px] text-vercel-muted leading-tight">
                    {widget.description}
                  </div>
                </div>
                <Plus size={12} className="ml-auto mt-0.5 flex-shrink-0 text-[#858585]" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
