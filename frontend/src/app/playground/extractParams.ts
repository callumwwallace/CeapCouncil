/**
 Dynamic parameter introspection for strategy code
 */

export interface ExtractedParam {
  key: string;
  label: string;
  defaultValue: number;
  type: 'int' | 'float';
  min: number;
  max: number;
  step: number;
}

// ─── Core extraction ───────────────────────────────────────────────

const PARAM_REGEX = /self\.params\.setdefault\(\s*['"](\w+)['"]\s*,\s*([^)]+)\)/g;

/**
 * Extract all parameters from strategy code by parsing
 */
export function extractParamsFromCode(code: string): ExtractedParam[] {
  const seen = new Set<string>();
  const params: ExtractedParam[] = [];

  let match: RegExpExecArray | null;
  const regex = new RegExp(PARAM_REGEX.source, PARAM_REGEX.flags);

  while ((match = regex.exec(code)) !== null) {
    const key = match[1];
    const rawValue = match[2].trim();

    if (seen.has(key)) continue;
    seen.add(key);

    const numValue = parseFloat(rawValue);
    if (isNaN(numValue)) continue; // skip non-numeric defaults

    const isFloat = rawValue.includes('.') || Math.abs(numValue) < 1 && numValue !== 0;
    const type: 'int' | 'float' = isFloat ? 'float' : 'int';
    const range = deriveRange(key, numValue, type);

    params.push({
      key,
      label: formatLabel(key),
      defaultValue: numValue,
      type,
      ...range,
    });
  }

  return params;
}

// ─── Range heuristics for the optimizer ─────────────────────────────

export function deriveRange(
  key: string,
  value: number,
  type: 'int' | 'float',
): { min: number; max: number; step: number } {
  // Special-case common parameter names
  const k = key.toLowerCase();

  // Boolean-like toggles (0/1)
  if ((value === 0 || value === 1) && (k.includes('enable') || k.includes('filter') || k.includes('use_'))) {
    return { min: 0, max: 1, step: 1 };
  }

  // Percentage-like (0-100 range)
  if (k.includes('pct') || k.includes('percent') || k.includes('overbought') || k.includes('oversold')) {
    if (type === 'int') {
      return { min: Math.max(0, value - 30), max: Math.min(100, value + 30), step: 1 };
    }
    return { min: Math.max(0, value - 30), max: Math.min(100, value + 30), step: 0.5 };
  }

  // Period/lookback (always >= 2 for moving averages)
  if (k.includes('period') || k.includes('lookback') || k.includes('window') || k === 'fast' || k === 'slow' || k === 'signal') {
    const lo = Math.max(2, Math.floor(value * 0.3));
    const hi = Math.ceil(value * 3);
    return { min: lo, max: hi, step: 1 };
  }

  // Multiplier / factor / threshold (float)
  if (type === 'float') {
    const lo = Math.max(0, +(value * 0.25).toFixed(2));
    const hi = +(value * 4).toFixed(2);
    const step = +(Math.max(0.1, value * 0.1).toFixed(2));
    return { min: lo, max: hi || 1, step };
  }

  // Generic integer
  const halfVal = Math.max(2, Math.floor(value * 0.5));
  return {
    min: Math.max(1, value - halfVal * 2),
    max: value + halfVal * 2,
    step: 1,
  };
}

// ─── Update code with param values ──────────────────────────────────

/**
 * Replace self.params.setdefault('key', ...) values in-place within
 * the code string. Works with any code, not just templates.
 */
export function updateCodeWithParams(
  code: string,
  params: Record<string, number>,
): string {
  let result = code;
  for (const [key, val] of Object.entries(params)) {
    const regex = new RegExp(
      `self\\.params\\.setdefault\\(\\s*['"]${key}['"]\\s*,\\s*[^)]+\\)`,
      'g',
    );
    result = result.replace(regex, `self.params.setdefault('${key}', ${val})`);
  }
  return result;
}

// ─── Build param_ranges for optimizer/OOS/CPCV ──────────────────────

/**
 * Build param_ranges dict for the optimizer endpoint from extracted params.
 * Returns { key: { min, max, step } } for each parameter.
 */
export function buildParamRanges(
  paramDefs: ExtractedParam[],
): Record<string, { min: number; max: number; step: number }> {
  const ranges: Record<string, { min: number; max: number; step: number }> = {};
  for (const p of paramDefs) {
    ranges[p.key] = { min: p.min, max: p.max, step: p.step };
  }
  return ranges;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
