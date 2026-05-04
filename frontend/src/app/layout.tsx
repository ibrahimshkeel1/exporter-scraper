import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExportFlow | Verified Buyer Leads",
  description: "Self-serve verified apparel and textile buyer lead packs for Pakistan exporters."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-vercel-bg text-vercel-text min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
