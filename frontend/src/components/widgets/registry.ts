import { 
  Activity, 
  Filter, 
  Gauge, 
  Briefcase, 
  Terminal, 
  Zap, 
  BarChart3, 
  Globe, 
  Mail,
  type LucideIcon 
} from "lucide-react";

export type WidgetType = 
  | "active-agents"
  | "lead-funnel"
  | "quality-metrics"
  | "recent-jobs"
  | "system-health"
  | "quick-actions"
  | "daily-stats"
  | "network-status"
  | "outreach-summary";

export type GridItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
};

export type DashboardLayout = GridItem[];

export type WidgetConfig = {
  type: WidgetType;
  title: string;
  description: string;
  icon: LucideIcon;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
};

export const WIDGET_REGISTRY: Record<WidgetType, WidgetConfig> = {
  "active-agents": {
    type: "active-agents",
    title: "Active Agent Status",
    description: "Live view of running jobs and worker lanes",
    icon: Activity,
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 4,
  },
  "lead-funnel": {
    type: "lead-funnel",
    title: "Lead Funnel",
    description: "Conversion pipeline from search to delivery",
    icon: Filter,
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 4,
  },
  "quality-metrics": {
    type: "quality-metrics",
    title: "Quality Metrics",
    description: "Lead quality radar and data completion",
    icon: Gauge,
    defaultW: 4,
    defaultH: 5,
    minW: 3,
    minH: 4,
  },
  "recent-jobs": {
    type: "recent-jobs",
    title: "Recent Jobs & Exports",
    description: "Last completed jobs with quick downloads",
    icon: Briefcase,
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
  },
  "system-health": {
    type: "system-health",
    title: "System Health & Quotas",
    description: "API credits, proxies, and uptime monitor",
    icon: Terminal,
    defaultW: 4,
    defaultH: 4,
    minW: 3,
    minH: 3,
  },
  "quick-actions": {
    type: "quick-actions",
    title: "Quick Actions",
    description: "Shortcuts to common workflows",
    icon: Zap,
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
  },
  "daily-stats": {
    type: "daily-stats",
    title: "Daily Stats",
    description: "Today's lead volume and performance",
    icon: BarChart3,
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
  },
  "network-status": {
    type: "network-status",
    title: "Network Status",
    description: "Scraper nodes and service health",
    icon: Globe,
    defaultW: 4,
    defaultH: 4,
    minW: 3,
    minH: 3,
  },
  "outreach-summary": {
    type: "outreach-summary",
    title: "Outreach Summary",
    description: "Campaign progress and email metrics",
    icon: Mail,
    defaultW: 4,
    defaultH: 4,
    minW: 3,
    minH: 3,
  },
};

export const DEFAULT_LAYOUT: DashboardLayout = [
  { i: "quick-actions", x: 0, y: 0, w: 4, h: 3, minW: 3, minH: 2 },
  { i: "daily-stats", x: 4, y: 0, w: 4, h: 3, minW: 3, minH: 2 },
  { i: "system-health", x: 8, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
  { i: "active-agents", x: 0, y: 3, w: 6, h: 5, minW: 4, minH: 4 },
  { i: "lead-funnel", x: 6, y: 3, w: 6, h: 5, minW: 4, minH: 4 },
  { i: "recent-jobs", x: 0, y: 8, w: 8, h: 6, minW: 4, minH: 4 },
  { i: "quality-metrics", x: 8, y: 8, w: 4, h: 5, minW: 3, minH: 4 },
];
