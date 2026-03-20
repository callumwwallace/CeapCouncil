import '@testing-library/jest-dom';
import { parseErrorLines } from '@/app/playground/parseErrorLine';

describe('parseErrorLines', () => {
  it('returns empty for null/undefined', () => {
    expect(parseErrorLines(null)).toEqual([]);
    expect(parseErrorLines(undefined)).toEqual([]);
  });

  it('returns empty for non-string', () => {
    expect(parseErrorLines(123 as unknown as string)).toEqual([]);
  });

  it('parses SyntaxError (line N) pattern', () => {
    const result = parseErrorLines('SyntaxError (line 5): invalid syntax');
    expect(result).toEqual([{ line: 5, message: 'SyntaxError (line 5): invalid syntax' }]);
  });

  it('parses Line N: pattern', () => {
    const result = parseErrorLines('  Line 12: self.market_order(symbol, 100)');
    expect(result).toEqual([{ line: 12, message: 'Line 12: self.market_order(symbol, 100)' }]);
  });

  it('parses File "<strategy>", line N, pattern', () => {
    const result = parseErrorLines('File "<strategy>", line 8, in on_data');
    expect(result).toEqual([{ line: 8, message: 'File "<strategy>", line 8, in on_data' }]);
  });

  it('parses multiple lines in one error', () => {
    const msg = `Error in strategy code:
  Line 10: self.market_order(symbol, qty)
  Line 12: self.close_position(symbol)`;
    const result = parseErrorLines(msg);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.line)).toEqual([10, 12]);
  });

  it('deduplicates same line from multiple patterns', () => {
    const msg = 'SyntaxError (line 5): msg and Line 5: more';
    const result = parseErrorLines(msg);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(5);
  });

  it('clamps line to [1, lineCount]', () => {
    const result = parseErrorLines('Line 999: x', 10);
    expect(result).toEqual([{ line: 10, message: 'Line 999: x' }]);
  });

  it('skips line 0 (invalid)', () => {
    const result = parseErrorLines('Line 0: x', 20);
    expect(result).toEqual([]);
  });

  it('returns empty when no pattern matches', () => {
    const result = parseErrorLines('Strategy code must define a class named MyStrategy');
    expect(result).toEqual([]);
  });

  it('sorts results by line number', () => {
    const msg = 'Line 15: x\nLine 3: y';
    const result = parseErrorLines(msg);
    expect(result.map((r) => r.line)).toEqual([3, 15]);
  });
});
