import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Strategy Playground',
  description:
    'Write and backtest Python trading strategies in the Ceap Council Playground. Use the live code editor, run backtests on real equities and ETF data, and view equity curves, drawdowns, and trade logs.',
  openGraph: {
    title: 'Strategy Playground — Ceap Council',
    description: 'Write Python trading strategies and backtest them on real market data. View equity curves, Sharpe ratio, drawdown, and full trade logs.',
    url: 'https://ceapcouncil.com/playground',
  },
  alternates: { canonical: 'https://ceapcouncil.com/playground' },
};

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
