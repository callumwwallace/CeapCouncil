'use client';

import { useRef, useState, useEffect } from 'react';
import {
  Bold,
  Italic,
  Code,
  Link2,
  Image as ImageIcon,
  List,
  ListOrdered,
  Minus,
  FileText,
  Edit3,
  AtSign,
  GitBranch,
  ChevronDown,
  BarChart3,
} from 'lucide-react';
import MarkdownContent from './MarkdownContent';

export interface StrategyOption {
  id: number;
  share_token: string;
  title: string;
}

interface ForumEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  showPreview?: boolean;
  strategies?: StrategyOption[];
  backtests?: { id: number; share_token: string; symbol: string; total_return: number | null; sharpe_ratio: number | null }[];
}

function ToolbarButton({
  onClick,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export default function ForumEditor({
  value,
  onChange,
  placeholder = 'Write your message...',
  rows = 4,
  maxLength = 10000,
  disabled = false,
  showPreview = true,
  strategies = [],
  backtests = [],
}: ForumEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const strategyDropdownRef = useRef<HTMLDivElement>(null);
  const backtestDropdownRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [strategyDropdownOpen, setStrategyDropdownOpen] = useState(false);
  const [backtestDropdownOpen, setBacktestDropdownOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (strategyDropdownRef.current && !strategyDropdownRef.current.contains(e.target as Node)) {
        setStrategyDropdownOpen(false);
      }
      if (backtestDropdownRef.current && !backtestDropdownRef.current.contains(e.target as Node)) {
        setBacktestDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const wrapSelection = (before: string, after: string = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const newText = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const insertAtCursor = (text: string, offset = 0) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newText = value.slice(0, start) + text + value.slice(end);
    onChange(newText);
    const pos = start + text.length + offset;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleBold = () => wrapSelection('**', '**');
  const handleItalic = () => wrapSelection('*', '*');
  const handleCode = () => wrapSelection('`', '`');
  const handleCodeBlock = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const block = selected ? `\n\`\`\`\n${selected}\n\`\`\`\n` : '\n```\n\n```\n';
    const newText = value.slice(0, start) + block + value.slice(end);
    onChange(newText);
    const pos = start + (selected ? block.length - 5 : 5);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };
  const handleLink = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const text = selected || 'link text';
    const markdown = `[${text}](url)`;
    const newText = value.slice(0, start) + markdown + value.slice(end);
    onChange(newText);
    const urlStart = start + text.length + 3;
    const urlEnd = urlStart + 3;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(urlStart, urlEnd);
    });
  };
  const handleImage = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const url = window.prompt('Enter image URL:');
    if (!url?.trim()) return;
    const alt = window.prompt('Alt text (optional):', '') || 'image';
    const markdown = `![${alt}](${url.trim()})`;
    insertAtCursor(markdown);
  };
  const handleBulletList = () => insertAtCursor('\n- ', 2);
  const handleNumberedList = () => insertAtCursor('\n1. ', 3);
  const handleHr = () => insertAtCursor('\n\n---\n\n');
  const handleMention = () => insertAtCursor('@');

  const handleShareStrategy = (s: StrategyOption) => {
    const embed = `[strategy:${s.share_token}|${s.title}]`;
    insertAtCursor(embed);
    setStrategyDropdownOpen(false);
  };

  const handleShareBacktest = (bt: { id: number; share_token: string; symbol: string; total_return: number | null; sharpe_ratio: number | null }) => {
    const embed = `[backtest:${bt.share_token}|${bt.symbol}]`;
    insertAtCursor(embed);
    setBacktestDropdownOpen(false);
  };

  const handleCodeSnippet = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const block = selected ? `\n\`\`\`python\n${selected}\n\`\`\`\n` : '\n```python\n\n```\n';
    const newText = value.slice(0, start) + block + value.slice(end);
    onChange(newText);
    const pos = start + (selected ? 10 : 10); // cursor after ```python\n
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
      <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-0.5">
        <ToolbarButton onClick={handleBold} title="Bold" disabled={disabled}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleItalic} title="Italic" disabled={disabled}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleCode} title="Inline code" disabled={disabled}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleCodeBlock} title="Code block" disabled={disabled}>
          <span className="text-xs font-mono font-bold">{"<>"}</span>
        </ToolbarButton>
        <ToolbarButton onClick={handleCodeSnippet} title="Python code snippet" disabled={disabled}>
          <span className="text-xs font-mono font-bold text-amber-600">Py</span>
        </ToolbarButton>
        {strategies.length > 0 && (
          <div className="relative" ref={strategyDropdownRef}>
            <button
              type="button"
              onClick={() => setStrategyDropdownOpen((o) => !o)}
              disabled={disabled}
              title="Share a strategy"
              className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-0.5"
            >
              <GitBranch className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>
            {strategyDropdownOpen && (
              <div className="absolute left-0 top-full mt-0.5 py-1 bg-white rounded-lg border border-gray-200 shadow-lg z-50 min-w-[200px] max-h-48 overflow-y-auto">
                <div className="px-2 py-1 text-xs font-medium text-gray-500 border-b border-gray-100">Share strategy</div>
                {strategies.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleShareStrategy(s)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 truncate"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {backtests && backtests.length > 0 && (
          <div className="relative" ref={backtestDropdownRef}>
            <button
              type="button"
              onClick={() => setBacktestDropdownOpen((o) => !o)}
              disabled={disabled}
              title="Share backtest results"
              className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-0.5"
            >
              <BarChart3 className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>
            {backtestDropdownOpen && (
              <div className="absolute left-0 top-full mt-0.5 py-1 bg-white rounded-lg border border-gray-200 shadow-lg z-50 min-w-[220px] max-h-48 overflow-y-auto">
                <div className="px-2 py-1 text-xs font-medium text-gray-500 border-b border-gray-100">Share results</div>
                {backtests.map((bt) => (
                  <button
                    key={bt.id}
                    type="button"
                    onClick={() => handleShareBacktest(bt)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span className="font-medium">{bt.symbol}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {bt.total_return != null ? `${(bt.total_return * 100).toFixed(1)}%` : '\u2014'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <ToolbarButton onClick={handleLink} title="Link" disabled={disabled}>
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleMention} title="Mention user (@username)" disabled={disabled}>
          <AtSign className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleImage} title="Insert image (URL)" disabled={disabled}>
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <ToolbarButton onClick={handleBulletList} title="Bullet list" disabled={disabled}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleNumberedList} title="Numbered list" disabled={disabled}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={handleHr} title="Horizontal rule" disabled={disabled}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        </div>
        {showPreview && (
          <div className="flex rounded-md p-0.5 bg-gray-200">
            <button
              type="button"
              onClick={() => setMode('write')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm font-medium transition ${mode === 'write' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm font-medium transition ${mode === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
            >
              <FileText className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>
        )}
      </div>
      {mode === 'preview' ? (
        <div className="min-h-[80px] px-3 py-2 bg-white max-h-[300px] overflow-y-auto">
          {value.trim() ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-gray-400 text-sm">Nothing to preview</p>
          )}
        </div>
      ) : (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        className="w-full px-3 py-2 border-0 focus:ring-0 resize-y min-h-[80px] disabled:bg-gray-50"
      />
      )}
    </div>
  );
}
