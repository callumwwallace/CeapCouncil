import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community Forum',
  description:
    'Join the Ceap Council community. Discuss algorithmic trading strategies, share backtest results, get help with Python code, and follow live competition threads.',
  openGraph: {
    title: 'Community Forum — Ceap Council',
    description: 'Discuss trading strategies, share backtest results, and follow competitions with the Ceap Council community.',
    url: 'https://ceapcouncil.com/community',
  },
  alternates: { canonical: 'https://ceapcouncil.com/community' },
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
