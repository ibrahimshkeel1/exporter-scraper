import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExportFlow | Verified Buyer Leads",
  description: "Self-serve verified apparel and textile buyer lead packs for Pakistan exporters."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <header className="topbar">
            <a className="brand" href="/">
              <span className="brand-mark">
                <BarChart3 size={20} aria-hidden="true" />
              </span>
              <span>ExportFlow</span>
            </a>
            <nav className="nav" aria-label="Primary navigation">
              <a className="btn btn-secondary" href="/dashboard">
                Dashboard
              </a>
              <a className="btn btn-secondary" href="/admin">
                Admin
              </a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
