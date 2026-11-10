import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { DM_Sans, Geist_Mono, Noto_Sans_Oriya } from "next/font/google";

import { I18nProvider } from "@/lib/i18n/provider";
import { LANG_COOKIE, htmlLang, normalizeLang } from "@/lib/i18n/core";

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

// The root layout personalises <html lang> from the language cookie, so the
// app is rendered per request rather than as a static shell.
export const instant = false;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const lang = normalizeLang(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <html
      lang={htmlLang(lang)}
      className={`${dmSans.variable} ${oriya.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <I18nProvider initialLang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
