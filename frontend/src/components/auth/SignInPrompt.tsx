'use client';

import Link from 'next/link';
import { LogIn, X } from 'lucide-react';

interface SignInPromptProps {
  title: string;
  subtitle: string;
  /** Inline banner or centered modal with close button */
  variant?: 'banner' | 'modal';
  onDismiss?: () => void;
  href?: string;
}

const sharedContent = (title: string, subtitle: string, iconSize: 'md' | 'lg') => (
  <>
    <div className={`shrink-0 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-200 transition-colors ${iconSize === 'lg' ? 'w-12 h-12' : 'w-10 h-10'}`}>
      <LogIn className={iconSize === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>
    </div>
    <span className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg group-hover:bg-emerald-700 transition-colors shrink-0">
      Sign in
    </span>
  </>
);

// Only allow relative paths so we don't redirect users elsewhere
function safeHref(h: string): string {
  const s = (h || '').trim();
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return '/login';
}

export default function SignInPrompt({
  title,
  subtitle,
  variant = 'banner',
  onDismiss,
  href = '/login',
}: SignInPromptProps) {
  const resolvedHref = safeHref(href);
  if (variant === 'modal') {
    return (
      <div className="absolute inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
        <div className="relative mx-4 flex max-w-md items-center gap-4 rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-xl">
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="absolute right-3 top-3 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
          <Link href={resolvedHref} className="flex items-center gap-4 group flex-1 min-w-0 pr-6">
            {sharedContent(title, subtitle, 'lg')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={resolvedHref}
      className="flex items-center gap-4 p-5 rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5 transition-all group"
    >
      {sharedContent(title, subtitle, 'md')}
    </Link>
  );
}
