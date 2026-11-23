import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AfgProviders } from "@/components/afg/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AFG AI — One AI. Many capabilities.",
  description:
    "AFG AI is an intelligent platform: streaming AI chat with tools, vision and voice, a universal provider gateway (AFG Cloud, 9Router, Ollama), full admin control plane, and native English, Dari, Pashto and Arabic with full RTL.",
  keywords: ["AFG AI", "AI assistant", "9Router", "Ollama", "AI platform", "Dari", "Pashto"],
  authors: [{ name: "AFG AI" }],
  manifest: "/manifest.webmanifest",
  applicationName: "AFG AI",
  appleWebApp: { capable: true, title: "AFG AI", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05060A" },
    { media: "(prefers-color-scheme: light)", color: "#F4F6FB" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <AfgProviders>{children}</AfgProviders>
        <Toaster />
      </body>
    </html>
  );
}
