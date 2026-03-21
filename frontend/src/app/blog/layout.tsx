import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Articles on algorithmic trading, backtesting strategies in Python, competition results, and platform updates from Ceap Council.',
  openGraph: {
    title: 'Blog — Ceap Council',
    description: 'Articles on algorithmic trading, Python backtesting, and competition results.',
    url: 'https://ceapcouncil.com/blog',
  },
  alternates: { canonical: 'https://ceapcouncil.com/blog' },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
