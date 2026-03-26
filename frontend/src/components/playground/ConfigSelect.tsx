'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  /** Light variant for use on white/light backgrounds */
  light?: boolean;
}

export default function ConfigSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  small = false,
  className = '',
  buttonClassName = '',
  light = false,
}: ConfigSelectProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selectedOption = options.find(o => o.value === value);
  const displayValue = selectedOption?.label ?? selectedOption?.value ?? (value || placeholder);

  const handleToggle = useCallback(() => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(prev => !prev);
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (!buttonRef.current || !buttonRef.current.contains(target)) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors duration-150
          focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500
          ${light
            ? 'bg-white border border-gray-200 text-gray-900 hover:border-gray-300'
            : 'bg-gray-700/80 border border-gray-600 text-gray-100 hover:border-gray-500'}
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
      {open && typeof window !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className={`rounded-lg shadow-xl max-h-52 overflow-y-auto ${light ? 'bg-white border border-gray-200 shadow-black/10' : 'bg-gray-800 border border-gray-600 shadow-black/30'}`}
        >
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
                ${light
                  ? `hover:bg-gray-50 ${value === opt.value ? 'text-emerald-600 bg-emerald-50' : 'text-gray-900'}`
                  : `hover:bg-gray-700/80 ${value === opt.value ? 'text-emerald-400 bg-gray-700/50' : 'text-gray-200'}`}`}
            >
              <span className="font-medium truncate">{opt.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
