'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, User as UserIcon, FileText, MessageSquare, Loader2, Trash2, Reply, PenSquare } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import type { BlogPostDetail, BlogComment } from '@/types';
import MarkdownContent from '@/components/forum/MarkdownContent';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatCommentDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const { user, isAuthenticated } = useAuthStore();
  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Comments state
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: number; username: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .getBlogPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!slug || notFound) return;
    setCommentsLoading(true);
    api.listBlogComments(slug).then(setComments).catch(() => {}).finally(() => setCommentsLoading(false));
  }, [slug, notFound]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim() || !slug) return;
    setSubmitting(true);
    try {
      const comment = await api.createBlogComment(slug, commentContent.trim(), replyingTo?.id);
      setComments((prev) => [...prev, comment]);
      setCommentContent('');
      setReplyingTo(null);
    } catch {
      // Silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('Delete this comment?')) return;
    setDeletingId(commentId);
    try {
      await api.deleteBlogComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      // Silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleReply = (comment: BlogComment) => {
    setReplyingTo({ id: comment.id, username: comment.author_username });
    // Focus the textarea
    const textarea = document.getElementById('blog-comment-input');
    textarea?.focus();
  };

  // Group comments: top-level and their replies
  const topLevelComments = comments.filter((c) => !c.parent_id);
  const repliesByParent: Record<number, BlogComment[]> = {};
  comments.filter((c) => c.parent_id).forEach((c) => {
    if (!repliesByParent[c.parent_id!]) repliesByParent[c.parent_id!] = [];
    repliesByParent[c.parent_id!].push(c);
  });

  if (!slug) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <Link href="/blog" className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700">
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
          {user?.is_superuser && post && (
            <Link
              href={`/admin/blog/${post.slug}/edit`}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <PenSquare className="h-4 w-4" />
              Edit post
            </Link>
          )}
        </div>

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
          <>
            <article className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-8 sm:p-10">
                <h1 className="text-3xl font-bold text-gray-900 mb-6">{post.title}</h1>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-8">
                  <span className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    {post.author.username}
                  </span>
                  {(post.published_at || post.created_at) && (
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDate(post.published_at || post.created_at)}
                    </span>
                  )}
                </div>
                <MarkdownContent content={post.content} />
              </div>
            </article>

            {/* Comments Section */}
            <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-gray-500" />
                <span className="font-medium text-gray-900">
                  Comments {comments.length > 0 && `(${comments.length})`}
                </span>
              </div>

              {commentsLoading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : comments.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>No comments yet. Be the first to share your thoughts!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {topLevelComments.map((comment) => (
                    <div key={comment.id}>
                      <div className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <Link
                            href={`/profile/${comment.author_username}`}
                            className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-medium text-sm"
                          >
                            {comment.author_username.charAt(0).toUpperCase()}
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/profile/${comment.author_username}`}
                                className="font-medium text-sm text-gray-900 hover:text-emerald-600"
                              >
                                {comment.author_username}
                              </Link>
                              <span className="text-xs text-gray-400">{formatCommentDate(comment.created_at)}</span>
                              <div className="flex items-center gap-2 ml-auto">
                                {isAuthenticated && (
                                  <button
                                    type="button"
                                    onClick={() => handleReply(comment)}
                                    className="text-xs text-gray-400 hover:text-emerald-600 flex items-center gap-1"
                                  >
                                    <Reply className="h-3 w-3" />
                                    Reply
                                  </button>
                                )}
                                {isAuthenticated && (user?.username === comment.author_username || user?.is_superuser) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(comment.id)}
                                    disabled={deletingId === comment.id}
                                    className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"
                                  >
                                    {deletingId === comment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
                          </div>
                        </div>
                      </div>

                      {/* Replies */}
                      {repliesByParent[comment.id]?.map((reply) => (
                        <div key={reply.id} className="px-6 py-3 pl-16 bg-gray-50/50">
                          <div className="flex items-start gap-3">
                            <Link
                              href={`/profile/${reply.author_username}`}
                              className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium text-xs"
                            >
                              {reply.author_username.charAt(0).toUpperCase()}
                            </Link>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/profile/${reply.author_username}`}
                                  className="font-medium text-xs text-gray-900 hover:text-emerald-600"
                                >
                                  {reply.author_username}
                                </Link>
                                <span className="text-xs text-gray-400">{formatCommentDate(reply.created_at)}</span>
                                {isAuthenticated && (user?.username === reply.author_username || user?.is_superuser) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(reply.id)}
                                    disabled={deletingId === reply.id}
                                    className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 ml-auto"
                                  >
                                    {deletingId === reply.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{reply.content}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Comment form */}
              {isAuthenticated ? (
                <form onSubmit={handleSubmitComment} className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                  {replyingTo && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-500">Replying to <span className="font-medium">@{replyingTo.username}</span></span>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <textarea
                    id="blog-comment-input"
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    placeholder="Write a comment..."
                    rows={3}
                    maxLength={5000}
                    disabled={submitting}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-y disabled:bg-gray-100"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !commentContent.trim()}
                    className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Post comment
                  </button>
                </form>
              ) : (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-center">
                  <p className="text-sm text-gray-500">
                    <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">Sign in</Link> to join the discussion.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
