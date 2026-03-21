import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trading Strategy Competitions',
  description:
    'Enter your Python trading strategies into ranked competitions on Ceap Council. Same data, same rules for everyone. Earn badges and climb the leaderboard by Sharpe ratio, returns, and drawdown.',
  openGraph: {
    title: 'Trading Strategy Competitions — Ceap Council',
    description: 'Compete with your Python trading strategies. Same data, same rules. Rankings by Sharpe ratio, return, and drawdown.',
    url: 'https://ceapcouncil.com/competitions',
  },
  alternates: { canonical: 'https://ceapcouncil.com/competitions' },
};

export default function CompetitionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
