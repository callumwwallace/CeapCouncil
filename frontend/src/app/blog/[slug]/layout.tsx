import type { Metadata } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://ceapcouncil.com/api/v1';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API}/blog/${slug}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const post = await res.json();
      const title = post.title ?? 'Blog Post';
      const description = post.excerpt ?? post.content?.slice(0, 155) ?? '';
      return {
        title,
        description,
        openGraph: {
          title: `${title} — Ceap Council`,
          description,
          url: `https://ceapcouncil.com/blog/${slug}`,
          type: 'article',
          publishedTime: post.created_at,
          modifiedTime: post.updated_at,
          authors: post.author_username ? [`https://ceapcouncil.com/profile/${post.author_username}`] : undefined,
        },
        twitter: { card: 'summary_large_image', title, description },
        alternates: { canonical: `https://ceapcouncil.com/blog/${slug}` },
      };
    }
  } catch {
    // fallback below
  }
  return {
    title: 'Blog Post',
    alternates: { canonical: `https://ceapcouncil.com/blog/${slug}` },
  };
}

export default function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
