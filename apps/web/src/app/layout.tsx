import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pilot — Finance Autopilot",
  description: "AI agents that actually run your money."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
