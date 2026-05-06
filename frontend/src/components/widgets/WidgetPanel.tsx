"use client";

import { GripVertical, X } from "lucide-react";
import { ReactNode } from "react";
import { WIDGET_REGISTRY, WidgetType } from "./registry";

type WidgetPanelProps = {
  type: WidgetType;
  children: ReactNode;
  editMode: boolean;
  onRemove: () => void;
};

export function WidgetPanel({ type, children, editMode, onRemove }: WidgetPanelProps) {
  const config = WIDGET_REGISTRY[type];
  const Icon = config.icon;

  return (
    <div className="flex h-full flex-col border border-[#30363d] bg-[#161b22] overflow-hidden">
      {/* Widget header */}
      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#0d1117] px-2 py-1.5">
        <div className="flex items-center gap-2">
          {editMode && (
            <div className="cursor-grab active:cursor-grabbing text-[#8b949e] hover:text-[#00ffff]">
              <GripVertical size={14} />
            </div>
          )}
          <Icon size={12} className="text-[#8b949e]" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-vercel-muted">
            {config.title}
          </span>
        </div>
        {editMode && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[#8b949e] hover:text-[#ff6b6b] transition-colors"
            title="Remove widget"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Widget content */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {children}
      </div>
    </div>
  );
}
