export type DatePreset = '1M' | '3M' | '6M' | '1Y' | '2Y' | '3Y' | '5Y' | 'YTD' | 'Max';

export function applyDatePreset(preset: DatePreset): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);

  if (preset === 'YTD') {
    start.setMonth(0, 1); // start of year
  } else if (preset === 'Max') {
    start.setFullYear(end.getFullYear() - 10); // engine cap is 10 years
  } else {
    const months: Record<string, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '2Y': 24, '3Y': 36, '5Y': 60 };
    start.setMonth(start.getMonth() - (months[preset] ?? 12));
  }

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function formatRelativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatCommitTime(iso: string | null): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  const days = Math.floor(sec / 86400);
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return '1 week ago';
  if (weeks < 4) return `${weeks} weeks ago`;
  return new Date(iso).toLocaleDateString();
}

// Extract a readable error from API responses
export function extractApiError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && !('response' in err)) return err.message;
  const ax = err as { response?: { status?: number; data?: { detail?: string | Array<{ loc?: unknown[]; msg: string }> } } };
  if (ax.response?.status === 429) {
    return 'Rate limit exceeded. Please wait a minute before trying again.';
  }
  const d = ax.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length > 0) {
    const first = d[0];
    const msg = typeof first === 'object' && first !== null && 'msg' in first ? first.msg : String(first);
    return msg;
  }
  return fallback;
}

// Categorize a raw backend error_message into a user-friendly string
export function categorizeBacktestError(msg: string | null | undefined): string {
  if (!msg) return 'Backtest failed';
  const lower = msg.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('alarm'))
    return `Timeout: strategy exceeded the maximum execution time`;
  if (lower.includes('out of memory') || lower.includes('memory limit'))
    return `Memory: strategy used too much memory`;
  if (lower.includes('syntaxerror'))
    return `Syntax error in strategy code: ${msg.replace(/^.*SyntaxError:\s*/i, '')}`;
  if (lower.includes('nameerror'))
    return `Name error in strategy: ${msg.replace(/^.*NameError:\s*/i, '')}`;
  if (lower.includes('attributeerror'))
    return `Attribute error in strategy: ${msg.replace(/^.*AttributeError:\s*/i, '')}`;
  if (lower.includes('typeerror'))
    return `Type error in strategy: ${msg.replace(/^.*TypeError:\s*/i, '')}`;
  if (lower.includes('no data') || lower.includes('insufficient data') || lower.includes('empty dataframe'))
    return `Data error: no price data returned for the selected symbol and date range`;
  if (lower.includes('not allowed') || lower.includes('permission') || lower.includes('blocked'))
    return `Security: ${msg}`;
  if (lower.includes('initial_capital'))
    return `Config error: ${msg}`;
  return msg;
}

// Poll until task finishes or times out
export async function pollTaskResult<T extends { status: string; error?: string }>(
  fetchResult: (taskId: string) => Promise<T>,
  taskId: string,
  { maxAttempts = 120, intervalMs = 2000 }: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const res = await fetchResult(taskId);
    if (res.status === 'completed') return res;
    if (res.status === 'failed') throw new Error(res.error || 'Task failed');
  }
  throw new Error('Task timed out');
}
