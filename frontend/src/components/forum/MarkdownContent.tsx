'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import StrategyEmbedCard from './StrategyEmbedCard';
import BacktestEmbedCard from './BacktestEmbedCard';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const proseClasses = [
  'text-gray-700 text-sm',
  '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:mt-3 [&_h2]:mb-2',
  '[&_p]:my-2 [&_p:first-child]:mt-0',
  '[&_a]:text-emerald-600 [&_a]:no-underline hover:[&_a]:underline',
  '[&_code]:text-emerald-700 [&_code]:bg-emerald-50 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono',
  '[&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto',
  '[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600',
].join(' ');

/** Convert @username to markdown links so they render as profile links. */
function linkifyMentions(text: string): string {
  return text.replace(/@([a-zA-Z0-9_]+)/g, (_, username) => `[@${username}](/profile/${username})`);
}

/** Combined regex for strategy and backtest embeds.
 *  Accepts both old integer IDs and new UUID share tokens:
 *  [strategy:abc-123|Title] or [backtest:def-456|AAPL] */
const EMBED_REGEX = /\[(strategy|backtest):([a-zA-Z0-9_-]+)[|:]([^\]]*)\]/g;

type EmbedPart =
  | { type: 'text'; value: string }
  | { type: 'strategy'; token: string; title: string }
  | { type: 'backtest'; token: string; symbol: string };

export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  if (!content?.trim()) return null;

  const parts: EmbedPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  EMBED_REGEX.lastIndex = 0;
  while ((match = EMBED_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    const kind = match[1] as 'strategy' | 'backtest';
    const token = match[2];
    const label = match[3]?.trim() || (kind === 'strategy' ? 'Strategy' : 'Backtest');
    if (kind === 'strategy') {
      parts.push({ type: 'strategy', token, title: label });
    } else {
      parts.push({ type: 'backtest', token, symbol: label });
    }
    lastIndex = EMBED_REGEX.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          const linked = linkifyMentions(part.value);
          return (
            <div key={i} className={proseClasses}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...props }) => {
                    const isInternal = href?.startsWith('/');
                    return (
                      <a
                        href={href}
                        {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                  img: ({ src, alt }) => (
                    <span className="block my-2">
                      <img src={src} alt={alt || ''} className="rounded-lg max-w-full h-auto" />
                    </span>
                  ),
                  code: ({ className: codeClassName, children, ...props }) => {
                    const codeMatch = /language-(\w+)/.exec(codeClassName || '');
                    const isInline = !codeMatch;
                    if (isInline) {
                      return <code className={codeClassName} {...props}>{children}</code>;
                    }
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={codeMatch[1]}
                        PreTag="div"
                        customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.8rem' }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    );
                  },
                }}
              >
                {linked}
              </ReactMarkdown>
            </div>
          );
        }
        if (part.type === 'strategy') {
          return <StrategyEmbedCard key={i} shareToken={part.token} title={part.title} />;
        }
        return <BacktestEmbedCard key={i} shareToken={part.token} symbol={part.symbol} />;
      })}
    </div>
  );
}
