import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { QueryProvider } from "@/components/shared/query-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "LLMPanel",
    template: "%s · LLMPanel",
  },
  description: "Open-source LLM deployment platform for GPU inference.",
};

// Applied before hydration so a saved dark preference never flashes light.
const themeInitScript = `(function(){try{var t=localStorage.getItem("llmpanel-theme");if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <ThemeProvider>
            {children}
            {/* The app calls toast() in dozens of places; without a mounted
                Toaster none of that feedback ever renders. */}
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
