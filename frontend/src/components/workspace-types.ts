export type WorkspaceMode = "dashboard" | "search" | "outreach" | "admin" | "settings";

export type WorkspaceArtifactKind = "csv" | "xlsx" | "json" | "markdown" | "log" | "text" | "report";

export type WorkspaceArtifactDownload =
  | {
      kind: "export";
      jobId: string;
      exportId: string;
      filename?: string;
    }
  | {
      kind: "report";
      jobId: string;
      filename?: string;
    }
  | {
      kind: "external";
      url: string;
      filename?: string;
    };

export type WorkspaceArtifactPreview = {
  kind: "export";
  jobId: string;
  exportId: string;
  format: string;
};

export type WorkspaceArtifact = {
  id: string;
  name: string;
  folder: "Results" | "Insights" | "Logs" | string;
  kind: WorkspaceArtifactKind;
  content?: string;
  externalUrl?: string;
  meta?: string;
  sessionJobId?: string;
  download?: WorkspaceArtifactDownload;
  preview?: WorkspaceArtifactPreview;
};

export type WorkspaceSession = {
  id: string;
  label: string;
  description?: string;
  status?: string;
};

export type WorkspaceContext = {
  id: string;
  label: string;
  description?: string;
  artifacts: WorkspaceArtifact[];
  sessions?: WorkspaceSession[];
  activeSessionId?: string;
};
