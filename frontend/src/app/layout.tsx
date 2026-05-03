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
      <body className="bg-vercel-bg text-vercel-text min-h-screen font-sans antialiased">
        <div className="w-full px-4 sm:px-6 lg:px-12 flex flex-col min-h-screen">
          <header className="flex items-center justify-between py-6 border-b border-vercel-border mb-8 w-full">
            <a className="flex items-center gap-2 font-semibold text-lg hover:opacity-80 transition-opacity" href="/">
              <span className="flex items-center justify-center bg-vercel-accent text-vercel-bg rounded-md w-8 h-8">
                <BarChart3 size={18} aria-hidden="true" />
              </span>
              <span>ExportFlow</span>
            </a>
            <nav className="flex items-center gap-4" aria-label="Primary navigation">
              <a className="bg-vercel-panel border border-vercel-border text-vercel-text hover:bg-gray-800 rounded-md px-4 py-2 text-sm font-medium transition-colors" href="/dashboard">
                Dashboard
              </a>
              <a className="bg-vercel-panel border border-vercel-border text-vercel-text hover:bg-gray-800 rounded-md px-4 py-2 text-sm font-medium transition-colors" href="/admin">
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
