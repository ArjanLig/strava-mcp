import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strava for Claude",
  description:
    "Connect your Strava account to Claude and ask questions about your training in plain English.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
