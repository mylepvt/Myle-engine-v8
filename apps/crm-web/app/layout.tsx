import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";

export const metadata: Metadata = {
  title: "Lead Execution CRM",
  description: "Network marketing conversion engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
