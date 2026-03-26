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

// Core extraction

// Matches `self.params.setdefault( 'key' ,` — does NOT try to capture the value
// because [^)]+ breaks on nested parens like func().  Value extraction is done
// manually by extractBalancedValue() so nesting depth is respected.
const CALL_PREFIX_REGEX = /self\.params\.setdefault\(\s*['"](\w+)['"]\s*,\s*/g;

/**
 * Extract the value argument from a setdefault call, respecting paren nesting.
 * `code`  – full source string
 * `start` – index of the first character of the value (right after the comma)
 * Returns the raw value string (without the outer closing paren), or null if
 * the parens are unbalanced.
 */
function extractBalancedValue(code: string, start: number): string | null {
  // We entered the outer call's `(` before reaching `start`, so depth starts at 1.
  let depth = 1;
  let i = start;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(start, i);
    }
    i++;
  }
  return null; // unbalanced source
}

/**
 * Extract all parameters from strategy code by parsing
 */
export function extractParamsFromCode(code: string): ExtractedParam[] {
  const seen = new Set<string>();
  const params: ExtractedParam[] = [];

  let match: RegExpExecArray | null;
  const regex = new RegExp(CALL_PREFIX_REGEX.source, CALL_PREFIX_REGEX.flags);

  while ((match = regex.exec(code)) !== null) {
    const key = match[1];
    if (seen.has(key)) continue;

    // Extract the value argument with balanced-paren awareness
    const valueStart = match.index + match[0].length;
    const rawValue = extractBalancedValue(code, valueStart);
    if (rawValue === null) continue;

    const trimmed = rawValue.trim();

    // Python booleans are not numeric params — skip them
    if (trimmed === 'True' || trimmed === 'False') continue;

    const numValue = parseFloat(trimmed);
    if (isNaN(numValue)) continue; // skip non-numeric defaults (e.g. strings)

    seen.add(key);

    // Scientific notation (e.g. 1e-5, 2.5e3) contains 'e'/'E' → float
    const lc = trimmed.toLowerCase();
    const isFloat =
      trimmed.includes('.') ||
      lc.includes('e') ||
      (Math.abs(numValue) < 1 && numValue !== 0);
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

// Range heuristics for optimizer

export function deriveRange(
  key: string,
  value: number,
  type: 'int' | 'float',
): { min: number; max: number; step: number } {
  // Common param names get smarter defaults
  const k = key.toLowerCase();

  // Boolean toggles (0/1)
  if ((value === 0 || value === 1) && (k.includes('enable') || k.includes('filter') || k.includes('use_'))) {
    return { min: 0, max: 1, step: 1 };
  }

  // Percentages (0-100)
  if (k.includes('pct') || k.includes('percent') || k.includes('overbought') || k.includes('oversold')) {
    if (type === 'int') {
      return { min: Math.max(0, value - 30), max: Math.min(100, value + 30), step: 1 };
    }
    return { min: Math.max(0, value - 30), max: Math.min(100, value + 30), step: 0.5 };
  }

  // Period/lookback: min 2 for MAs
  if (k.includes('period') || k.includes('lookback') || k.includes('window') || k === 'fast' || k === 'slow' || k === 'signal') {
    const lo = Math.max(2, Math.floor(value * 0.3));
    const hi = Math.ceil(value * 3);
    return { min: lo, max: hi, step: 1 };
  }

  // Multipliers, factors, thresholds
  if (type === 'float') {
    const lo = Math.max(0, +(value * 0.25).toFixed(2));
    const hi = +(value * 4).toFixed(2);
    const step = +(Math.max(0.1, value * 0.1).toFixed(2));
    return { min: lo, max: hi || 1, step };
  }

  // Fallback for other ints
  const halfVal = Math.max(2, Math.floor(value * 0.5));
  return {
    min: Math.max(1, value - halfVal * 2),
    max: value + halfVal * 2,
    step: 1,
  };
}

// Update code with param values

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

// Build param_ranges for optimizer / OOS / CPCV

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

// Helpers

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
