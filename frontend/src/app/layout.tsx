import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Premise: test the beliefs your startup rests on",
  description:
    "An AI agent that turns your pitch into its riskiest assumptions, gathers cited evidence for and against each, and helps you design tests. You make the calls.",
};

// Sets data-theme before paint so there's no flash. Preference: "light" | "dark" | "system".
const themeScript = `(function(){try{var p=localStorage.getItem('premise-theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme',window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-page text-ink`}>{children}</body>
    </html>
  );
}
