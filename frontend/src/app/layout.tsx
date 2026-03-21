import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/layout/Navbar";
import "@/lib/env"; // validate env at startup

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = 'https://ceapcouncil.com';
const DESCRIPTION =
  'Ceap Council is a free platform for algorithmic traders to write Python trading strategies, backtest on real historical market data, compete in ranked competitions, and discuss in the community.';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Ceap Council — Backtest Trading Strategies & Compete',
    template: '%s — Ceap Council',
  },
  description: DESCRIPTION,
  keywords: [
    'algorithmic trading',
    'backtest trading strategy',
    'python trading strategy',
    'backtesting platform',
    'trading competitions',
    'quantitative trading',
    'systematic trading',
    'sharpe ratio',
    'trading simulator',
  ],
  authors: [{ name: 'Ceap Council', url: BASE_URL }],
  creator: 'Ceap Council',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: BASE_URL,
    siteName: 'Ceap Council',
    title: 'Ceap Council — Backtest Trading Strategies & Compete',
    description: DESCRIPTION,
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: 'Ceap Council' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ceap Council — Backtest Trading Strategies & Compete',
    description: DESCRIPTION,
    images: ['/opengraph-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: { canonical: BASE_URL },
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
