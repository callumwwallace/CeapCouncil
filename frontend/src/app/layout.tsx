import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import "@/lib/env"; // validate env at startup

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ceap Council - Build, Backtest & Compete",
  description: "Write Python strategies in the Playground, run backtests on real data, compete on the Leaderboard, and discuss in the Community.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900 h-full`}
      >
        <Providers>
          <div className="h-full flex flex-col">
            <Navbar />
            <main className="flex-1 overflow-auto min-h-0">{children}</main>
            <Footer />
          </div>
          <div
            id="portal-root"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2147483647,
              pointerEvents: 'none',
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
