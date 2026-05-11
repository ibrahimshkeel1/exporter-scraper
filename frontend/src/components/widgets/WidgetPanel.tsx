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
    <div className="flex h-full flex-col overflow-hidden rounded border border-[#3c3c3c] bg-[#252526]">
      {/* Widget header */}
      <div className="flex items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-2 py-1.5">
        <div className="flex items-center gap-2">
          {editMode && (
            <div className="cursor-grab active:cursor-grabbing text-[#858585] hover:text-[#569cd6]">
              <GripVertical size={14} />
            </div>
          )}
          <Icon size={12} className="text-[#858585]" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-vercel-muted">
            {config.title}
          </span>
        </div>
        {editMode && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[#858585] hover:text-[#ff6b6b] transition-colors"
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
