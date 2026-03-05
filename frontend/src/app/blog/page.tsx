'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Calendar, User } from 'lucide-react';
import api from '@/lib/api';
import type { BlogPostSummary } from '@/types';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listBlogPosts()
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="h-8 w-8 text-emerald-600" />
            Blog
          </h1>
          <p className="mt-2 text-gray-600">
            Insights, tutorials, and updates from the Ceap Council team and community.
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-full mb-2" />
                <div className="h-4 bg-gray-100 rounded w-2/3 mb-4" />
                <div className="flex gap-4">
                  <div className="h-4 bg-gray-100 rounded w-24" />
                  <div className="h-4 bg-gray-100 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No posts yet</h2>
            <p className="text-gray-600">Check back soon for updates, tutorials, and insights.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="block bg-white rounded-xl border border-gray-200 shadow-sm hover:border-emerald-200 hover:shadow-md transition-all p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2 hover:text-emerald-600">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="text-gray-600 mb-4 line-clamp-2">{post.excerpt}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {post.author.username}
                  </span>
                  {(post.published_at || post.created_at) && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(post.published_at || post.created_at)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
