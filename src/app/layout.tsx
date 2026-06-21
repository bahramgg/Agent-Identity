import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Identity — A Ledger makes an agent real",
  description:
    "A minimal demonstration that an AI agent's identity must be anchored in hardware. Software credentials can be copied; only a hardware signature gives an agent a real, unforgeable identity.",
};

export const viewport: Viewport = {
  themeColor: "#03110b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
