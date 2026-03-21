import type { Metadata } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://ceapcouncil.com/api/v1';

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params;
  try {
    const res = await fetch(`${API}/users/${username}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const user = await res.json();
      const name = user.full_name ? `${user.full_name} (@${username})` : `@${username}`;
      const description = user.bio
        ? `${user.bio} — View ${username}'s trading strategies and competition results on Ceap Council.`
        : `View ${username}'s trading strategies, backtest results, and competition history on Ceap Council.`;
      return {
        title: name,
        description,
        openGraph: {
          title: `${name} — Ceap Council`,
          description,
          url: `https://ceapcouncil.com/profile/${username}`,
          images: user.avatar_url ? [{ url: user.avatar_url }] : [],
        },
        twitter: { card: 'summary', title: `${name} — Ceap Council`, description },
        alternates: { canonical: `https://ceapcouncil.com/profile/${username}` },
      };
    }
  } catch {
    // fallback below
  }
  return {
    title: `@${username}`,
    alternates: { canonical: `https://ceapcouncil.com/profile/${username}` },
  };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
