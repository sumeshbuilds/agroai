import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Geist_Mono, Noto_Sans_Oriya } from "next/font/google";

import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const oriya = Noto_Sans_Oriya({
  variable: "--font-oriya",
  subsets: ["oriya"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AgroAI — Protect your land. Care for your plants.",
    template: "%s · AgroAI",
  },
  description:
    "Your farm workstation: map your land, watch it with a phone camera, get hyper-local weather, day-by-day crop care, and animal or person alerts.",
  applicationName: "AgroAI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AgroAI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#18291f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${oriya.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
