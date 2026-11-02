import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { DashboardProvider } from "@/components/providers/DashboardProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "OrwellBlue | Mission Control",
  description: "Zero-trust AI agent containment and forensic mission control.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg text-ink">
        <ToastProvider>
          <DashboardProvider>{children}</DashboardProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
