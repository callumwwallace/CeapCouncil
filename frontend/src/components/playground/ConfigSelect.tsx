'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ConfigSelectOption {
  value: string;
  label: string;
}

interface ConfigSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ConfigSelectOption[];
  placeholder?: string;
  small?: boolean;
  className?: string;
  /** Extra classes for the trigger button (e.g. dark background in optimize panel) */
  buttonClassName?: string;
}

export default function ConfigSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  small = false,
  className = '',
  buttonClassName = '',
}: ConfigSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);
  const displayValue = selectedOption?.label ?? selectedOption?.value ?? (value || placeholder);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 bg-gray-700/80 border border-gray-600 rounded-md px-2.5 py-1.5
          text-gray-100 transition-colors duration-150
          hover:border-gray-500
          focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500
          ${small ? 'text-xs py-1 px-2' : 'text-sm'} ${buttonClassName}`}
      >
        <span className={`truncate text-left ${!value ? 'text-gray-500' : ''}`}>
          {displayValue}
        </span>
        <ChevronDown
          className={`shrink-0 text-gray-500 pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`}
          size={16}
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-gray-800 border border-gray-600 rounded-lg shadow-xl shadow-black/30 z-50 max-h-52 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex justify-between items-center
                hover:bg-gray-700/80 ${value === opt.value ? 'text-emerald-400 bg-gray-700/50' : 'text-gray-200'}`}
            >
              <span className="font-medium truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
