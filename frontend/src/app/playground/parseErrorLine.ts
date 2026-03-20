/**
 * Parses error messages from strategy validation/backtest failures to extract
 * line numbers for Monaco editor highlighting.
 *
 * Supports:
 * - SyntaxError (line N): msg
 * - Line N: <code>
 * - File "<strategy>", line N, in ...
 */

export interface ParsedErrorLine {
  line: number;
  message: string;
}

const PATTERNS = [
  // SyntaxError (line 5): invalid syntax
  /\(line\s+(\d+)\)/gi,
  //   Line 12: self.market_order(...)
  /line\s+(\d+)\s*:/gi,
  // File "<strategy>", line 8, in on_data
  /",\s*line\s+(\d+)\s*,/gi,
];

/**
 * Parse an error message for line numbers. Returns array of { line, message }
 * with lines clamped to [1, lineCount]. Deduplicates by line.
 */
export function parseErrorLines(
  errorMessage: string | null | undefined,
  lineCount: number = 9999
): ParsedErrorLine[] {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return [];
  }

  const seen = new Set<number>();
  const results: ParsedErrorLine[] = [];
  const trimmed = errorMessage.trim();

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(trimmed)) !== null) {
      const raw = parseInt(match[1], 10);
      if (isNaN(raw) || raw < 1) continue;
      const line = Math.min(Math.max(1, raw), lineCount);
      if (seen.has(line)) continue;
      seen.add(line);
      results.push({ line, message: trimmed });
    }
  }

  return results.sort((a, b) => a.line - b.line);
}
