import type { Metadata } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://ceapcouncil.com/api/v1';

export async function generateMetadata(
  { params }: { params: Promise<{ topicId: string; threadId: string }> }
): Promise<Metadata> {
  const { topicId, threadId } = await params;
  try {
    const res = await fetch(`${API}/forum/topics/${topicId}/threads/${threadId}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const thread = await res.json();
      const title = thread.title ?? 'Community Thread';
      const description = `${thread.post_count} replies · Started by @${thread.author_username} on Ceap Council's trading community forum.`;
      return {
        title,
        description,
        openGraph: {
          title: `${title} — Ceap Council Community`,
          description,
          url: `https://ceapcouncil.com/community/${topicId}/${threadId}`,
          type: 'article',
        },
        twitter: { card: 'summary', title, description },
        alternates: { canonical: `https://ceapcouncil.com/community/${topicId}/${threadId}` },
      };
    }
  } catch {
    // fallback below
  }
  return {
    title: 'Community Thread',
    alternates: { canonical: `https://ceapcouncil.com/community/${topicId}/${threadId}` },
  };
}

export default function ThreadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
