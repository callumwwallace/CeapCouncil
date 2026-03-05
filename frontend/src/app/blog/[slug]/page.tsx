'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, User, FileText } from 'lucide-react';
import api from '@/lib/api';
import type { BlogPostDetail } from '@/types';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api
      .getBlogPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!slug) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-4" />
            <div className="flex gap-4 mb-6">
              <div className="h-4 bg-gray-100 rounded w-32" />
              <div className="h-4 bg-gray-100 rounded w-40" />
            </div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
        ) : notFound || !post ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Post not found</h2>
            <p className="text-gray-600 mb-6">
              The post you&apos;re looking for doesn&apos;t exist or hasn&apos;t been published.
            </p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </Link>
          </div>
        ) : (
          <article className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-8 sm:p-10">
              <h1 className="text-3xl font-bold text-gray-900 mb-6">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-8">
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {post.author.username}
                </span>
                {(post.published_at || post.created_at) && (
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDate(post.published_at || post.created_at)}
                  </span>
                )}
              </div>
              <div className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-emerald-600 prose-code:bg-gray-100 prose-pre:bg-gray-900">
                <div className="whitespace-pre-wrap">{post.content}</div>
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
