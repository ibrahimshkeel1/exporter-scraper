"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { Edit3, Save, RotateCcw, Plus, LayoutGrid } from "lucide-react";
import { createBrowserSupabase, isSupabaseConfigured } from "../../lib/supabase-client";
import {
  WIDGET_REGISTRY,
  WidgetType,
  DashboardLayout,
  DEFAULT_LAYOUT,
  GridItem,
} from "./registry";
import { WidgetPanel } from "./WidgetPanel";
import { AddWidgetSidebar } from "./AddWidgetSidebar";
import { ActiveAgentStatusWidget } from "./ActiveAgentStatusWidget";
import { LeadFunnelWidget } from "./LeadFunnelWidget";
import { QualityMetricsWidget } from "./QualityMetricsWidget";
import { RecentJobsWidget } from "./RecentJobsWidget";
import { SystemHealthWidget } from "./SystemHealthWidget";
import { QuickActionsWidget } from "./QuickActionsWidget";
import { DailyStatsWidget } from "./DailyStatsWidget";
import { NetworkStatusWidget } from "./NetworkStatusWidget";
import { OutreachSummaryWidget } from "./OutreachSummaryWidget";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480 } as const;
const GRID_COLS = { lg: 12, md: 10, sm: 6, xs: 4 } as const;
type GridBreakpoint = keyof typeof GRID_COLS;

const WIDGET_COMPONENTS: Record<WidgetType, React.FC> = {
  "active-agents": ActiveAgentStatusWidget,
  "lead-funnel": LeadFunnelWidget,
  "quality-metrics": QualityMetricsWidget,
  "recent-jobs": RecentJobsWidget,
  "system-health": SystemHealthWidget,
  "quick-actions": QuickActionsWidget,
  "daily-stats": DailyStatsWidget,
  "network-status": NetworkStatusWidget,
  "outreach-summary": OutreachSummaryWidget,
};

function generateId(type: WidgetType) {
  return `${type}--${Math.random().toString(36).slice(2, 8)}`;
}

function layoutToGridItems(layout: DashboardLayout, activeWidgetIds: string[]): GridItem[] {
  return layout
    .filter((item) => activeWidgetIds.includes(item.i))
    .map((item) => {
      const type = item.i.split("--")[0] as WidgetType;
      const config = WIDGET_REGISTRY[type];
      return {
        ...item,
        minW: config?.minW ?? 2,
        minH: config?.minH ?? 2,
        maxW: config?.maxW,
        maxH: config?.maxH,
      };
    });
}

function minWidthForType(type: WidgetType, cols: number) {
  const config = WIDGET_REGISTRY[type];
  return Math.max(1, Math.min(config?.minW ?? 1, cols));
}

function normalizeForBreakpoint(items: GridItem[], breakpoint: GridBreakpoint): GridItem[] {
  const cols = GRID_COLS[breakpoint];
  const referenceCols = GRID_COLS.lg;
  return items.map((item) => {
    const type = item.i.split("--")[0] as WidgetType;
    const minW = minWidthForType(type, cols);
    const scaledW = Math.round((item.w / referenceCols) * cols);
    const w = Math.max(minW, Math.min(cols, scaledW || minW));
    const scaledX = Math.round((item.x / referenceCols) * cols);
    const x = Math.max(0, Math.min(cols - w, scaledX));
    return {
      ...item,
      x,
      w,
      minW,
      minH: item.minH ?? 2,
    };
  });
}

function densePack(items: GridItem[], cols: number): GridItem[] {
  const colHeights = Array.from({ length: cols }, () => 0);
  const ordered = [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  const packed: GridItem[] = [];

  for (const item of ordered) {
    const minW = Math.max(1, Math.min(item.minW ?? 1, cols));
    const w = Math.max(minW, Math.min(item.w, cols));
    const h = Math.max(item.minH ?? 1, item.h);

    let bestX = 0;
    let bestY = Number.POSITIVE_INFINITY;

    for (let x = 0; x <= cols - w; x += 1) {
      const y = Math.max(...colHeights.slice(x, x + w));
      if (y < bestY || (y === bestY && x < bestX)) {
        bestY = y;
        bestX = x;
      }
    }

    for (let x = bestX; x < bestX + w; x += 1) {
      colHeights[x] = bestY + h;
    }

    packed.push({
      ...item,
      x: bestX,
      y: bestY,
      w,
      h,
    });
  }

  return packed;
}

function buildBreakpointLayout(items: GridItem[], breakpoint: GridBreakpoint) {
  const normalized = normalizeForBreakpoint(items, breakpoint);
  return densePack(normalized, GRID_COLS[breakpoint]);
}

export function WidgetDashboard() {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [editMode, setEditMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_LAYOUT.map((i) => i.i));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Use rgl v2's built-in container width hook with measure-before-mount
  const { width: gridWidth, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1200,
  });

  const activeTypes = useMemo(
    () => activeWidgets.map((id) => id.split("--")[0] as WidgetType),
    [activeWidgets]
  );

  async function loadLayout() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    try {
      const res = await fetch("/api/dashboard/layout", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.layout && Array.isArray(payload.layout) && payload.layout.length > 0) {
          const savedLayout = payload.layout as DashboardLayout;
          setLayout(savedLayout);
          setActiveWidgets(savedLayout.map((i) => i.i));
        }
      }
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }

  async function saveLayout(newLayout: DashboardLayout, newWidgets: string[]) {
    if (!supabase) {
      setMessage("Supabase not configured.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSaving(false);
      setMessage("Not authenticated.");
      return;
    }

    try {
      const res = await fetch("/api/dashboard/layout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ layout: newLayout }),
      });
      if (res.ok) {
        setMessage("Layout saved.");
        setLayout(newLayout);
        setActiveWidgets(newWidgets);
      } else {
        const payload = await res.json().catch(() => ({}));
        setMessage(payload.error || "Failed to save layout.");
      }
    } catch (err: any) {
      setMessage(err.message || "Failed to save layout.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  useEffect(() => {
    void loadLayout();
  }, []);

  const handleLayoutChange = useCallback(
    (currentLayout: readonly GridItem[]) => {
      if (!editMode) return;
      const mapped = currentLayout.map((item) => {
        const type = item.i.split("--")[0] as WidgetType;
        const config = WIDGET_REGISTRY[type];
        return {
          i: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          minW: config?.minW ?? 2,
          minH: config?.minH ?? 2,
          maxW: config?.maxW,
          maxH: config?.maxH,
        };
      });
      setLayout(mapped);
    },
    [editMode]
  );

  const dragConfig = useMemo(
    () => ({
      enabled: editMode,
      handle: ".cursor-grab" as string | undefined,
      threshold: 3,
    }),
    [editMode]
  );

  const resizeConfig = useMemo(
    () => ({
      enabled: editMode,
      handles: ["se"] as readonly ("s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne")[],
    }),
    [editMode]
  );

  const toggleEditMode = useCallback(() => {
    if (editMode) {
      // Exiting edit mode - save current layout
      void saveLayout(layout, activeWidgets);
    }
    setEditMode((v) => !v);
    setSidebarOpen(false);
  }, [editMode, layout, activeWidgets]);

  const removeWidget = useCallback(
    (id: string) => {
      const newWidgets = activeWidgets.filter((w) => w !== id);
      const newLayout = layout.filter((l) => l.i !== id);
      setActiveWidgets(newWidgets);
      setLayout(newLayout);
    },
    [activeWidgets, layout]
  );

  const addWidget = useCallback(
    (type: WidgetType) => {
      const config = WIDGET_REGISTRY[type];
      const id = generateId(type);
      const newItem: GridItem = {
        i: id,
        x: 0,
        y: Infinity,
        w: config.defaultW,
        h: config.defaultH,
        minW: config.minW,
        minH: config.minH,
        maxW: config.maxW,
        maxH: config.maxH,
      };
      const newLayout = [...layout, newItem];
      const newWidgets = [...activeWidgets, id];
      setLayout(newLayout);
      setActiveWidgets(newWidgets);
    },
    [layout, activeWidgets]
  );

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    setActiveWidgets(DEFAULT_LAYOUT.map((i) => i.i));
    void saveLayout(DEFAULT_LAYOUT, DEFAULT_LAYOUT.map((i) => i.i));
  }, []);

  const gridLayouts = useMemo(() => {
    const items = layoutToGridItems(layout, activeWidgets);
    return {
      lg: buildBreakpointLayout(items, "lg"),
      md: buildBreakpointLayout(items, "md"),
      sm: buildBreakpointLayout(items, "sm"),
      xs: buildBreakpointLayout(items, "xs"),
    };
  }, [layout, activeWidgets]);

  return (
    <div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-3 py-2">
        <div className="flex items-center gap-2">
          <LayoutGrid size={14} className="text-[#8b949e]" />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-vercel-text">
            Dashboard Hub
          </span>
          {message && (
            <span className="ml-2 text-[10px] text-[#00ff00]">{message}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <>
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="ide-btn inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px]"
              >
                <Plus size={12} />
                Add Widget
              </button>
              <button
                type="button"
                onClick={resetLayout}
                className="ide-btn inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px]"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </>
          )}
          <button
            type="button"
            onClick={toggleEditMode}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              editMode
                ? "border-[#00ff00] text-[#00ff00] hover:bg-[#0f1a0f]"
                : "border-[#30363d] text-vercel-text hover:border-[#00ffff] hover:text-[#00ffff]"
            }`}
          >
            {editMode ? <Save size={12} /> : <Edit3 size={12} />}
            {editMode ? (saving ? "Saving..." : "Save Layout") : "Edit Layout"}
          </button>
        </div>
      </div>

      {/* Grid area with optional sidebar */}
      <div className="relative flex flex-1 overflow-hidden">
        <div ref={containerRef} className="flex-1 overflow-auto p-3">
          {!loaded || !mounted ? (
            <div className="flex h-full items-center justify-center text-xs text-vercel-muted">
              Loading dashboard...
            </div>
          ) : activeWidgets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-vercel-muted">
              <LayoutGrid size={32} className="text-[#30363d]" />
              <p className="text-sm">Your dashboard is empty.</p>
              <button
                type="button"
                onClick={() => {
                  setEditMode(true);
                  setSidebarOpen(true);
                }}
                className="ide-btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs"
              >
                <Plus size={14} />
                Add Your First Widget
              </button>
            </div>
          ) : (
            <Responsive
              className="layout"
              width={gridWidth}
              layouts={gridLayouts}
              breakpoints={GRID_BREAKPOINTS}
              cols={GRID_COLS}
              rowHeight={60}
              margin={[8, 8]}
              containerPadding={[0, 0]}
              dragConfig={dragConfig}
              resizeConfig={resizeConfig}
              onLayoutChange={handleLayoutChange}
            >
              {activeWidgets.map((id) => {
                const type = id.split("--")[0] as WidgetType;
                const Component = WIDGET_COMPONENTS[type];
                if (!Component) return null;
                return (
                  <div key={id}>
                    <WidgetPanel
                      type={type}
                      editMode={editMode}
                      onRemove={() => removeWidget(id)}
                    >
                      <Component />
                    </WidgetPanel>
                  </div>
                );
              })}
            </Responsive>
          )}
        </div>

        <AddWidgetSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onAdd={addWidget}
          existingTypes={activeTypes}
        />
      </div>
    </div>
  );
}
