'use client';

import { useState, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SidePanelProps {
  title: string;
  children: ReactNode;
  side: 'left' | 'right';
  defaultWidth?: number;
  defaultCollapsed?: boolean;
  headerContent?: ReactNode;
}

export default function SidePanel({
  title,
  children,
  side,
  defaultWidth = 280,
  defaultCollapsed = false,
  headerContent,
}: SidePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const CollapseIcon = side === 'left' 
    ? (isCollapsed ? ChevronRight : ChevronLeft)
    : (isCollapsed ? ChevronLeft : ChevronRight);

  return (
    <div
      className={`flex flex-col bg-gray-800 border-gray-700 transition-all duration-200 ${
        side === 'left' ? 'border-r' : 'border-l'
      }`}
      style={{ width: isCollapsed ? 40 : defaultWidth }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800/50 ${
        isCollapsed ? 'flex-col gap-2' : ''
      }`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-200 truncate">{title}</h3>
            {headerContent}
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <CollapseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      )}

      {/* Collapsed indicator */}
      {isCollapsed && (
        <div className="flex-1 flex items-center justify-center">
          <span 
            className="text-xs text-gray-500 font-medium writing-mode-vertical"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
