export type WorkspaceMode = "dashboard" | "search" | "outreach" | "admin" | "settings";

export type WorkspaceArtifactKind = "csv" | "xlsx" | "json" | "markdown" | "log" | "text" | "report";

export type WorkspaceArtifact = {
  id: string;
  name: string;
  folder: "Results" | "Insights" | "Logs" | string;
  kind: WorkspaceArtifactKind;
  content?: string;
  externalUrl?: string;
  meta?: string;
};

export type WorkspaceContext = {
  id: string;
  label: string;
  description?: string;
  artifacts: WorkspaceArtifact[];
};
