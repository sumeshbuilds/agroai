import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Outfit } from "next/font/google";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AgroAI — Smart farming for every field",
    template: "%s · AgroAI",
  },
  description:
    "Map your farmland, get hyper-local 7-day weather, AI weekly crop advice, and a live phone-powered camera that tracks animals and people on your field.",
  applicationName: "AgroAI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AgroAI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#047857",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
