'use client';

import { useMemo } from 'react';
import zxcvbn from 'zxcvbn';

interface PasswordStrengthMeterProps {
  password: string;
  minScore?: number;
  className?: string;
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
const COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-600'] as const;

export function PasswordStrengthMeter({ password, minScore = 3, className = '' }: PasswordStrengthMeterProps) {
  const result = useMemo(() => (password ? zxcvbn(password) : null), [password]);

  if (!password) return null;

  const score = result?.score ?? 0;
  const feedback = result?.feedback;
  const suggestions = feedback?.suggestions ?? [];
  const warning = feedback?.warning ?? '';

  const width = ((score + 1) / 5) * 100;
  const barColor = COLORS[score];
  const isValid = score >= minScore;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${barColor}`}
            style={{ width: `${width}%` }}
            role="progressbar"
            aria-valuenow={score + 1}
            aria-valuemin={0}
            aria-valuemax={5}
          />
        </div>
        <span className={`text-xs font-medium ${isValid ? 'text-green-600' : 'text-amber-600'}`}>
          {LABELS[score]}
        </span>
      </div>
      {(warning || suggestions.length > 0) && (
        <p className="mt-1 text-xs text-gray-500">
          {warning}
          {warning && suggestions.length > 0 ? ' ' : ''}
          {suggestions.slice(0, 2).join('. ')}
        </p>
      )}
    </div>
  );
}
