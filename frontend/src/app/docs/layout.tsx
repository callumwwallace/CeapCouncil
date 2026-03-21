import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Learn how to write Python trading strategies on Ceap Council. Documentation for the StrategyBase API, built-in indicators, backtesting parameters, and competition rules.',
  openGraph: {
    title: 'Documentation — Ceap Council',
    description: 'Full documentation for writing Python trading strategies, using the backtester API, and entering competitions on Ceap Council.',
    url: 'https://ceapcouncil.com/docs',
  },
  alternates: { canonical: 'https://ceapcouncil.com/docs' },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
