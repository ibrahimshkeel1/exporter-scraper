"use client";

import type { ReactNode } from "react";
import { LeadSessionWorkspaceProvider } from "./lead-session-workspace";

export function AppProviders({ children }: { children: ReactNode }) {
  return <LeadSessionWorkspaceProvider>{children}</LeadSessionWorkspaceProvider>;
}
