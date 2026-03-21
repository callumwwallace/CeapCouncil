import type { MetadataRoute } from 'next';

const BASE = 'https://ceapcouncil.com';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://ceapcouncil.com/api/v1';

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static public routes
  const static_routes: MetadataRoute.Sitemap = [
    { url: BASE,                        lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/playground`,        lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/competitions`,      lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/community`,         lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/blog`,              lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/docs`,              lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/terms`,             lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE}/privacy`,           lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];

  // Dynamic: blog posts
  const blogPosts = await fetchJson<{ slug: string; updated_at?: string }[]>(`${API}/blog`);
  const blog_routes: MetadataRoute.Sitemap = (blogPosts ?? []).map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Dynamic: community forum topics
  const topics = await fetchJson<{ slug: string }[]>(`${API}/forum/topics`);
  const forum_routes: MetadataRoute.Sitemap = (topics ?? []).map((t) => ({
    url: `${BASE}/community/${t.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  return [...static_routes, ...blog_routes, ...forum_routes];
}
