'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, 
  Save, 
  Check,
  RotateCcw, 
  Loader2, 
  BarChart3, 
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Activity,
  Target,
  FileCode,
  Percent,
  Scale,
  PanelRightClose,
  Copy,
  Pencil,
  Trash2,
  RefreshCw,
  Plus,
  GitBranch,
  X,
  AlertCircle,
  Download,
  Settings,
  Shield,
  LayoutDashboard,
  ArrowLeftRight,
  ListOrdered,
  LineChart as LineChartIcon,
  Sliders,
  Shuffle,
  BarChart2,
  GitCompare,
  Filter,
  Layers,
  PieChart,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import CodeEditor from '@/components/playground/CodeEditor';
import { TradeMarker } from '@/components/playground/AssetChart';
import ErrorBoundary from '@/components/ErrorBoundary';

const AssetChart = dynamic(() => import('@/components/playground/AssetChart').then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading chart…</div>,
});
import TradeLog from '@/components/playground/TradeLog';
import StatusBar from '@/components/playground/StatusBar';
import AssetSelector from '@/components/playground/AssetSelector';
import ConfigSelect from '@/components/playground/ConfigSelect';
import ChartHeader from '@/components/playground/ChartHeader';
import ResultsBar from '@/components/playground/ResultsBar';
import api from '@/lib/api';
import type { BacktestTrade, EquityCurvePoint, DrawdownPoint, Strategy, OptimizeResults, WalkForwardResults, OosResults, MonteCarloResults, CpcvResults, FactorResults } from '@/types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  LineChart,
  Line,
} from 'recharts';

function applyDatePreset(preset: '1M' | '3M' | '6M' | '1Y' | '5Y'): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '5Y': 60 };
  start.setMonth(start.getMonth() - months[preset]);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function formatRelativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatCommitTime(iso: string | null): string {
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

/** Extract user-friendly error message from API/axios errors (handles FastAPI detail format) */
function extractApiError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && !('response' in err)) return err.message;
  const ax = err as { response?: { data?: { detail?: string | Array<{ loc?: unknown[]; msg: string }> } } };
  const d = ax.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length > 0) {
    const first = d[0];
    const msg = typeof first === 'object' && first !== null && 'msg' in first ? first.msg : String(first);
    return msg;
  }
  return fallback;
}

/** Poll an async task until completed/failed. Returns the result or throws on failure/timeout. */
async function pollTaskResult<T extends { status: string; error?: string }>(
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

import { STRATEGY_TEMPLATES, STRATEGY_PARAMS, DEFAULT_CODE, type StrategyTemplateKey } from './strategyTemplates';
// (Strategy templates, params, and default code are in ./strategyTemplates.ts)
const SYMBOLS = [
  { value: 'AAPL', label: 'Apple Inc.' },
  { value: 'MSFT', label: 'Microsoft' },
  { value: 'GOOGL', label: 'Alphabet' },
  { value: 'AMZN', label: 'Amazon' },
  { value: 'TSLA', label: 'Tesla' },
  { value: 'META', label: 'Meta Platforms' },
  { value: 'NVDA', label: 'NVIDIA' },
  { value: 'AMD', label: 'AMD' },
  { value: 'NFLX', label: 'Netflix' },
  { value: 'SPY', label: 'S&P 500 ETF' },
  { value: 'QQQ', label: 'Nasdaq ETF' },
  { value: 'DIS', label: 'Walt Disney' },
  { value: 'BA', label: 'Boeing' },
  { value: 'JPM', label: 'JPMorgan Chase' },
  { value: 'GS', label: 'Goldman Sachs' },
  { value: 'GLD', label: 'Gold ETF' },
  { value: 'SLV', label: 'Silver ETF' },
  { value: 'TLT', label: 'Treasury Bond ETF' },
  { value: 'BTC-USD', label: 'Bitcoin' },
  { value: 'ETH-USD', label: 'Ethereum' },
  // Forex (yfinance format: CURRENCYPAIR=X)
  { value: 'EURUSD=X', label: 'EUR/USD' },
  { value: 'GBPUSD=X', label: 'GBP/USD' },
  { value: 'USDJPY=X', label: 'USD/JPY' },
  { value: 'AUDUSD=X', label: 'AUD/USD' },
  { value: 'USDCAD=X', label: 'USD/CAD' },
  { value: 'USDCHF=X', label: 'USD/CHF' },
  { value: 'NZDUSD=X', label: 'NZD/USD' },
];

type BrokerPreset = 'custom' | 'robinhood' | 'ibkr' | 'alpaca' | 'etrade' | 'fidelity';

const BROKER_PRESETS: Record<BrokerPreset, { commission: number; slippage: number; label: string }> = {
  custom: { commission: 0.1, slippage: 0.1, label: 'Custom' },
  robinhood: { commission: 0, slippage: 0.05, label: 'Robinhood (0% commission)' },
  ibkr: { commission: 0.02, slippage: 0.08, label: 'IBKR (low commission)' },
  alpaca: { commission: 0, slippage: 0.05, label: 'Alpaca (0% commission)' },
  etrade: { commission: 0.1, slippage: 0.1, label: 'E*TRADE' },
  fidelity: { commission: 0, slippage: 0.08, label: 'Fidelity (0% commission)' },
};

interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  slippage: number; // percentage (e.g. 0.1 = 0.1%)
  commission: number; // percentage (e.g. 0.1 = 0.1%)
  brokerPreset?: BrokerPreset;
  sizingMethod: 'full' | 'percent_equity' | 'fixed_shares' | 'fixed_dollar';
  sizingValue: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  benchmarkSymbol: string | null;
  interval: '1d' | '1h' | '15m' | '5m' | '1m';
  // Advanced engine settings
  spreadModel: 'auto' | 'none' | 'volatility' | 'fixed_bps';
  slippageModel: 'percentage' | 'volume_aware' | 'auto' | 'none';
  marginEnabled: boolean;
  allowShortsWithoutMargin: boolean;
  leverage: number;
  maxDrawdownPct: number;
  maxPositionPct: number;
  warmupBars: number;
  pdtEnabled: boolean;
}

function MetricItem({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? 'text-gray-200' : positive ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] text-gray-500 uppercase">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

interface BacktestResult {
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
  final_value: number;
  initial_capital: number;
  // Trade-level data from backend
  trades: BacktestTrade[];
  equity_curve: EquityCurvePoint[];
  drawdown_series: DrawdownPoint[];
  // Extended metrics
  sortino_ratio?: number;
  profit_factor?: number;
  avg_trade_duration?: number;
  max_consecutive_losses?: number;
  calmar_ratio?: number;
  exposure_pct?: number;
  benchmark_return?: number;
  orders?: Array<{
    order_id: string; symbol: string; side: string; order_type: string;
    quantity: number; filled_quantity: number; avg_fill_price: number;
    commission: number; status: string; created_at: string | null; filled_at: string | null;
  }>;
  expectancy?: number;
  volatility_annual?: number;
  information_ratio?: number;
  beta?: number;
  alpha?: number;
  total_commission?: number;
  total_slippage?: number;
  total_spread_cost?: number;
  cost_as_pct_of_pnl?: number;
  total_funding_paid?: number;
  total_funding_received?: number;
  net_funding?: number;
  rolling_sharpe?: Array<{date: string; value: number}>;
  rolling_sortino?: Array<{date: string; value: number}>;
  var_95?: number;
  cvar_95?: number;
  var_99?: number;
  cvar_99?: number;
  deflated_sharpe_ratio?: number;
  robustness_score?: number;
  risk_violations?: Array<{timestamp: string; rule: string; description: string; action: string}>;
  custom_charts?: Record<string, Array<{date: string; series: string; value: number}>>;
  alerts?: Array<{timestamp: string; level: string; message: string; data?: unknown}>;
}

export default function PlaygroundPage() {
  const { isAuthenticated, user } = useAuthStore();
  
  const [code, setCode] = useState(DEFAULT_CODE);
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplateKey>('sma_crossover');
  const [strategyMode, setStrategyMode] = useState<'templates' | 'custom'>('templates');
  const [customStrategies, setCustomStrategies] = useState<Strategy[]>([]);
  const [customStrategiesLoading, setCustomStrategiesLoading] = useState(false);
  const [strategyBoxMinimised, setStrategyBoxMinimised] = useState(false);
  const [editingRenameId, setEditingRenameId] = useState<number | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');

  const [config, setConfig] = useState<BacktestConfig>({
    symbol: 'AAPL',
    startDate: '2023-01-01',
    endDate: '2024-01-01',
    initialCapital: 10000,
    slippage: 0.1, // 0.1%
    commission: 0.1, // 0.1%
    sizingMethod: 'full',
    sizingValue: null,
    stopLossPct: null,
    takeProfitPct: null,
    benchmarkSymbol: null,
    interval: '1d',
    spreadModel: 'auto',
    slippageModel: 'percentage',
    marginEnabled: false,
    allowShortsWithoutMargin: false,
    leverage: 1,
    maxDrawdownPct: 100,
    maxPositionPct: 100,
    warmupBars: 0,
    pdtEnabled: false,
    brokerPreset: 'custom',
  });
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>(() => {
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS.sma_crossover.forEach(p => { defaultParams[p.key] = p.default; });
    return defaultParams;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [activeResultsTab, setActiveResultsTab] = useState<'summary' | 'trades' | 'orders' | 'charts' | 'compare' | 'optimize' | 'walkforward' | 'oos' | 'cpcv' | 'factors' | 'montecarlo' | 'risk' | 'tca' | 'heatmap' | 'distribution'>('summary');
  const [showCostsSection, setShowCostsSection] = useState(false);
  const [showSizingSection, setShowSizingSection] = useState(false);
  const [showRiskSection, setShowRiskSection] = useState(false);
  const [showEngineSection, setShowEngineSection] = useState(false);
  const [showAdvancedSetupSection, setShowAdvancedSetupSection] = useState(false);
  const [additionalSymbols, setAdditionalSymbols] = useState<string[]>([]);
  const [activeSetupPanel, setActiveSetupPanel] = useState<'strategy' | 'dates' | 'capital' | 'benchmark' | 'costs' | 'risk' | 'engine' | null>(null);
  const [setupPanelPosition, setSetupPanelPosition] = useState({ x: 70, y: 120 });
  const [setupPanelSize, setSetupPanelSize] = useState({ w: 320, h: 400 });
  const [isDraggingSetupPanel, setIsDraggingSetupPanel] = useState(false);
  const [isResizingSetupPanel, setIsResizingSetupPanel] = useState(false);
  const [canPortal, setCanPortal] = useState(false);
  const setupPanelDragRef = useRef({ startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const setupPanelResizeRef = useRef({ startX: 0, startY: 0, startW: 0, startH: 0 });
  useEffect(() => {
    setCanPortal(true);
  }, []);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [resultsBarExpanded, setResultsBarExpanded] = useState(false);
  const [resultsPanelWidth, setResultsPanelWidth] = useState(320);
  const [isResizingResults, setIsResizingResults] = useState(false);
  const resizeStartRef = useRef<{ x: number; w: number }>({ x: 0, w: 320 });
  const [uiScale, setUiScale] = useState(1); // 0.75–1.25, applied to sidebars only (not chart)
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<'code' | 'version-control'>('code');
  const [editorMinimized, setEditorMinimized] = useState(false);
  const [editorPosition, setEditorPosition] = useState({ x: 20, y: 300 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Set initial position on mount
  useEffect(() => {
    setEditorPosition({ x: 20, y: window.innerHeight - 470 });
  }, []);
  
  const [isRunning, setIsRunning] = useState(false);
  const runCancelledRef = useRef(false);
  const playgroundRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const theme = useThemeStore((s) => s.theme);
  const [effectiveChartTheme, setEffectiveChartTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    if (theme === 'light') {
      setEffectiveChartTheme('light');
      return;
    }
    if (theme === 'dark') {
      setEffectiveChartTheme('dark');
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setEffectiveChartTheme(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<(BacktestResult & { label: string; timestamp: number })[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  // Reuse a single playground strategy to avoid DB pollution
  const [playgroundStrategyId, setPlaygroundStrategyId] = useState<number | null>(null);

  // Advanced analytics state
  const [optimizeResults, setOptimizeResults] = useState<OptimizeResults | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeMethod, setOptimizeMethod] = useState<'grid' | 'bayesian' | 'genetic' | 'multiobjective' | 'heatmap'>('grid');
  const [walkForwardResults, setWalkForwardResults] = useState<WalkForwardResults | null>(null);
  const [walkForwardLoading, setWalkForwardLoading] = useState(false);
  const [walkForwardPurgeBars, setWalkForwardPurgeBars] = useState(0);
  const [walkForwardWindowMode, setWalkForwardWindowMode] = useState<'rolling' | 'anchored'>('rolling');
  const [oosResults, setOosResults] = useState<OosResults | null>(null);
  const [oosLoading, setOosLoading] = useState(false);
  const [oosNfolds, setOosNfolds] = useState(1);
  const [cpcvResults, setCpcvResults] = useState<CpcvResults | null>(null);
  const [cpcvLoading, setCpcvLoading] = useState(false);
  const [cpcvNGroups, setCpcvNGroups] = useState(6);
  const [cpcvPurgeBars, setCpcvPurgeBars] = useState(10);
  const [factorResults, setFactorResults] = useState<FactorResults | null>(null);
  const [factorLoading, setFactorLoading] = useState(false);
  const [monteCarloResults, setMonteCarloResults] = useState<MonteCarloResults | null>(null);
  const [monteCarloLoading, setMonteCarloLoading] = useState(false);
  const [lastBacktestId, setLastBacktestId] = useState<number | null>(null);
  // Optimization constraints
  const [optConstraints, setOptConstraints] = useState<{max_drawdown?: number; min_trades?: number; min_win_rate?: number}>({});
  const [showConstraints, setShowConstraints] = useState(false);
  // Heatmap-specific state
  const [heatmapParamX, setHeatmapParamX] = useState('');
  const [heatmapParamY, setHeatmapParamY] = useState('');
  // Multi-objective state
  const [multiObjMetrics, setMultiObjMetrics] = useState<[string, string]>(['sharpe_ratio', 'max_drawdown']);
  // Version history state
  const [versionList, setVersionList] = useState<Array<{id: number; version: number; commit_message: string | null; created_at: string | null; code_preview: string}>>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionListHasMore, setVersionListHasMore] = useState(false);
  const [commitTitleInput, setCommitTitleInput] = useState('');
  const [commitDescriptionInput, setCommitDescriptionInput] = useState('');
  const [lastEditorSaveTime, setLastEditorSaveTime] = useState<number | null>(null);
  const [editorSaveStatus, setEditorSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Clear "saved" feedback after a few seconds
  useEffect(() => {
    if (editorSaveStatus !== 'saved') return;
    const t = setTimeout(() => setEditorSaveStatus('idle'), 2500);
    return () => clearTimeout(t);
  }, [editorSaveStatus]);

  // Load version history when editor opens for a custom strategy
  useEffect(() => {
    if (showCodeEditor && strategyMode === 'custom' && playgroundStrategyId) {
      setVersionLoading(true);
      api.listVersions(playgroundStrategyId, 0, 10)
        .then((versions) => {
          setVersionList(versions);
          setVersionListHasMore(versions.length >= 10);
        })
        .catch(() => { setVersionList([]); setVersionListHasMore(false); })
        .finally(() => setVersionLoading(false));
    }
  }, [showCodeEditor, strategyMode, playgroundStrategyId]);
  
  // Derive trade markers from real backend trades
  const tradeMarkers: TradeMarker[] = useMemo(() => {
    if (!results?.trades) return [];
    const markers: TradeMarker[] = [];
    for (const trade of results.trades) {
      markers.push({ date: trade.entry_date, type: 'buy', price: trade.entry_price });
      markers.push({ date: trade.exit_date, type: 'sell', price: trade.exit_price });
    }
    return markers;
  }, [results?.trades]);

  // Use real equity curve from backend, mapped for drawdown chart compat
  const equityCurveData = useMemo(() => {
    return results?.equity_curve || [];
  }, [results?.equity_curve]);

  const drawdownData = useMemo(() => {
    return results?.drawdown_series || [];
  }, [results?.drawdown_series]);

  const validateConfig = (): string | null => {
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    const now = new Date();

    if (end <= start) return 'End date must be after start date';
    if (start > now) return 'Start date cannot be in the future';

    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 3650) return 'Date range cannot exceed 10 years';
    if (daysDiff < 7) return 'Date range must be at least 7 days';

    if (config.initialCapital < 100) return 'Initial capital must be at least $100';
    if (config.initialCapital > 10000000) return 'Initial capital cannot exceed $10,000,000';

    if (config.slippage < 0 || config.slippage > 10) return 'Slippage must be between 0% and 10%';
    if (config.commission < 0 || config.commission > 5) return 'Commission must be between 0% and 5%';

    if (!code.trim()) return 'Strategy code cannot be empty';
    if (!code.includes('class MyStrategy')) return 'Strategy code must define a class named MyStrategy';

    return null;
  };

  const validationHints = useMemo(() => {
    const hints: Record<string, string> = {};
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    const now = new Date();
    if (end <= start) hints.dateRange = 'End must be after start';
    else if (start > now) hints.dateRange = 'Start cannot be in future';
    else {
      const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 3650) hints.dateRange = 'Max 10 years';
      else if (days < 7) hints.dateRange = 'Min 7 days';
    }
    if (config.initialCapital < 100) hints.initialCapital = 'Min $100';
    else if (config.initialCapital > 10000000) hints.initialCapital = 'Max $10M';
    if (config.slippage < 0 || config.slippage > 10) hints.slippage = '0–10%';
    if (config.commission < 0 || config.commission > 5) hints.commission = '0–5%';
    if (!code.trim()) hints.code = 'Code cannot be empty';
    else if (!code.includes('class MyStrategy')) hints.code = 'Must define class MyStrategy';
    return hints;
  }, [config.startDate, config.endDate, config.initialCapital, config.slippage, config.commission, code]);

  // Clear validation errors when user fixes config
  useEffect(() => {
    if (error && !isRunning && validateConfig() === null && (strategyMode !== 'custom' || playgroundStrategyId)) {
      setError(null);
    }
  }, [config, code, strategyMode, playgroundStrategyId, isRunning]); // eslint-disable-line react-hooks/exhaustive-deps -- error intentionally excluded to avoid loops

  const handleRunBacktest = useCallback(async () => {
    if (!isAuthenticated) {
      setError('Please sign in to run backtests');
      return;
    }

    const validationError = validateConfig();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (strategyMode === 'custom' && !playgroundStrategyId) {
      setError('Select a strategy to run');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResults(null);
    setActiveResultsTab('summary');
    runCancelledRef.current = false;
    const startTime = Date.now();

    try {
      const backtestConfig = {
        symbol: config.symbol,
        symbols: additionalSymbols.length > 0 ? additionalSymbols : undefined,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        slippage: config.slippage / 100,
        commission: config.commission / 100,
        parameters: {
          ...strategyParams,
          spread_model: config.spreadModel,
          slippage_model: config.slippageModel,
          margin_enabled: config.marginEnabled,
          allow_shorts_without_margin: config.allowShortsWithoutMargin,
          leverage: config.leverage,
          max_drawdown_pct: config.maxDrawdownPct,
          max_position_pct: config.maxPositionPct,
          warmup_bars: config.warmupBars,
          pdt_enabled: config.pdtEnabled,
        },
        sizing_method: config.sizingMethod,
        sizing_value: config.sizingValue,
        stop_loss_pct: config.stopLossPct,
        take_profit_pct: config.takeProfitPct,
        benchmark_symbol: config.benchmarkSymbol,
        interval: config.interval,
      };

      // Always pass code from editor so Run uses current code (no Save required)
      const CREATE_TIMEOUT_MS = 30000; // 30 seconds
      const createPromise = api.createBacktestWithCode({ ...backtestConfig, code });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Check your connection and try again.')), CREATE_TIMEOUT_MS)
      );
      const backtest = await Promise.race([createPromise, timeoutPromise]);

      let attempts = 0;
      const maxAttempts = 120; // 2 minutes polling
      
      while (attempts < maxAttempts) {
        if (runCancelledRef.current) {
          setError('Cancelled');
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        let result;
        try {
          result = await api.getBacktest(backtest.id);
        } catch (pollErr: unknown) {
          const msg = pollErr instanceof Error ? pollErr.message : 'Failed to fetch backtest status';
          setError(`Network error: ${msg}. You can retry.`);
          break;
        }
        
        if (result.status === 'completed') {
          setLastBacktestId(result.id);
          const r = result.results;
          // Use real benchmark from backend (buy & hold over actual market data)
          const benchmarkReturn = r?.benchmark_return ?? undefined;
          const resultsObj: BacktestResult = {
            total_return: result.total_return || 0,
            sharpe_ratio: result.sharpe_ratio || 0,
            max_drawdown: result.max_drawdown || 0,
            win_rate: result.win_rate || 0,
            total_trades: result.total_trades || 0,
            final_value: r?.final_value || config.initialCapital,
            initial_capital: r?.initial_capital || config.initialCapital,
            trades: r?.trades || [],
            equity_curve: r?.equity_curve || [],
            drawdown_series: r?.drawdown_series || [],
            sortino_ratio: result.sortino_ratio ?? r?.sortino_ratio ?? undefined,
            profit_factor: result.profit_factor ?? r?.profit_factor ?? undefined,
            avg_trade_duration: result.avg_trade_duration ?? r?.avg_trade_duration ?? undefined,
            max_consecutive_losses: result.max_consecutive_losses ?? r?.max_consecutive_losses ?? undefined,
            calmar_ratio: result.calmar_ratio ?? r?.calmar_ratio ?? undefined,
            exposure_pct: result.exposure_pct ?? r?.exposure_pct ?? undefined,
            benchmark_return: benchmarkReturn,
            orders: r?.orders ?? undefined,
            expectancy: r?.expectancy ?? undefined,
            volatility_annual: r?.volatility_annual ?? undefined,
            information_ratio: r?.information_ratio ?? undefined,
            beta: r?.beta ?? undefined,
            alpha: r?.alpha ?? undefined,
            total_commission: r?.total_commission ?? undefined,
            total_slippage: r?.total_slippage ?? undefined,
            total_spread_cost: r?.total_spread_cost ?? undefined,
            cost_as_pct_of_pnl: r?.cost_as_pct_of_pnl ?? undefined,
            total_funding_paid: r?.total_funding_paid ?? undefined,
            total_funding_received: r?.total_funding_received ?? undefined,
            net_funding: r?.net_funding ?? undefined,
            rolling_sharpe: r?.rolling_sharpe ?? undefined,
            rolling_sortino: r?.rolling_sortino ?? undefined,
            var_95: r?.var_95 ?? undefined,
            cvar_95: r?.cvar_95 ?? undefined,
            var_99: r?.var_99 ?? undefined,
            cvar_99: r?.cvar_99 ?? undefined,
            deflated_sharpe_ratio: r?.deflated_sharpe_ratio ?? undefined,
            robustness_score: r?.robustness_score ?? undefined,
            risk_violations: r?.risk_violations ?? undefined,
            custom_charts: r?.custom_charts ?? undefined,
            alerts: r?.alerts ?? undefined,
          };
          setResults(resultsObj);
          // Add to comparison history
          setComparisonHistory(prev => [
            ...prev.slice(-4), // Keep last 5 total
            {
              ...resultsObj,
              label: `${STRATEGY_TEMPLATES[selectedTemplate].name} - ${config.symbol}`,
              timestamp: Date.now(),
            },
          ]);
          break;
        } else if (result.status === 'failed') {
          setError(result.error_message || 'Backtest failed');
          break;
        }
        attempts++;
      }
      
      if (attempts >= maxAttempts && !runCancelledRef.current) {
        setError('Backtest timed out (2 min). The server may be slow. You can retry.');
      }
    } catch (err: unknown) {
      setError(extractApiError(err, 'Failed to run backtest'));
    } finally {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setLastRunTime(`${elapsed}s`);
      setIsRunning(false);
    }
  }, [isAuthenticated, code, config, strategyParams, selectedTemplate, playgroundStrategyId, strategyMode]);

  const handleCancelBacktest = useCallback(() => {
    runCancelledRef.current = true;
  }, []);

  const handleRetryBacktest = useCallback(() => {
    setError(null);
    handleRunBacktest();
  }, [handleRunBacktest]);

  const handleRunOptimization = useCallback(async () => {
    const paramDefs = STRATEGY_PARAMS[selectedTemplate];
    if (paramDefs.length === 0) return;
    setOptimizeLoading(true);
    setOptimizeResults(null);
    try {
      const activeConstraints = showConstraints && Object.keys(optConstraints).length > 0 ? optConstraints : undefined;
      const basePayload = {
        ...(playgroundStrategyId ? { strategy_id: playgroundStrategyId } : { code }),
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        interval: config.interval,
      };

      const buildRanges = () => {
        const ranges: Record<string, {low: number; high: number; step?: number; type?: string}> = {};
        for (const p of paramDefs) {
          ranges[p.key] = {
            low: p.min ?? 0,
            high: p.max ?? 999,
            step: p.step,
            type: (p.step ?? 1) % 1 === 0 ? 'int' : 'float',
          };
        }
        return ranges;
      };

      const poll = (task_id: string) =>
        pollTaskResult(api.getOptimizationResult.bind(api), task_id).then(setOptimizeResults);

      if (optimizeMethod === 'bayesian') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) return;
        const { task_id } = await api.runBayesianOptimization({
          ...basePayload,
          param_ranges: ranges, n_trials: 50, objective_metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await poll(task_id);

      } else if (optimizeMethod === 'genetic') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) return;
        const { task_id } = await api.runGeneticOptimization({
          ...basePayload,
          param_ranges: ranges, population_size: 50, n_generations: 20,
          objective_metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await poll(task_id);

      } else if (optimizeMethod === 'multiobjective') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) return;
        const { task_id } = await api.runMultiObjectiveOptimization({
          ...basePayload,
          param_ranges: ranges, n_trials: 50,
          objective_metrics: [multiObjMetrics[0], multiObjMetrics[1]],
          directions: [multiObjMetrics[0] === 'max_drawdown' ? 'minimize' : 'maximize', multiObjMetrics[1] === 'max_drawdown' ? 'minimize' : 'maximize'],
          constraints: activeConstraints,
        });
        await poll(task_id);

      } else if (optimizeMethod === 'heatmap') {
        if (!heatmapParamX || !heatmapParamY || heatmapParamX === heatmapParamY) {
          setOptimizeResults({ error: 'Select two different parameters for the heatmap' });
          return;
        }
        const px = paramDefs.find(p => p.key === heatmapParamX);
        const py = paramDefs.find(p => p.key === heatmapParamY);
        if (!px || !py) return;
        const { task_id } = await api.runHeatmap({
          ...basePayload,
          param_x: heatmapParamX, param_y: heatmapParamY,
          x_range: { low: px.min ?? 0, high: px.max ?? 100, steps: 15 },
          y_range: { low: py.min ?? 0, high: py.max ?? 100, steps: 15 },
          metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await poll(task_id);

      } else {
        // Grid search
        const grid: Record<string, number[]> = {};
        for (const p of paramDefs) {
          const current = strategyParams[p.key] ?? p.default;
          const step = p.step ?? 1;
          const vals: number[] = [];
          for (let i = -2; i <= 2; i++) {
            const v = +(current + i * step * 2).toFixed(4);
            if (v >= (p.min ?? 0) && v <= (p.max ?? 999)) vals.push(v);
          }
          if (vals.length > 0) grid[p.key] = [...new Set(vals)];
        }
        if (Object.keys(grid).length === 0) return;
        const { task_id } = await api.runOptimization({
          ...basePayload,
          param_grid: grid, constraints: activeConstraints,
        });
        await poll(task_id);
      }
    } catch (err: unknown) {
      setOptimizeResults({ error: extractApiError(err, 'Optimization failed') });
    } finally {
      setOptimizeLoading(false);
    }
  }, [playgroundStrategyId, selectedTemplate, strategyParams, config, code, optimizeMethod, optConstraints, showConstraints, heatmapParamX, heatmapParamY, multiObjMetrics]);

  const handleRunWalkForward = useCallback(async () => {
    const useCode = strategyMode === 'templates';
    if (!playgroundStrategyId && !useCode) return;
    setWalkForwardLoading(true);
    setWalkForwardResults(null);
    try {
      const { task_id } = await api.runWalkForward({
        ...(playgroundStrategyId ? { strategy_id: playgroundStrategyId } : { code }),
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        n_splits: 5,
        train_pct: 0.7,
        purge_bars: walkForwardPurgeBars,
        window_mode: walkForwardWindowMode,
        interval: config.interval,
      });

      const res = await pollTaskResult(api.getWalkForwardResult.bind(api), task_id);
      setWalkForwardResults(res);
    } catch (err: unknown) {
      setWalkForwardResults({ error: extractApiError(err, 'Walk-forward failed') });
    } finally {
      setWalkForwardLoading(false);
    }
  }, [playgroundStrategyId, strategyMode, code, config, walkForwardPurgeBars, walkForwardWindowMode]);

  const handleRunOos = useCallback(async () => {
    const useCode = strategyMode === 'templates';
    if (!playgroundStrategyId && !useCode) return;
    setOosLoading(true);
    setOosResults(null);
    try {
      const { task_id } = await api.runOosValidation({
        ...(playgroundStrategyId ? { strategy_id: playgroundStrategyId } : { code }),
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        oos_ratio: 0.3,
        n_folds: oosNfolds,
        param_ranges: strategyMode === 'templates' ? { fast: { low: 5, high: 30, type: 'int' }, slow: { low: 20, high: 100, type: 'int' } } : undefined,
        n_trials: 30,
        interval: config.interval,
      });
      const res = await pollTaskResult(api.getOosResult.bind(api), task_id);
      setOosResults(res);
    } catch (err: unknown) {
      setOosResults({ error: extractApiError(err, 'OOS validation failed') });
    } finally {
      setOosLoading(false);
    }
  }, [playgroundStrategyId, strategyMode, code, config, oosNfolds]);

  const handleRunCpcv = useCallback(async () => {
    const useCode = strategyMode === 'templates';
    if (!playgroundStrategyId && !useCode) return;
    setCpcvLoading(true);
    setCpcvResults(null);
    try {
      const { task_id } = await api.runCpcv({
        ...(playgroundStrategyId ? { strategy_id: playgroundStrategyId } : { code }),
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        n_groups: cpcvNGroups,
        n_test_groups: 2,
        purge_bars: cpcvPurgeBars,
        embargo_bars: 0,
        param_ranges: strategyMode === 'templates' ? { fast: { low: 5, high: 30, type: 'int' }, slow: { low: 20, high: 100, type: 'int' } } : undefined,
        n_trials: 30,
        interval: config.interval,
      });
      const res = await pollTaskResult(api.getCpcvResult.bind(api), task_id, { maxAttempts: 180, intervalMs: 3000 });
      setCpcvResults(res);
    } catch (err: unknown) {
      setCpcvResults({ error: extractApiError(err, 'CPCV failed') });
    } finally {
      setCpcvLoading(false);
    }
  }, [playgroundStrategyId, strategyMode, code, config, cpcvNGroups, cpcvPurgeBars]);

  const handleRunFactorAttribution = useCallback(async () => {
    if (!lastBacktestId) return;
    setFactorLoading(true);
    setFactorResults(null);
    try {
      const { task_id } = await api.runFactorAttribution(lastBacktestId);
      const res = await pollTaskResult(api.getFactorAttributionResult.bind(api), task_id, { maxAttempts: 60 });
      setFactorResults(res);
    } catch (err: unknown) {
      setFactorResults({ error: extractApiError(err, 'Factor attribution failed') });
    } finally {
      setFactorLoading(false);
    }
  }, [lastBacktestId]);

  const handleRunMonteCarlo = useCallback(async () => {
    if (!lastBacktestId) return;
    setMonteCarloLoading(true);
    setMonteCarloResults(null);
    try {
      const { task_id } = await api.runMonteCarlo(lastBacktestId, {
        backtest_id: lastBacktestId,
        n_simulations: 1000,
      });

      const res = await pollTaskResult(api.getMonteCarloResult.bind(api), task_id, { maxAttempts: 60 });
      setMonteCarloResults(res);
    } catch (err: unknown) {
      setMonteCarloResults({ error: extractApiError(err, 'Monte Carlo failed') });
    } finally {
      setMonteCarloLoading(false);
    }
  }, [lastBacktestId]);

  const handleReset = () => {
    setCode(DEFAULT_CODE);
    setSelectedTemplate('sma_crossover');
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS.sma_crossover.forEach(p => { defaultParams[p.key] = p.default; });
    setStrategyParams(defaultParams);
    setResults(null);
    setError(null);
  };

  const updateCodeWithParams = (templateKey: StrategyTemplateKey, params: Record<string, number>) => {
    let templateCode = STRATEGY_TEMPLATES[templateKey].code;
    const paramDefs = STRATEGY_PARAMS[templateKey];
    for (const p of paramDefs) {
      const val = params[p.key] ?? p.default;
      const regex = new RegExp(`self\\.params\\.setdefault\\('${p.key}',\\s*[^)]+\\)`, 'g');
      templateCode = templateCode.replace(regex, `self.params.setdefault('${p.key}', ${val})`);
    }
    return templateCode;
  };

  const handleTemplateChange = (templateKey: StrategyTemplateKey) => {
    setSelectedTemplate(templateKey);
    setCode(STRATEGY_TEMPLATES[templateKey].code);
    const defaultParams: Record<string, number> = {};
    STRATEGY_PARAMS[templateKey].forEach(p => { defaultParams[p.key] = p.default; });
    setStrategyParams(defaultParams);
  };

  const handleCustomStrategySelect = async (value: string) => {
    setSelectedTemplate('custom');
    const id = parseInt(value, 10);
    if (isNaN(id)) return;
    try {
      const strategy = await api.getStrategy(id);
      setCode(strategy.code);
      setPlaygroundStrategyId(strategy.id);
      setStrategyParams((strategy.parameters as Record<string, number>) || {});
    } catch {
      setCode(STRATEGY_TEMPLATES.custom.code);
      setPlaygroundStrategyId(null);
    }
  };

  const handleCreateNewStrategy = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const strat = await api.createStrategy({
        title: 'New Strategy',
        code: STRATEGY_TEMPLATES.custom.code,
        parameters: {},
        is_public: false,
      });
      setCustomStrategies(prev => [strat, ...prev]);
      setPlaygroundStrategyId(strat.id);
      setCode(strat.code);
      setStrategyParams({});
      setSelectedTemplate('custom');
    } catch (err) {
      setError(extractApiError(err, 'Failed to create strategy'));
    }
  }, [isAuthenticated]);

  const refetchCustomStrategies = useCallback(async () => {
    if (!isAuthenticated) return;
    setCustomStrategiesLoading(true);
    try {
      const list = await api.getMyStrategies();
      setCustomStrategies(list);
      setDeletedStrategyIds(prev => new Set([...prev].filter(id => list.some(s => s.id === id))));
    } catch {
      setCustomStrategies([]);
    } finally {
      setCustomStrategiesLoading(false);
    }
  }, [isAuthenticated]);

  const [deletedStrategyIds, setDeletedStrategyIds] = useState<Set<number>>(new Set());
  const displayedCustomStrategies = useMemo(
    () => customStrategies.filter(s => !deletedStrategyIds.has(s.id)),
    [customStrategies, deletedStrategyIds]
  );

  const prevStrategyModeRef = useRef<'templates' | 'custom'>('templates');
  useEffect(() => {
    if (strategyMode === 'custom' && isAuthenticated && prevStrategyModeRef.current !== 'custom') {
      refetchCustomStrategies();
      prevStrategyModeRef.current = 'custom';
    } else if (strategyMode !== 'custom') {
      prevStrategyModeRef.current = strategyMode;
    }
  }, [strategyMode, isAuthenticated, refetchCustomStrategies]);

  const handleDuplicateStrategy = useCallback(async () => {
    if (!playgroundStrategyId || !isAuthenticated) return;
    const current = displayedCustomStrategies.find(s => s.id === playgroundStrategyId);
    try {
      const strat = await api.createStrategy({
        title: `Copy of ${current?.title ?? 'Strategy'}`,
        code,
        parameters: strategyParams,
        is_public: false,
      });
      setPlaygroundStrategyId(strat.id);
      setCustomStrategies(prev => [strat, ...prev]);
    } catch (err) {
      setError(extractApiError(err, 'Failed to duplicate strategy'));
    }
  }, [playgroundStrategyId, code, strategyParams, displayedCustomStrategies, isAuthenticated]);

  const handleDeleteStrategy = useCallback(async (strategyId?: number) => {
    const idToDelete = strategyId ?? playgroundStrategyId;
    if (!idToDelete) return;
    if (!confirm('Delete this strategy? This cannot be undone.')) return;
    if (idToDelete === playgroundStrategyId) {
    setPlaygroundStrategyId(null);
    setCode(STRATEGY_TEMPLATES.custom.code);
    setResults(null);
    }
    setCustomStrategies(prev => prev.filter(s => s.id !== idToDelete));
    try {
      await api.deleteStrategy(idToDelete);
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete strategy'));
      refetchCustomStrategies();
    }
  }, [playgroundStrategyId, refetchCustomStrategies]);

  const startRenameStrategy = useCallback((strategyId?: number) => {
    const id = strategyId ?? playgroundStrategyId;
    if (!id) return;
    const current = displayedCustomStrategies.find(s => s.id === id);
    setEditingRenameId(id);
    setRenameInputValue(current?.title ?? '');
  }, [playgroundStrategyId, displayedCustomStrategies]);

  const saveRenameStrategy = useCallback(async () => {
    if (!editingRenameId || !renameInputValue.trim()) {
      setEditingRenameId(null);
      return;
    }
    const trimmed = renameInputValue.trim();
    try {
      await api.updateStrategy(editingRenameId, { title: trimmed });
      setCustomStrategies(prev => prev.map(s => s.id === editingRenameId ? { ...s, title: trimmed } : s));
      setEditingRenameId(null);
    } catch (err) {
      setError(extractApiError(err, 'Failed to rename strategy'));
    }
  }, [editingRenameId, renameInputValue]);

  const cancelRenameStrategy = useCallback(() => {
    setEditingRenameId(null);
    setRenameInputValue('');
  }, []);

  // Export results as CSV
  const handleExportResults = useCallback(() => {
    if (!results) return;
    
    const tradesCsv = results.trades.length > 0
      ? [
          '',
          'Trades',
          'Entry Date,Exit Date,Type,Entry Price,Exit Price,Size,P&L,P&L %,Commission',
          ...results.trades.map(t =>
            `${t.entry_date},${t.exit_date},${t.type},${t.entry_price.toFixed(2)},${t.exit_price.toFixed(2)},${t.size},${t.pnl.toFixed(2)},${t.pnl_pct.toFixed(2)}%,${t.commission.toFixed(2)}`
          ),
        ]
      : [];

    const csvContent = [
      'Metric,Value',
      `Total Return,${results.total_return.toFixed(2)}%`,
      `Sharpe Ratio,${results.sharpe_ratio.toFixed(2)}`,
      `Max Drawdown,${results.max_drawdown.toFixed(1)}%`,
      `Win Rate,${results.win_rate.toFixed(0)}%`,
      `Total Trades,${results.total_trades}`,
      `Final Value,$${results.final_value.toFixed(2)}`,
      results.sortino_ratio !== undefined ? `Sortino Ratio,${results.sortino_ratio.toFixed(2)}` : '',
      results.profit_factor !== undefined ? `Profit Factor,${results.profit_factor.toFixed(2)}` : '',
      results.var_95 != null ? `VaR 95%,${results.var_95.toFixed(2)}%` : '',
      results.cvar_95 != null ? `CVaR 95%,${results.cvar_95.toFixed(2)}%` : '',
      results.var_99 != null ? `VaR 99%,${results.var_99.toFixed(2)}%` : '',
      results.cvar_99 != null ? `CVaR 99%,${results.cvar_99.toFixed(2)}%` : '',
      results.benchmark_return !== undefined ? `Benchmark Return,${results.benchmark_return.toFixed(2)}%` : '',
      results.benchmark_return !== undefined ? `Alpha,${(results.total_return - results.benchmark_return).toFixed(2)}%` : '',
      '',
      'Configuration',
      `Symbol,${config.symbol}`,
      `Start Date,${config.startDate}`,
      `End Date,${config.endDate}`,
      `Initial Capital,$${config.initialCapital}`,
      `Slippage,${config.slippage}%`,
      `Commission,${config.commission}%`,
      ...tradesCsv,
    ].filter(Boolean).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-${config.symbol}-${config.startDate}-${config.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, config]);

  const handleExportJSON = useCallback(() => {
    if (!results) return;
    const jsonData = JSON.stringify(results, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_${config.symbol}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, config.symbol]);

  const generateLocalTearsheet = useCallback((r: any) => {
    const ec = JSON.stringify(r.equity_curve || []);
    const dd = JSON.stringify(r.drawdown_series || []);
    const trades = r.trades || [];
    const pnls = trades.map((t: any) => t.pnl || 0);
    const bins = 15;
    const mn = Math.min(...pnls, 0);
    const mx = Math.max(...pnls, 0);
    const step = (mx - mn) / bins || 1;
    const hist = Array.from({length: bins}, (_, i) => {
      const lo = mn + i * step;
      const hi = lo + step;
      const cnt = pnls.filter((v: number) => v >= lo && (i === bins-1 ? v <= hi : v < hi)).length;
      return { bin_center: (lo+hi)/2, count: cnt };
    });
    const histData = JSON.stringify(hist);
    const monthlyMap: Record<string, Record<number, number>> = {};
    let prev = (r.equity_curve?.[0]?.equity) || 1;
    let pM = -1, pY = -1, mStart = prev;
    for (const pt of (r.equity_curve || [])) {
      const d = new Date(pt.date);
      const y = d.getFullYear(), m = d.getMonth();
      if (pM !== -1 && (m !== pM || y !== pY)) {
        if (!monthlyMap[pY]) monthlyMap[pY] = {};
        monthlyMap[pY][pM] = mStart > 0 ? ((prev / mStart) - 1) * 100 : 0;
        mStart = prev;
      }
      prev = pt.equity; pM = m; pY = y;
    }
    if (pM !== -1) { if (!monthlyMap[pY]) monthlyMap[pY] = {}; monthlyMap[pY][pM] = mStart > 0 ? ((prev/mStart)-1)*100 : 0; }
    const mData = JSON.stringify(Object.entries(monthlyMap).flatMap(([yr, ms]) =>
      Object.entries(ms).map(([mo, ret]) => ({year: +yr, month: +mo+1, return_pct: Math.round((ret as number)*100)/100}))
    ));

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tear Sheet</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;padding:24px}.c{max-width:1200px;margin:0 auto}h1{font-size:24px;color:#fff;margin-bottom:8px}h2{font-size:18px;color:#a0a0b0;margin:24px 0 12px;border-bottom:1px solid #1a1a2e;padding-bottom:8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px}.m{background:#12121a;border:1px solid #1a1a2e;border-radius:8px;padding:14px}.ml{font-size:11px;color:#666;text-transform:uppercase}.mv{font-size:20px;font-weight:600;margin-top:4px}.pos{color:#10b981}.neg{color:#ef4444}.cc{background:#12121a;border:1px solid #1a1a2e;border-radius:8px;padding:16px;margin-bottom:16px}canvas{width:100%;height:200px}</style></head>
<body><div class="c"><h1>Backtest Report: ${config.symbol}</h1><p style="color:#666;font-size:13px;margin-bottom:24px">${new Date().toISOString().split('T')[0]} · Ceap Council Engine v2</p>
<h2>Performance</h2><div class="g">
<div class="m"><div class="ml">Return</div><div class="mv ${(r.total_return||0)>=0?'pos':'neg'}">${(r.total_return||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">Sharpe</div><div class="mv">${(r.sharpe_ratio||0).toFixed(4)}</div></div>
<div class="m"><div class="ml">Sortino</div><div class="mv">${(r.sortino_ratio||0).toFixed(4)}</div></div>
<div class="m"><div class="ml">Max Drawdown</div><div class="mv neg">${(r.max_drawdown||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">Win Rate</div><div class="mv">${(r.win_rate||0).toFixed(1)}%</div></div>
<div class="m"><div class="ml">Trades</div><div class="mv">${r.total_trades||0}</div></div>
<div class="m"><div class="ml">Profit Factor</div><div class="mv">${(r.profit_factor||0).toFixed(2)}</div></div>
<div class="m"><div class="ml">Final Value</div><div class="mv">$${(r.final_value||0).toLocaleString()}</div></div>
<div class="m"><div class="ml">VaR 95%</div><div class="mv neg">${(r.var_95||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">CVaR 95%</div><div class="mv neg">${(r.cvar_95||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">VaR 99%</div><div class="mv neg">${(r.var_99||0).toFixed(2)}%</div></div>
<div class="m"><div class="ml">CVaR 99%</div><div class="mv neg">${(r.cvar_99||0).toFixed(2)}%</div></div>
</div>
<h2>Equity Curve</h2><div class="cc"><canvas id="eq"></canvas></div>
<h2>Drawdown</h2><div class="cc"><canvas id="dd"></canvas></div>
<h2>Trade P&L Distribution</h2><div class="cc"><canvas id="dist"></canvas></div>
<script>
function draw(id,data,key,color,fill){const c=document.getElementById(id);if(!c||!data.length)return;const x=c.getContext('2d');const r=c.getBoundingClientRect();const d=window.devicePixelRatio||1;c.width=r.width*d;c.height=200*d;c.style.height='200px';x.scale(d,d);const w=r.width,h=200;const v=data.map(p=>p[key]);const mn=Math.min(...v),mx=Math.max(...v),rng=mx-mn||1;x.beginPath();x.strokeStyle=color;x.lineWidth=1.5;for(let i=0;i<v.length;i++){const px=i/(v.length-1)*w,py=h-((v[i]-mn)/rng)*(h-20)-10;i===0?x.moveTo(px,py):x.lineTo(px,py)}x.stroke();if(fill){x.lineTo(w,h);x.lineTo(0,h);x.closePath();x.fillStyle=color.replace(')',',0.1)').replace('rgb','rgba');x.fill()}}
function hist(id,data){const c=document.getElementById(id);if(!c||!data.length)return;const x=c.getContext('2d');const r=c.getBoundingClientRect();const d=window.devicePixelRatio||1;c.width=r.width*d;c.height=200*d;c.style.height='200px';x.scale(d,d);const w=r.width,h=200;const mx=Math.max(...data.map(d=>d.count));const bw=w/data.length-2;data.forEach((d,i)=>{const bh=d.count/mx*(h-30);x.fillStyle=d.bin_center>=0?'#10b981':'#ef4444';x.fillRect(i*(bw+2),h-bh-15,bw,bh)})}
draw('eq',${ec},'equity','rgb(16,185,129)',true);
draw('dd',${dd},'drawdown_pct','rgb(239,68,68)',true);
hist('dist',${histData});
</script></div></body></html>`;
  }, [config.symbol]);

  const handleSave = useCallback(async () => {
    if (!isAuthenticated) return;
    // Only save existing custom strategies - never create new ones
    if (strategyMode !== 'custom' || !playgroundStrategyId) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams });
      setSaveMessage('Strategy saved!');
      setLastEditorSaveTime(Date.now());
      setEditorSaveStatus('saved');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage('Failed to save');
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [isAuthenticated, strategyMode, playgroundStrategyId, code, strategyParams]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to run backtest
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && isAuthenticated && !(strategyMode === 'custom' && !playgroundStrategyId)) {
          handleRunBacktest();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isAuthenticated, handleRunBacktest, strategyMode, playgroundStrategyId]);

  // Dragging handlers for floating editor
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - editorPosition.x,
      y: e.clientY - editorPosition.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setEditorPosition({
        x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 300)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 50)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Setup panel: drag and resize
  const handleSetupPanelDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSetupPanel(true);
    setupPanelDragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: setupPanelPosition.x, startTop: setupPanelPosition.y };
  };
  const handleSetupPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingSetupPanel(true);
    setupPanelResizeRef.current = { startX: e.clientX, startY: e.clientY, startW: setupPanelSize.w, startH: setupPanelSize.h };
  };
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isDraggingSetupPanel) {
        const dx = e.clientX - setupPanelDragRef.current.startX;
        const dy = e.clientY - setupPanelDragRef.current.startY;
        setSetupPanelPosition({
          x: Math.max(0, setupPanelDragRef.current.startLeft + dx),
          y: Math.max(0, setupPanelDragRef.current.startTop + dy),
        });
      } else if (isResizingSetupPanel) {
        const dx = e.clientX - setupPanelResizeRef.current.startX;
        const dy = e.clientY - setupPanelResizeRef.current.startY;
        setSetupPanelSize({
          w: Math.max(260, Math.min(600, setupPanelResizeRef.current.startW + dx)),
          h: Math.max(200, Math.min(window.innerHeight - 80, setupPanelResizeRef.current.startH + dy)),
        });
      }
    };
    const handleUp = () => {
      setIsDraggingSetupPanel(false);
      setIsResizingSetupPanel(false);
    };
    if (isDraggingSetupPanel || isResizingSetupPanel) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isResizingSetupPanel ? 'nwse-resize' : 'move';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    }
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingSetupPanel, isResizingSetupPanel]);

  // Resize handle for results panel
  const handleResultsResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingResults(true);
    resizeStartRef.current = { x: e.clientX, w: resultsPanelWidth };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingResults) return;
      const delta = resizeStartRef.current.x - e.clientX; // drag left = positive delta = wider
      const newW = Math.min(600, Math.max(260, resizeStartRef.current.w + delta));
      setResultsPanelWidth(newW);
    };
    const handleMouseUp = () => setIsResizingResults(false);
    if (isResizingResults) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingResults]);

  const daysOfData = Math.round((new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 60 * 60 * 24));

  const handleFullscreen = useCallback(() => {
    if (!playgroundRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      playgroundRef.current.requestFullscreen();
    }
  }, []);

  const handleScreenshot = useCallback(async () => {
    if (!chartAreaRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(chartAreaRef.current, {
        backgroundColor: '#030712',
        scale: window.devicePixelRatio || 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `chart-${config.symbol}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // ignore
    }
  }, [config.symbol]);

  return (
    <div ref={playgroundRef} className="h-full flex flex-col bg-white text-gray-900">
      {/* Chart Header - TradingView style: asset, interval, run, actions */}
      <ChartHeader
        symbol={config.symbol}
        interval={config.interval}
        symbolOptions={SYMBOLS.some(s => s.value === config.symbol) ? SYMBOLS : [{ value: config.symbol, label: config.symbol }, ...SYMBOLS]}
        onSymbolChange={(s) => setConfig({ ...config, symbol: s })}
        onIntervalChange={(i) => setConfig({ ...config, interval: i })}
        onRun={handleRunBacktest}
        onCancel={handleCancelBacktest}
        isRunning={isRunning}
        canRun={strategyMode !== 'custom' || !!playgroundStrategyId}
        runDisabledReason={strategyMode === 'custom' && !playgroundStrategyId ? 'Select a strategy to run' : undefined}
        onReset={handleReset}
        onSave={strategyMode === 'custom' && !!playgroundStrategyId ? handleSave : undefined}
        isSaving={isSaving}
        saveMessage={saveMessage}
        isAuthenticated={isAuthenticated}
        onFullscreen={handleFullscreen}
        onScreenshot={handleScreenshot}
      />

      {/* Error banner - visible when backtest/validation fails */}
      {error && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-3 py-2 bg-red-900/30 border-b border-red-800/60 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-red-200 truncate">{error}</span>
                  </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isRunning && (
              <button onClick={handleRetryBacktest} className="px-2.5 py-1 text-xs font-medium text-red-200 hover:text-white bg-red-800/50 hover:bg-red-800 rounded transition">
                Retry
                  </button>
            )}
            <button onClick={() => setError(null)} className="p-1 text-red-400 hover:text-white rounded transition" title="Dismiss">
              <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

      {/* Main Content Area - chart uses full width, icon bar overlays */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Icon toolbar - absolute overlay on left edge, no layout space */}
        <div className="absolute left-0 top-0 bottom-0 z-30 flex flex-col bg-white border-r border-gray-200 w-12 items-center py-2 gap-0.5 overflow-visible shadow-sm">
            {(['strategy', 'dates', 'capital', 'benchmark', 'costs', 'risk', 'engine'] as const).map((panel) => {
              const labels = { strategy: 'Strategy', dates: 'Dates', capital: 'Capital', benchmark: 'Benchmark', costs: 'Costs', risk: 'Risk', engine: 'Engine' };
              const icons = { strategy: FileCode, dates: Calendar, capital: DollarSign, benchmark: TrendingUp, costs: Percent, risk: Shield, engine: Settings };
              const Icon = icons[panel];
              return (
                <div key={panel} className="group relative">
                      <button
                    onClick={() => setActiveSetupPanel(activeSetupPanel === panel ? null : panel)}
                    className={`p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 ${activeSetupPanel === panel ? 'bg-gray-100 text-emerald-600' : ''}`}
                      >
                    <Icon className="h-5 w-5" />
                      </button>
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-gray-900 bg-white border border-gray-200 rounded shadow-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                    {labels[panel]}
                    </span>
                </div>
              );
            })}
              </div>

        {/* Main Content - Chart + Results Bar - ml-12 reserves space for icon bar overlay */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden ml-12">
          <div ref={chartAreaRef} className={`flex-1 min-h-[300px] relative flex flex-col overflow-hidden ${effectiveChartTheme === 'light' ? 'bg-gray-50' : 'bg-gray-950'}`}>
            <ErrorBoundary label="Chart">
                <AssetChart 
                  symbol={config.symbol} 
                  startDate={config.startDate} 
                  endDate={config.endDate}
                  interval={config.interval}
                  trades={tradeMarkers}
                equityCurve={results?.equity_curve}
                drawdownSeries={results?.drawdown_series}
                benchmarkReturn={results?.benchmark_return ?? undefined}
                chartTheme={effectiveChartTheme}
              />
            </ErrorBoundary>
        </div>

          {/* Results Bar - under chart */}
                {results && (
            <ResultsBar
              results={results}
              expanded={resultsBarExpanded}
              onToggle={() => setResultsBarExpanded((v) => !v)}
              onExport={handleExportResults}
              renderContent={() => (
                <div className="p-3 pb-6">
                  <div className="space-y-3 pb-3 border-b border-gray-200">
                    <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Analysis</div>
                    {/* Primary tabs */}
                    <div className="flex gap-1 p-1 rounded-lg bg-gray-100 border border-gray-200">
                      {(['summary', 'trades', 'orders', 'charts'] as const).map((tab) => {
                        const primaryIcons = { summary: LayoutDashboard, trades: ArrowLeftRight, orders: ListOrdered, charts: LineChartIcon };
                        const Icon = primaryIcons[tab];
                        return (
                      <button
                        key={tab}
                        onClick={() => setActiveResultsTab(tab)}
                            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-md transition-all duration-150 ${
                              activeResultsTab === tab
                                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/40 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 border border-transparent'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{tab === 'summary' ? 'Summary' : tab === 'trades' ? 'Trades' : tab === 'orders' ? 'Orders' : 'Charts'}</span>
                      </button>
                        );
                      })}
                  </div>
                    {/* Secondary / advanced tabs - 2 rows of 4 */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['tca', 'optimize', 'walkforward', 'oos', 'cpcv', 'factors', 'montecarlo', 'risk', 'heatmap', 'distribution', 'compare'] as const).map((tab) => {
                        const secondaryIcons = { tca: Activity, optimize: Sliders, walkforward: GitBranch, oos: Filter, cpcv: Layers, factors: PieChart, montecarlo: Shuffle, risk: Shield, heatmap: Calendar, distribution: BarChart2, compare: GitCompare };
                        const Icon = secondaryIcons[tab];
                        const label = ({ tca: 'TCA', optimize: 'Optimize', walkforward: 'Walk-Fwd', oos: 'OOS', cpcv: 'CPCV', factors: 'Factors', montecarlo: 'Monte Carlo', risk: 'Risk', heatmap: 'Monthly', distribution: 'Dist.', compare: 'Compare' } as Record<string, string>)[tab];
                        return (
                      <button
                        key={tab}
                        onClick={() => setActiveResultsTab(tab)}
                            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md transition-all duration-150 ${
                              activeResultsTab === tab
                                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 border border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <Icon className="h-3 w-3 shrink-0 opacity-80" />
                            <span className="truncate">{label}</span>
                      </button>
                        );
                      })}
                  </div>
                </div>
                  <div className="pt-3 min-h-[200px] flex flex-col">
                <ErrorBoundary label="Results">
                      {activeResultsTab === 'summary' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className={`p-3 rounded-lg border ${results.total_return >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Return</div>
                              <div className={`text-xl font-bold ${results.total_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {results.total_return >= 0 ? '+' : ''}{results.total_return.toFixed(2)}%
                  </div>
                  </div>
                            <div className={`p-3 rounded-lg border ${(results.final_value - results.initial_capital) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Net Profit</div>
                              <div className={`text-xl font-bold ${(results.final_value - results.initial_capital) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {(results.final_value - results.initial_capital) >= 0 ? '+' : ''}${(results.final_value - results.initial_capital).toFixed(0)}
                  </div>
                        </div>
                            <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Max Drawdown</div>
                              <div className={`text-xl font-bold ${results.max_drawdown > -20 ? 'text-emerald-600' : 'text-red-500'}`}>{results.max_drawdown.toFixed(1)}%</div>
                        </div>
                            <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Trades</div>
                              <div className="text-xl font-bold text-gray-900">{results.total_trades}</div>
                      </div>
                          </div>
                      {results.benchmark_return !== undefined && (
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 flex justify-between items-center">
                              <span className="text-[11px] text-gray-500">vs Buy &amp; Hold</span>
                              <span className={results.total_return > results.benchmark_return ? 'text-emerald-600' : 'text-amber-600'}>
                                Alpha {(results.total_return - results.benchmark_return) >= 0 ? '+' : ''}{(results.total_return - results.benchmark_return).toFixed(1)}%
                            </span>
                        </div>
                      )}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><Activity className="h-3 w-3" /> Sharpe</div>
                              <div className={`text-sm font-semibold ${results.sharpe_ratio > 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{results.sharpe_ratio.toFixed(2)}</div>
                          </div>
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><TrendingDown className="h-3 w-3" /> Drawdown</div>
                              <div className={`text-sm font-semibold ${results.max_drawdown > -20 ? 'text-emerald-600' : 'text-red-500'}`}>{results.max_drawdown.toFixed(1)}%</div>
                          </div>
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><Target className="h-3 w-3" /> Win Rate</div>
                              <div className={`text-sm font-semibold ${results.win_rate && results.win_rate > 50 ? 'text-emerald-600' : 'text-amber-600'}`}>{results.win_rate?.toFixed(0) ?? 0}%</div>
                        </div>
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><BarChart3 className="h-3 w-3" /> Trades</div>
                              <div className="text-sm font-semibold text-gray-900">{results.total_trades}</div>
                          </div>
                          </div>
                          {(results as { versioning?: { code_hash?: string; data_hash?: string; config_hash?: string } }).versioning && (
                            <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 text-[10px] text-gray-500" title="Reproducible run – config/code/data hashed for versioning">
                              Reproducible run
                            </div>
                          )}
                            </div>
                          )}
                      {activeResultsTab === 'trades' && (
                        <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-gray-200 overflow-hidden">
                          <TradeLog trades={results.trades ?? []} />
                            </div>
                          )}
                      {activeResultsTab === 'orders' && results.orders && results.orders.length > 0 && (
                        <div className="space-y-2 overflow-x-auto">
                          <div className="text-xs font-semibold text-gray-500 mb-2">{results.orders.length} Orders</div>
                            <table className="w-full text-xs">
                              <thead>
                              <tr className="text-gray-500 border-b border-gray-200">
                                  <th className="text-left py-1 px-1">Side</th>
                                  <th className="text-left py-1 px-1">Type</th>
                                  <th className="text-right py-1 px-1">Qty</th>
                                  <th className="text-right py-1 px-1">Fill Price</th>
                                  <th className="text-right py-1 px-1">Comm.</th>
                                  <th className="text-left py-1 px-1">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {results.orders.slice(0, 100).map((order, i) => (
                                  <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className={`py-1 px-1 ${order.side === 'buy' ? 'text-emerald-600' : 'text-red-600'}`}>{order.side.toUpperCase()}</td>
                                    <td className="py-1 px-1 text-gray-700">{order.order_type}</td>
                                    <td className="py-1 px-1 text-right text-gray-700">{order.filled_quantity}</td>
                                    <td className="py-1 px-1 text-right text-gray-900">${order.avg_fill_price.toFixed(2)}</td>
                                    <td className="py-1 px-1 text-right text-gray-500">${order.commission.toFixed(2)}</td>
                                  <td className="py-1 px-1"><span className={`text-[10px] px-1 py-0.5 rounded ${order.status === 'filled' ? 'bg-emerald-50 text-emerald-700' : order.status === 'cancelled' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{order.status}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                        </div>
                      )}
                      {activeResultsTab === 'orders' && (!results.orders || results.orders.length === 0) && (
                        <div className="text-center py-8 text-gray-500 text-xs">Order history shown above.</div>
                      )}
                      {activeResultsTab === 'charts' && (
                        <div className="space-y-4">
                          {results.equity_curve?.length ? (
                            <div className="h-32">
                              <div className="text-[10px] text-gray-500 mb-0.5">Equity curve</div>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={results.equity_curve.map(p => ({ ...p, value: p.equity }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                  <YAxis hide domain={['auto', 'auto']} />
                                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', fontSize: 11 }} />
                                  <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#eqGrad)" strokeWidth={1.5} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          ) : null}
                          {results.drawdown_series?.length ? (
                            <div className="h-24">
                              <div className="text-[10px] text-gray-500 mb-0.5">Drawdown</div>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={results.drawdown_series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                  <YAxis hide domain={['auto', 0]} />
                                  <Area type="monotone" dataKey="drawdown_pct" stroke="#ef4444" fill="url(#ddGrad)" strokeWidth={1.5} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          ) : null}
                          {results.custom_charts && Object.keys(results.custom_charts).length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-[10px] text-gray-500">Custom series</div>
                              {Object.entries(results.custom_charts).map(([name, data]) => (
                                data?.length ? (
                                <div key={name} className="h-20">
                                  <div className="text-[10px] text-gray-400 mb-0.5">{name}</div>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                                      <XAxis dataKey="date" hide />
                                      <YAxis hide />
                                      <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                                    </LineChart>
                                  </ResponsiveContainer>
                        </div>
                                ) : null
                              ))}
                            </div>
                          ) : null}
                          {(!results.equity_curve?.length && !results.drawdown_series?.length && (!results.custom_charts || Object.keys(results.custom_charts).length === 0)) && (
                            <div className="text-center py-6 text-gray-500 text-xs">No chart data.</div>
                      )}
                    </div>
                      )}
                      {activeResultsTab === 'optimize' && (
                        <div className="space-y-3">
                          {strategyMode === 'templates' && STRATEGY_PARAMS[selectedTemplate].length > 0 ? (
                            <>
                              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Configuration</div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <select value={optimizeMethod} onChange={(e) => setOptimizeMethod(e.target.value as typeof optimizeMethod)} className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900">
                                    <option value="grid">Grid</option>
                                    <option value="bayesian">Bayesian</option>
                                    <option value="genetic">Genetic</option>
                                    <option value="multiobjective">Multi-objective</option>
                                    <option value="heatmap">Heatmap</option>
                                  </select>
                                  {optimizeMethod === 'heatmap' && (
                                    <>
                                      <select value={heatmapParamX} onChange={(e) => setHeatmapParamX(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900">
                                        <option value="">Param X</option>
                                        {STRATEGY_PARAMS[selectedTemplate].map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                      </select>
                                      <select value={heatmapParamY} onChange={(e) => setHeatmapParamY(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900">
                                        <option value="">Param Y</option>
                                        {STRATEGY_PARAMS[selectedTemplate].map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                      </select>
                                    </>
                                  )}
                                  <button onClick={handleRunOptimization} disabled={optimizeLoading || (optimizeMethod === 'heatmap' && (!heatmapParamX || !heatmapParamY || heatmapParamX === heatmapParamY))} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium">
                                    {optimizeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run
                                  </button>
                          </div>
                            </div>
                              {optimizeResults?.error && (
                                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{optimizeResults.error}</div>
                              )}
                              {optimizeResults && !optimizeResults.error && optimizeResults.results && (
                                <div className="rounded-lg border border-gray-200 overflow-hidden">
                                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-gray-50 sticky top-0">
                                        <tr className="text-gray-500 border-b border-gray-200">
                                          {Object.keys(optimizeResults.results[0]?.params || {}).map(k => <th key={k} className="text-left py-2 px-2 font-medium">{k}</th>)}
                                          <th className="text-right py-2 px-2 font-medium">Sharpe</th>
                                          <th className="text-right py-2 px-2 font-medium">Return</th>
                                          <th className="text-right py-2 px-2 font-medium">Max DD</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {optimizeResults.results.slice(0, 20).map((r: { params: Record<string, number>; sharpe_ratio?: number; total_return?: number; max_drawdown?: number }, i: number) => (
                                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                                            {Object.values(r.params || {}).map((v, j) => <td key={j} className="py-1.5 px-2 font-mono text-gray-700">{v}</td>)}
                                            <td className="text-right py-1.5 px-2">{r.sharpe_ratio?.toFixed(2) ?? '-'}</td>
                                            <td className="text-right py-1.5 px-2">{(r.total_return ?? 0).toFixed(1)}%</td>
                                            <td className="text-right py-1.5 px-2">{(r.max_drawdown ?? 0).toFixed(1)}%</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                            </div>
                            </div>
                              )}
                              {optimizeResults?.heatmap && (
                                <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-500">Heatmap: use Setup panel for full 2D view.</div>
                              )}
                        </>
                      ) : (
                            <div className="text-center py-8 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs">Optimization requires a template strategy with parameters.</div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'oos' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Out-of-sample validation</div>
                            <p className="text-[11px] text-gray-500 mb-2">Optimize params on in-sample data, then test on held-out OOS period to detect overfitting.</p>
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">Folds</label>
                              <select value={oosNfolds} onChange={(e) => setOosNfolds(parseInt(e.target.value, 10))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900">
                                <option value={1}>1 (single split)</option>
                                <option value={3}>3 (k-fold)</option>
                                <option value={5}>5 (k-fold)</option>
                              </select>
                    </div>
                            <button onClick={handleRunOos} disabled={oosLoading || (!playgroundStrategyId && strategyMode !== 'templates')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {oosLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run OOS Validation
                          </button>
                      </div>
                          {oosResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{oosResults.error}</div>
                          )}
                          {oosResults && !oosResults.error && (oosResults.is_result || oosResults.n_folds > 1) && (
                            <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">IS vs OOS</div>
                        <div className="grid grid-cols-2 gap-2">
                                {oosResults.is_result ? (
                                  <>
                                    <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                      <div className="text-[10px] text-gray-500">In-sample</div>
                                      <div className="text-xs font-mono text-gray-700">{oosResults.is_period}</div>
                                      <div className="text-sm font-semibold text-gray-900">Sharpe {(oosResults.is_sharpe ?? 0).toFixed(2)} · Return {(oosResults.is_result?.total_return ?? 0).toFixed(1)}%</div>
                          </div>
                                    <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                      <div className="text-[10px] text-gray-500">Out-of-sample</div>
                                      <div className="text-xs font-mono text-gray-700">{oosResults.oos_period}</div>
                                      <div className={`text-sm font-semibold ${(oosResults.oos_sharpe ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Sharpe {(oosResults.oos_sharpe ?? 0).toFixed(2)} · Return {(oosResults.oos_result?.total_return ?? 0).toFixed(1)}%</div>
                          </div>
                                  </>
                                ) : oosResults.n_folds > 1 ? (
                                  <div className="col-span-2 p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[10px] text-gray-500">K-fold cross-validation</div>
                                    <div className="text-sm font-semibold text-gray-900">Sharpe {oosResults.oos_sharpe_mean?.toFixed(2)} ± {oosResults.oos_sharpe_std?.toFixed(2)} · Return {(oosResults.oos_return_mean ?? 0).toFixed(1)}% ± {(oosResults.oos_return_std ?? 0).toFixed(1)}%</div>
                        </div>
                                ) : null}
                              </div>
                              {oosResults.multiple_testing_note && (
                                <div className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[11px]">{oosResults.multiple_testing_note}</div>
                              )}
                              {oosResults.overfit_score != null && (
                                <div className={`p-2 rounded-lg border text-xs ${oosResults.overfit_score > 50 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200'}`}>
                                  Overfit score: <span className="font-semibold">{oosResults.overfit_score}%</span> {oosResults.overfit_score > 50 ? '(high – strategy may be overfit)' : '(low – good generalization)'}
                        </div>
                      )}
                              {oosResults.n_folds > 1 && !oosResults.is_result && (
                                <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 text-xs">
                                  <span className="font-medium">K-fold ({oosResults.n_folds} folds):</span> Sharpe {oosResults.oos_sharpe_mean?.toFixed(2)} ± {oosResults.oos_sharpe_std?.toFixed(2)} · Return {(oosResults.oos_return_mean ?? 0).toFixed(1)}% ± {(oosResults.oos_return_std ?? 0).toFixed(1)}%
                          </div>
                        )}
                              {Object.keys(oosResults.best_params || {}).length > 0 && (
                                <div className="text-[10px] text-gray-500">Best params: {JSON.stringify(oosResults.best_params)}</div>
                        )}
                      </div>
                          )}
                          {oosResults && !oosResults.error && !oosResults.is_result && oosResults.status === 'completed' && (
                            <div className="px-3 py-4 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs text-center">No optimization – run with param_ranges for IS/OOS comparison.</div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'cpcv' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Combinatorial Purged Cross-Validation</div>
                            <p className="text-[11px] text-gray-500 mb-2">Tests every combination of held-out groups with purging to prevent look-ahead bias. Produces a distribution of OOS performance — not just one number.</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Groups (N)</label>
                                <select value={cpcvNGroups} onChange={(e) => setCpcvNGroups(parseInt(e.target.value, 10))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900">
                                  {[4, 5, 6, 8, 10].map(n => (
                                    <option key={n} value={n}>{n} groups ({n * (n - 1) / 2} paths)</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Purge bars</label>
                                <input type="number" min={0} max={100} value={cpcvPurgeBars} onChange={(e) => setCpcvPurgeBars(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" title="Bars removed at train/test boundaries" />
                              </div>
                            </div>
                            <button onClick={handleRunCpcv} disabled={cpcvLoading || (!playgroundStrategyId && strategyMode !== 'templates')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {cpcvLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run CPCV
                            </button>
                          </div>
                          {cpcvResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{cpcvResults.error}</div>
                          )}
                          {cpcvResults && !cpcvResults.error && cpcvResults.status === 'completed' && (
                            <div className="space-y-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">OOS Distribution ({cpcvResults.valid_paths} / {cpcvResults.total_paths} paths)</div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">OOS Sharpe (mean)</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.oos_sharpe_mean ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(cpcvResults.oos_sharpe_mean ?? 0).toFixed(2)}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">OOS Sharpe (std)</div>
                                  <div className="text-sm font-semibold text-gray-900">± {(cpcvResults.oos_sharpe_std ?? 0).toFixed(2)}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Median Sharpe</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.oos_sharpe_median ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(cpcvResults.oos_sharpe_median ?? 0).toFixed(2)}</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">OOS Return (mean)</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.oos_return_mean ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(cpcvResults.oos_return_mean ?? 0).toFixed(1)}%</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Train Sharpe (mean)</div>
                                  <div className="text-sm font-semibold text-gray-900">{(cpcvResults.train_sharpe_mean ?? 0).toFixed(2)}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">P(OOS Loss)</div>
                                  <div className={`text-sm font-semibold ${(cpcvResults.prob_oos_loss ?? 0) > 50 ? 'text-red-500' : 'text-emerald-600'}`}>{(cpcvResults.prob_oos_loss ?? 0).toFixed(0)}%</div>
                                </div>
                              </div>
                              {cpcvResults.overfit_score != null && (
                                <div className={`p-2 rounded-lg border text-xs ${cpcvResults.overfit_score > 50 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200'}`}>
                                  Overfit score: <span className="font-semibold">{cpcvResults.overfit_score}%</span> {cpcvResults.overfit_score > 50 ? '(high – strategy may be overfit)' : '(low – good generalization)'}
                                </div>
                              )}
                              {cpcvResults.paths && cpcvResults.paths.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Path Details</div>
                                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                                    <table className="w-full text-[11px]">
                                      <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Path</th>
                                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Test Groups</th>
                                          <th className="px-2 py-1 text-right text-gray-500 font-medium">Train Sharpe</th>
                                          <th className="px-2 py-1 text-right text-gray-500 font-medium">OOS Sharpe</th>
                                          <th className="px-2 py-1 text-right text-gray-500 font-medium">OOS Return</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {cpcvResults.paths.map((p: any) => (
                                          <tr key={p.path} className="hover:bg-gray-50">
                                            <td className="px-2 py-1 text-gray-700">{p.path}</td>
                                            <td className="px-2 py-1 text-gray-500 font-mono">[{p.test_groups.join(', ')}]</td>
                                            <td className="px-2 py-1 text-right text-gray-700">{p.train_sharpe != null ? p.train_sharpe.toFixed(2) : '-'}</td>
                                            <td className={`px-2 py-1 text-right font-medium ${(p.test_sharpe ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{p.test_sharpe != null ? p.test_sharpe.toFixed(2) : '-'}</td>
                                            <td className={`px-2 py-1 text-right ${(p.test_return ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{p.test_return != null ? `${p.test_return.toFixed(1)}%` : '-'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'factors' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Multi-Factor Attribution</div>
                            <p className="text-[11px] text-gray-500 mb-2">Decomposes returns into Market, Size (SMB), Value (HML), and Momentum factors. Shows how much of your return is true alpha vs. factor exposure.</p>
                            <button onClick={handleRunFactorAttribution} disabled={factorLoading || !lastBacktestId} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {factorLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run Factor Attribution
                            </button>
                            {!lastBacktestId && (
                              <p className="text-[10px] text-amber-600">Run a backtest first to enable factor attribution.</p>
                            )}
                          </div>
                          {factorResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{factorResults.error}</div>
                          )}
                          {factorResults && !factorResults.error && factorResults.status === 'completed' && (
                            <div className="space-y-3">
                              {/* Alpha headline */}
                              <div className={`p-3 rounded-lg border ${factorResults.alpha_significant ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                                <div className="flex items-baseline justify-between">
                                  <div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Annualized Alpha</div>
                                    <div className={`text-xl font-bold ${factorResults.alpha_annual_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{factorResults.alpha_annual_pct >= 0 ? '+' : ''}{factorResults.alpha_annual_pct.toFixed(2)}%</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[10px] text-gray-500">t-stat: {factorResults.alpha_t_stat.toFixed(2)}</div>
                                    <div className={`text-[11px] font-medium ${factorResults.alpha_significant ? 'text-emerald-600' : 'text-amber-600'}`}>
                                      {factorResults.alpha_significant ? 'Statistically significant' : 'Not significant (p > 0.05)'}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Model fit */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">R²</div>
                                  <div className="text-sm font-semibold text-gray-900">{(factorResults.r_squared * 100).toFixed(1)}%</div>
                                  <div className="text-[10px] text-gray-400">{factorResults.r_squared > 0.7 ? 'Well explained' : factorResults.r_squared > 0.3 ? 'Partially explained' : 'Mostly unexplained'}</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Strategy Return (ann.)</div>
                                  <div className={`text-sm font-semibold ${factorResults.strategy_annual_return_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{factorResults.strategy_annual_return_pct.toFixed(1)}%</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[10px] text-gray-500">Observations</div>
                                  <div className="text-sm font-semibold text-gray-900">{factorResults.n_observations}</div>
                                </div>
                              </div>

                              {/* Factor loadings table */}
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Factor Loadings</div>
                                <div className="rounded-lg border border-gray-200 overflow-hidden">
                                  <table className="w-full text-[11px]">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-3 py-1.5 text-left text-gray-500 font-medium">Factor</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">Beta (β)</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">t-stat</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">p-value</th>
                                        <th className="px-3 py-1.5 text-right text-gray-500 font-medium">Contrib. (ann.)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {factorResults.factors.map((f: any) => (
                                        <tr key={f.factor} className="hover:bg-gray-50">
                                          <td className="px-3 py-1.5 text-gray-700 font-medium">{f.factor} <span className="text-emerald-500">{f.significance}</span></td>
                                          <td className={`px-3 py-1.5 text-right font-mono ${Math.abs(f.beta) > 0.3 ? 'font-semibold' : ''}`}>{f.beta.toFixed(3)}</td>
                                          <td className="px-3 py-1.5 text-right text-gray-600">{f.t_stat.toFixed(2)}</td>
                                          <td className={`px-3 py-1.5 text-right ${f.p_value < 0.05 ? 'text-emerald-600 font-medium' : 'text-gray-500'}`}>{f.p_value < 0.001 ? '<0.001' : f.p_value.toFixed(3)}</td>
                                          <td className={`px-3 py-1.5 text-right font-medium ${f.annual_contribution_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{f.annual_contribution_pct >= 0 ? '+' : ''}{f.annual_contribution_pct.toFixed(2)}%</td>
                                        </tr>
                                      ))}
                                      <tr className="bg-gray-50 font-medium">
                                        <td className="px-3 py-1.5 text-gray-700">Alpha (α)</td>
                                        <td className="px-3 py-1.5 text-right text-gray-400">—</td>
                                        <td className="px-3 py-1.5 text-right text-gray-600">{factorResults.alpha_t_stat.toFixed(2)}</td>
                                        <td className={`px-3 py-1.5 text-right ${factorResults.alpha_p_value < 0.05 ? 'text-emerald-600' : 'text-gray-500'}`}>{factorResults.alpha_p_value < 0.001 ? '<0.001' : factorResults.alpha_p_value.toFixed(3)}</td>
                                        <td className={`px-3 py-1.5 text-right ${factorResults.alpha_annual_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{factorResults.alpha_annual_pct >= 0 ? '+' : ''}{factorResults.alpha_annual_pct.toFixed(2)}%</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Visual breakdown bar */}
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Return Decomposition</div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-2">
                                  {factorResults.factors.map((f: any) => {
                                    const maxAbs = Math.max(
                                      ...factorResults.factors.map((x: any) => Math.abs(x.annual_contribution_pct)),
                                      Math.abs(factorResults.alpha_annual_pct),
                                      0.01
                                    );
                                    const pct = Math.min(Math.abs(f.annual_contribution_pct) / maxAbs * 100, 100);
                                    return (
                                      <div key={f.factor} className="flex items-center gap-2">
                                        <div className="w-28 text-[10px] text-gray-600 truncate">{f.factor}</div>
                                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                                          <div className={`h-full rounded-full ${f.annual_contribution_pct >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className={`w-16 text-right text-[10px] font-mono ${f.annual_contribution_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{f.annual_contribution_pct >= 0 ? '+' : ''}{f.annual_contribution_pct.toFixed(1)}%</div>
                                      </div>
                                    );
                                  })}
                                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                                    <div className="w-28 text-[10px] text-gray-600 font-medium">Alpha (α)</div>
                                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                                      {(() => {
                                        const maxAbs = Math.max(
                                          ...factorResults.factors.map((x: any) => Math.abs(x.annual_contribution_pct)),
                                          Math.abs(factorResults.alpha_annual_pct),
                                          0.01
                                        );
                                        const pct = Math.min(Math.abs(factorResults.alpha_annual_pct) / maxAbs * 100, 100);
                                        return <div className={`h-full rounded-full ${factorResults.alpha_annual_pct >= 0 ? 'bg-blue-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />;
                                      })()}
                                    </div>
                                    <div className={`w-16 text-right text-[10px] font-mono ${factorResults.alpha_annual_pct >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{factorResults.alpha_annual_pct >= 0 ? '+' : ''}{factorResults.alpha_annual_pct.toFixed(1)}%</div>
                                  </div>
                                </div>
                              </div>

                              {/* Interpretation */}
                              <div className="p-2 rounded-lg border border-gray-200 bg-gray-50 text-[11px] text-gray-600 space-y-1">
                                {factorResults.r_squared > 0.7 && <p>High R² ({(factorResults.r_squared * 100).toFixed(0)}%) — most of your returns are explained by known factors.</p>}
                                {factorResults.r_squared <= 0.7 && factorResults.r_squared > 0.3 && <p>Moderate R² ({(factorResults.r_squared * 100).toFixed(0)}%) — returns are partially driven by factors, with meaningful unique behavior.</p>}
                                {factorResults.r_squared <= 0.3 && <p>Low R² ({(factorResults.r_squared * 100).toFixed(0)}%) — your strategy behaves independently of standard factors. This is often desirable.</p>}
                                {factorResults.alpha_significant && factorResults.alpha_annual_pct > 0 && <p className="text-emerald-700 font-medium">Positive significant alpha — evidence of genuine skill beyond factor tilts.</p>}
                                {!factorResults.alpha_significant && <p className="text-amber-700">Alpha is not statistically significant — observed returns could be explained by factor exposures.</p>}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'walkforward' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-1">Walk-forward analysis</div>
                            <p className="text-[11px] text-gray-500 mb-2">Split data into train/test windows and evaluate out-of-sample performance.</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Purge bars</label>
                                <input type="number" min={0} max={100} value={walkForwardPurgeBars} onChange={(e) => setWalkForwardPurgeBars(Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" title="Gap between train and test to prevent leakage" />
                          </div>
                              <div>
                                <label className="text-[10px] text-gray-500 block mb-0.5">Window mode</label>
                                <select value={walkForwardWindowMode} onChange={(e) => setWalkForwardWindowMode(e.target.value as 'rolling' | 'anchored')} className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900">
                                  <option value="rolling">Rolling</option>
                                  <option value="anchored">Anchored</option>
                                </select>
                          </div>
                          </div>
                            <button onClick={handleRunWalkForward} disabled={walkForwardLoading || (!playgroundStrategyId && strategyMode !== 'templates')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition">
                              {walkForwardLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run Walk-Forward
                            </button>
                        </div>
                          {walkForwardResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{walkForwardResults.error}</div>
                      )}
                          {walkForwardResults && !walkForwardResults.error && (walkForwardResults.windows?.length || walkForwardResults.splits?.length) && (
                        <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Out-of-sample results</div>
                              {walkForwardResults.avg_oos_return != null && (
                                <div className="text-xs text-gray-700">Avg OOS return: <span className="font-semibold">{(walkForwardResults.avg_oos_return * 100).toFixed(1)}%</span></div>
                              )}
                              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                {(walkForwardResults.windows ?? walkForwardResults.splits ?? []).map((w: { window?: number; train_period?: { start: string; end: string }; test_period?: { start: string; end: string }; train_start?: string; train_end?: string; test_start?: string; test_end?: string; test_sharpe?: number; test_return?: number; sharpe?: number; total_return?: number }, i: number) => {
                                  const testStart = w.test_period?.start ?? w.test_start ?? '-';
                                  const testEnd = w.test_period?.end ?? w.test_end ?? '-';
                                  const sharpe = w.test_sharpe ?? w.sharpe;
                                  const ret = w.test_return ?? w.total_return ?? 0;
                                    return (
                                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs hover:bg-gray-50">
                                      <span className="text-gray-600 font-mono">{testStart} → {testEnd}</span>
                                      <span className="text-gray-900">Sharpe {sharpe != null ? sharpe.toFixed(2) : '-'} · Return {(ret * 100).toFixed(1)}%</span>
                                      </div>
                                    );
                                })}
                          </div>
                        </div>
                      )}
                          {walkForwardResults && !walkForwardResults.error && !walkForwardResults.windows?.length && !walkForwardResults.splits?.length && (
                            <div className="px-3 py-4 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs text-center">Run completed. No splits data returned.</div>
                          )}
                            </div>
                          )}
                      {activeResultsTab === 'montecarlo' && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <div className="text-[11px] font-medium text-gray-700 mb-2">Monte Carlo simulation</div>
                            <p className="text-[11px] text-gray-500 mb-3">Run multiple simulated equity paths to assess strategy robustness.</p>
                            <button onClick={handleRunMonteCarlo} disabled={monteCarloLoading || !lastBacktestId} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition" title={!lastBacktestId ? 'Run a backtest first' : ''}>
                              {monteCarloLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run Monte Carlo
                            </button>
                          </div>
                          {!lastBacktestId && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                              <AlertCircle className="h-4 w-4 shrink-0" /> Run a backtest first to enable Monte Carlo.
                    </div>
                          )}
                          {monteCarloResults?.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">{monteCarloResults.error}</div>
                          )}
                          {monteCarloResults && !monteCarloResults.error && monteCarloResults.percentiles && (
                            <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Percentiles</div>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(monteCarloResults.percentiles).map(([p, v]: [string, unknown]) => (
                                  <div key={p} className="p-2 rounded-lg border border-gray-200 bg-white">
                                    <span className="text-[10px] text-gray-500">{p}</span>
                                    <div className="text-sm font-semibold text-gray-900">{typeof v === 'number' ? v.toFixed(2) : String(v)}</div>
                              </div>
                                ))}
                          </div>
                    </div>
                          )}
                          {monteCarloResults && !monteCarloResults.error && !monteCarloResults.percentiles && (
                            <div className="px-3 py-4 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-xs text-center">Simulation completed. No percentile data returned.</div>
                          )}
                        </div>
                      )}
                      {activeResultsTab === 'risk' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Max drawdown</div>
                              <div className={`text-sm font-semibold ${(results.max_drawdown ?? 0) > -20 ? 'text-emerald-600' : 'text-red-500'}`}>{(results.max_drawdown ?? 0).toFixed(1)}%</div>
                              </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Sortino</div>
                              <div className="text-sm font-semibold text-gray-900">{(results as { sortino_ratio?: number }).sortino_ratio?.toFixed(2) ?? '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Calmar</div>
                              <div className="text-sm font-semibold text-gray-900">{(results as { calmar_ratio?: number }).calmar_ratio?.toFixed(2) ?? '-'}</div>
                              </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">Max consec. losses</div>
                              <div className="text-sm font-semibold text-gray-900">{(results as { max_consecutive_losses?: number }).max_consecutive_losses ?? '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">VaR 95%</div>
                              <div className="text-sm font-semibold text-red-500">{results.var_95 != null ? `${results.var_95.toFixed(2)}%` : '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">CVaR 95%</div>
                              <div className="text-sm font-semibold text-red-500">{results.cvar_95 != null ? `${results.cvar_95.toFixed(2)}%` : '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">VaR 99%</div>
                              <div className="text-sm font-semibold text-red-500">{results.var_99 != null ? `${results.var_99.toFixed(2)}%` : '-'}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                              <div className="text-[11px] text-gray-500 mb-1">CVaR 99%</div>
                              <div className="text-sm font-semibold text-red-500">{results.cvar_99 != null ? `${results.cvar_99.toFixed(2)}%` : '-'}</div>
                            </div>
                          </div>
                          {(results as { risk_violations?: Array<{ rule: string; description: string }> }).risk_violations?.length ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-2">Risk violations</div>
                              <ul className="space-y-1.5">
                                {(results as { risk_violations: Array<{ rule: string; description: string }> }).risk_violations.map((v, i) => (
                                  <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span><span className="font-medium">{v.rule}:</span> {v.description}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-emerald-50/50 p-3 text-xs text-emerald-700">No risk violations.</div>
                      )}
                    </div>
                      )}
                      {activeResultsTab === 'heatmap' && (() => {
                        const trades = results.trades || [];
                        const byMonth: Record<string, number> = {};
                        for (const t of trades) {
                          const m = t.exit_date?.slice(0, 7) || t.entry_date?.slice(0, 7);
                          if (m) byMonth[m] = (byMonth[m] || 0) + (t.pnl ?? 0);
                        }
                        const months = Object.keys(byMonth).sort();
                        if (months.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500 text-xs">No trades for monthly P&amp;L heatmap.</div>;
                          return (
                          <div className="space-y-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Monthly P&amp;L ($)</div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {months.map(m => (
                                <div key={m} className={`p-2.5 rounded-lg border text-center ${(byMonth[m] ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                  <div className="text-[10px] text-gray-500">{m}</div>
                                  <div className="text-sm font-semibold">${(byMonth[m] ?? 0).toFixed(0)}</div>
                                    </div>
                                  ))}
                                </div>
                                                </div>
                                              );
                      })()}
                      {activeResultsTab === 'distribution' && (() => {
                        const trades = results.trades || [];
                        const pnls = trades.map(t => t.pnl ?? 0).filter(Boolean);
                        if (pnls.length === 0) return <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500 text-xs">No trade P&amp;L data.</div>;
                        const bins: Record<string, number> = {};
                        const step = 50;
                        for (const p of pnls) {
                          const b = Math.floor(p / step) * step;
                          bins[b] = (bins[b] ?? 0) + 1;
                        }
                        const entries = Object.entries(bins).sort((a, b) => Number(a[0]) - Number(b[0]));
                        const maxCount = Math.max(...entries.map(([, c]) => c), 1);
                        return (
                          <div className="space-y-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">P&amp;L distribution</div>
                            <div className="space-y-2">
                              {entries.map(([bin, count]) => (
                                <div key={bin} className="flex items-center gap-3">
                                  <span className="w-14 text-xs text-gray-600 font-mono">${bin}</span>
                                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                                    <div className={`h-full min-w-[2px] rounded-md ${Number(bin) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max((count / maxCount) * 100, 2)}%` }} />
                          </div>
                                  <span className="text-xs text-gray-700 font-medium w-6 text-right">{count}</span>
                                </div>
                              ))}
                            </div>
                                        </div>
                                      );
                                  })()}
                      {activeResultsTab === 'compare' && (
                        <div className="space-y-3">
                          {results.benchmark_return !== undefined ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">vs Buy &amp; Hold</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[11px] text-gray-500 mb-1">Strategy</div>
                                  <div className={`text-sm font-semibold ${results.total_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{results.total_return.toFixed(1)}%</div>
                                </div>
                                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="text-[11px] text-gray-500 mb-1">Benchmark</div>
                                  <div className={`text-sm font-semibold ${results.benchmark_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{results.benchmark_return.toFixed(1)}%</div>
                              </div>
                          </div>
                              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                                <div className="text-[11px] text-gray-600 mb-0.5">Alpha</div>
                                <div className={`text-lg font-bold ${results.total_return > results.benchmark_return ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {(results.total_return - results.benchmark_return) >= 0 ? '+' : ''}{(results.total_return - results.benchmark_return).toFixed(1)}%
                        </div>
                    </div>
                        </div>
                      ) : (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                              <div className="text-[11px] text-gray-500">Enable benchmark in Setup → Benchmark to compare strategy vs buy &amp; hold.</div>
                          </div>
                          )}
                                                </div>
                      )}
                      {activeResultsTab === 'tca' && (
                        <div className="space-y-3">
                          {((results as { total_commission?: number }).total_commission || (results as { total_slippage?: number }).total_slippage) ? (
                            <>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                <div className="text-[11px] text-gray-500 mb-1">Total commission</div>
                                <div className="text-sm font-semibold text-gray-900">${((results as { total_commission?: number }).total_commission ?? 0).toFixed(2)}</div>
                              </div>
                              <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                <div className="text-[11px] text-gray-500 mb-1">Total slippage</div>
                                <div className="text-sm font-semibold text-gray-900">${((results as { total_slippage?: number }).total_slippage ?? 0).toFixed(2)}</div>
                              </div>
                              <div className="p-3 rounded-lg border border-gray-200 bg-white col-span-2">
                                <div className="text-[11px] text-gray-500 mb-1">Cost as % of P&amp;L</div>
                                <div className="text-sm font-semibold text-gray-900">{((results as { cost_as_pct_of_pnl?: number }).cost_as_pct_of_pnl ?? 0).toFixed(2)}%</div>
                              </div>
                            </div>
                            {((results.total_funding_paid ?? 0) > 0 || (results.total_funding_received ?? 0) > 0) && (
                              <div className="space-y-2">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Perpetual Funding</div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[11px] text-gray-500 mb-1">Funding paid</div>
                                    <div className="text-sm font-semibold text-red-500">${(results.total_funding_paid ?? 0).toFixed(2)}</div>
                                  </div>
                                  <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[11px] text-gray-500 mb-1">Funding received</div>
                                    <div className="text-sm font-semibold text-emerald-600">${(results.total_funding_received ?? 0).toFixed(2)}</div>
                                  </div>
                                  <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-[11px] text-gray-500 mb-1">Net funding</div>
                                    <div className={`text-sm font-semibold ${(results.net_funding ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${(results.net_funding ?? 0).toFixed(2)}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                            </>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                              <div className="text-[11px] text-gray-500">Configure commission and slippage in Setup &rarr; Costs to see transaction cost analysis.</div>
                            </div>
                          )}
                  </div>
                )}
                </ErrorBoundary>
              </div>
            </div>
              )}
            />
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        isRunning={isRunning}
        results={results ? {
          total_return: results.total_return,
          sharpe_ratio: results.sharpe_ratio,
          max_drawdown: results.max_drawdown,
          total_trades: results.total_trades,
        } : null}
        lastRunTime={lastRunTime || undefined}
        onExportReport={results ? () => {
          if (!results) return;
          const html = generateLocalTearsheet(results);
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `tearsheet_${new Date().toISOString().split('T')[0]}.html`;
          a.click();
          URL.revokeObjectURL(url);
        } : undefined}
        onExportJSON={results ? handleExportJSON : undefined}
        uiScale={uiScale}
        onUiScaleChange={setUiScale}
      />

      {/* Floating Setup Panel - portal to body so it floats over chart, not inside result section */}
      {activeSetupPanel && canPortal && typeof window !== 'undefined' && createPortal(
        <div
          className="bg-white border border-gray-200 rounded-lg shadow-2xl flex flex-col overflow-hidden relative"
          style={{
            position: 'fixed',
            left: setupPanelPosition.x,
            top: setupPanelPosition.y,
            width: setupPanelSize.w,
            height: setupPanelSize.h,
            zIndex: 2147483647,
            pointerEvents: 'auto',
            transition: (isDraggingSetupPanel || isResizingSetupPanel) ? 'none' : 'box-shadow 0.15s',
          }}
        >
          {/* Header - draggable */}
          <div
            className="h-9 px-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 cursor-move select-none shrink-0"
            onMouseDown={handleSetupPanelDragStart}
          >
            <span className="text-xs font-semibold text-gray-900">
              {({ strategy: 'Strategy', dates: 'Dates', capital: 'Capital', benchmark: 'Benchmark', costs: 'Costs', risk: 'Risk', engine: 'Engine' } as Record<string, string>)[activeSetupPanel]}
            </span>
            <button
              onClick={() => setActiveSetupPanel(null)}
              className="p-1 text-gray-500 hover:text-gray-900 rounded transition"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Content - scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {activeSetupPanel === 'strategy' && (
              <div className="space-y-2">
                <div className="flex rounded-lg bg-gray-100 p-0.5">
                  <button type="button" onClick={() => { setStrategyMode('templates'); handleTemplateChange('sma_crossover'); }} className={`flex-1 py-1.5 text-[11px] font-medium rounded-md ${strategyMode === 'templates' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Templates</button>
                  <button type="button" onClick={() => setStrategyMode('custom')} className={`flex-1 py-1.5 text-[11px] font-medium rounded-md ${strategyMode === 'custom' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Custom</button>
                </div>
                {strategyMode === 'templates' ? (
                  <>
                    <ConfigSelect value={selectedTemplate} onChange={(v) => handleTemplateChange(v as StrategyTemplateKey)} light options={Object.entries(STRATEGY_TEMPLATES).filter(([k]) => k !== 'custom').map(([key, t]) => ({ value: key, label: t.name }))} />
                    {STRATEGY_PARAMS[selectedTemplate]?.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-gray-200">
                        <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Parameters</div>
                        {STRATEGY_PARAMS[selectedTemplate].map((p) => (
                          <div key={p.key}>
                            <label className="block text-[10px] text-gray-500 mb-0.5">{p.label}</label>
                            <input
                              type="number"
                              value={strategyParams[p.key] ?? p.default}
                              onChange={(e) => setStrategyParams((prev) => ({ ...prev, [p.key]: parseFloat(e.target.value) || p.default }))}
                              min={p.min}
                              max={p.max}
                              step={p.step ?? 1}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    {customStrategiesLoading ? <div className="text-[10px] text-gray-500 py-1">Loading...</div> : displayedCustomStrategies.length > 0 ? (
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {displayedCustomStrategies.map(s => (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${editingRenameId === s.id ? '' : 'cursor-pointer'} ${playgroundStrategyId === s.id && editingRenameId !== s.id ? 'bg-emerald-50 text-emerald-600' : 'text-gray-700 hover:bg-gray-50'}`}
                            onClick={() => editingRenameId !== s.id && handleCustomStrategySelect(String(s.id))}
                          >
                            {editingRenameId === s.id ? (
                              <input
                                type="text"
                                value={renameInputValue}
                                onChange={(e) => setRenameInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRenameStrategy();
                                  if (e.key === 'Escape') cancelRenameStrategy();
                                }}
                                onBlur={() => saveRenameStrategy()}
                                autoFocus
                                className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <>
                                <span className="flex-1 truncate min-w-0">{s.title}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); startRenameStrategy(s.id); }}
                                  className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 shrink-0"
                                  title="Rename strategy"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteStrategy(s.id); }}
                                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                  title="Delete strategy"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-[10px] text-gray-500 py-1">No strategies</div>}
                    <div className="flex gap-2 pt-2 border-t border-gray-200">
                      <button type="button" onClick={handleCreateNewStrategy} disabled={!isAuthenticated || customStrategiesLoading} className="flex-1 py-2 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">New</button>
                      <button type="button" onClick={() => refetchCustomStrategies()} disabled={customStrategiesLoading} className="px-3 py-2 text-[11px] text-gray-500 hover:text-gray-900 bg-gray-100 rounded-md">Refresh</button>
                    </div>
                  </div>
                )}
                {playgroundStrategyId && <button onClick={() => setShowCodeEditor(true)} className="w-full py-2 text-[11px] text-emerald-600 border border-emerald-200 rounded-md mt-2 hover:bg-emerald-50">Open Editor</button>}
              </div>
            )}
            {activeSetupPanel === 'dates' && (
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Start</div>
                <input type="date" value={config.startDate} onChange={(e) => setConfig({ ...config, startDate: e.target.value })} className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900" />
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">End</div>
                <input type="date" value={config.endDate} onChange={(e) => setConfig({ ...config, endDate: e.target.value })} className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900" />
                <div className="text-[11px] text-gray-500">{daysOfData} days</div>
              </div>
            )}
            {activeSetupPanel === 'capital' && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Initial Capital</div>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input type="number" value={config.initialCapital} onChange={(e) => setConfig({ ...config, initialCapital: parseFloat(e.target.value) || 10000 })} className="w-full pl-8 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900" />
                </div>
              </div>
            )}
            {activeSetupPanel === 'benchmark' && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Benchmark Symbol</div>
                <input type="text" value={config.benchmarkSymbol ?? ''} onChange={(e) => setConfig({ ...config, benchmarkSymbol: e.target.value || null })} placeholder="e.g. SPY" className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400" />
              </div>
            )}
            {activeSetupPanel === 'costs' && (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Broker preset</div>
                  <select
                    value={config.brokerPreset ?? 'custom'}
                    onChange={(e) => {
                      const preset = e.target.value as BrokerPreset;
                      const p = BROKER_PRESETS[preset];
                      setConfig({
                        ...config,
                        brokerPreset: preset,
                        commission: p.commission,
                        slippage: p.slippage,
                      });
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded text-gray-900"
                  >
                    {(Object.keys(BROKER_PRESETS) as BrokerPreset[]).map((k) => (
                      <option key={k} value={k}>{BROKER_PRESETS[k].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Slippage model</div>
                  <select
                    value={config.slippageModel}
                    onChange={(e) => setConfig({ ...config, slippageModel: e.target.value as BacktestConfig['slippageModel'] })}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded text-gray-900 mb-2"
                  >
                    <option value="percentage">Percentage (fixed)</option>
                    <option value="auto">Auto (from symbol volume)</option>
                    <option value="volume_aware">Volume-aware</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div><span className="text-[10px] text-gray-500 uppercase">Slippage %</span><input type="number" step={0.01} value={config.slippage} onChange={(e) => setConfig({ ...config, slippage: parseFloat(e.target.value) || 0, brokerPreset: 'custom' })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500" disabled={config.slippageModel === 'auto' || config.slippageModel === 'volume_aware' || (config.brokerPreset && config.brokerPreset !== 'custom')} title={config.slippageModel === 'auto' || config.slippageModel === 'volume_aware' ? 'Not used for volume-aware/auto models' : (config.brokerPreset && config.brokerPreset !== 'custom') ? 'Select Custom preset to edit' : undefined} /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Commission %</span><input type="number" step={0.01} value={config.commission} onChange={(e) => setConfig({ ...config, commission: parseFloat(e.target.value) || 0, brokerPreset: 'custom' })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500" disabled={config.brokerPreset !== undefined && config.brokerPreset !== 'custom'} title={config.brokerPreset && config.brokerPreset !== 'custom' ? 'Select Custom preset to edit' : ''} /></div>
              </div>
            )}
            {activeSetupPanel === 'risk' && (
              <div className="space-y-2">
                <div><span className="text-[10px] text-gray-500 uppercase">Stop Loss %</span><input type="number" step={0.1} value={config.stopLossPct ?? ''} onChange={(e) => setConfig({ ...config, stopLossPct: e.target.value ? parseFloat(e.target.value) : null })} placeholder="None" className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Take Profit %</span><input type="number" step={0.1} value={config.takeProfitPct ?? ''} onChange={(e) => setConfig({ ...config, takeProfitPct: e.target.value ? parseFloat(e.target.value) : null })} placeholder="None" className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Max Drawdown %</span><input type="number" value={config.maxDrawdownPct} onChange={(e) => setConfig({ ...config, maxDrawdownPct: parseFloat(e.target.value) || 50 })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
              </div>
            )}
            {activeSetupPanel === 'engine' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-gray-900"><input type="checkbox" checked={config.marginEnabled} onChange={(e) => setConfig({ ...config, marginEnabled: e.target.checked })} className="rounded" /> Margin</label>
                <label className="flex items-center gap-2 text-xs text-gray-900"><input type="checkbox" checked={config.allowShortsWithoutMargin} onChange={(e) => setConfig({ ...config, allowShortsWithoutMargin: e.target.checked })} className="rounded" /> Allow shorts w/o margin</label>
                <div><span className="text-[10px] text-gray-500 uppercase">Leverage</span><input type="number" min={1} max={10} value={config.leverage} onChange={(e) => setConfig({ ...config, leverage: parseFloat(e.target.value) || 1 })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Warmup bars</span><input type="number" value={config.warmupBars} onChange={(e) => setConfig({ ...config, warmupBars: parseInt(e.target.value, 10) || 0 })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <label className="flex items-center gap-2 text-xs text-gray-900"><input type="checkbox" checked={config.pdtEnabled} onChange={(e) => setConfig({ ...config, pdtEnabled: e.target.checked })} className="rounded" /> PDT rule</label>
              </div>
            )}
          </div>
          {/* Resize handle */}
          <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" onMouseDown={handleSetupPanelResizeStart} style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(156,163,175,0.6) 50%)' }} title="Resize" />
        </div>,
        document.getElementById('portal-root') ?? document.body
      )}

      {/* Floating Code Editor Panel - Draggable */}
      {showCodeEditor && (
        <div 
          className="fixed z-50 bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-2xl flex flex-col"
          style={{
            left: editorPosition.x,
            top: editorPosition.y,
            width: editorMinimized ? '200px' : '700px',
            height: editorMinimized ? '36px' : '550px',
            transition: isDragging ? 'none' : 'width 0.2s, height 0.2s',
          }}
        >
          {/* Editor Header - Draggable */}
          <div 
            className={`h-10 bg-white ${editorMinimized ? 'rounded-lg' : 'rounded-t-lg'} px-3 flex items-center justify-between border-b border-gray-200 cursor-move select-none shrink-0`}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <FileCode className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-gray-900 font-medium truncate">
                {playgroundStrategyId ? displayedCustomStrategies.find(s => s.id === playgroundStrategyId)?.title ?? 'strategy.py' : 'strategy.py'}
              </span>
              {!editorMinimized && strategyMode === 'custom' && playgroundStrategyId && (
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditorTab('code'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`px-2.5 py-1 text-[11px] rounded transition ${editorTab === 'code' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Code
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditorTab('version-control'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`px-2.5 py-1 text-[11px] rounded transition ${editorTab === 'version-control' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Version control
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!editorMinimized && strategyMode === 'custom' && playgroundStrategyId && (
                <div className="flex items-center gap-2">
                  {lastEditorSaveTime != null && (
                    <span className="text-[10px] text-gray-500" title={`Last saved ${new Date(lastEditorSaveTime).toLocaleString()}`}>
                      Saved {formatRelativeTime(lastEditorSaveTime)}
                    </span>
                  )}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!playgroundStrategyId) return;
                      setEditorSaveStatus('saving');
                      try {
                        await api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams });
                        const now = Date.now();
                        setLastEditorSaveTime(now);
                        setEditorSaveStatus('saved');
                      } catch {
                        setEditorSaveStatus('error');
                        setTimeout(() => setEditorSaveStatus('idle'), 2500);
                      }
                    }}
                    disabled={editorSaveStatus === 'saving'}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      editorSaveStatus === 'saved'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        : editorSaveStatus === 'saving'
                        ? 'bg-gray-100 text-gray-500 border border-gray-200 cursor-wait'
                        : editorSaveStatus === 'error'
                        ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                    }`}
                    title="Save strategy (without committing)"
                  >
                    {editorSaveStatus === 'saving' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : editorSaveStatus === 'saved' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {editorSaveStatus === 'saving' ? 'Saving…' : editorSaveStatus === 'saved' ? 'Saved' : editorSaveStatus === 'error' ? 'Failed' : 'Save'}
                  </button>
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setEditorMinimized(!editorMinimized); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition"
                title={editorMinimized ? 'Expand' : 'Minimize'}
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${editorMinimized ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCodeEditor(false); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition"
                title="Close"
              >
                <span className="text-sm leading-none">×</span>
              </button>
            </div>
          </div>
          
          {/* Editor Content */}
          {!editorMinimized && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-b-lg">
              {editorTab === 'code' ? (
                <div className="flex-1 min-h-0" style={{ height: '480px' }}>
                  <ErrorBoundary label="Code Editor">
                    <CodeEditor value={code} onChange={setCode} />
                  </ErrorBoundary>
                </div>
              ) : strategyMode === 'custom' && playgroundStrategyId ? (
                /* Version Control tab - GitHub-style, theme-aware (light/dark) */
                <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${
                  effectiveChartTheme === 'light' ? 'bg-gray-100 border-t border-gray-200' : 'bg-gray-800/50'
                }`}>
                  <div className={`px-3 py-2 border-b shrink-0 ${
                    effectiveChartTheme === 'light' ? 'border-gray-200 text-gray-600' : 'border-gray-700/80'
                  }`}>
                    <p className={`text-[11px] ${effectiveChartTheme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                      <strong className={effectiveChartTheme === 'light' ? 'text-gray-800' : 'text-gray-300'}>Save</strong> persists your working copy. <strong className={effectiveChartTheme === 'light' ? 'text-gray-800' : 'text-gray-300'}>Commit</strong> creates a version in history (like git commit).
                    </p>
                  </div>
                  {/* Commit input bar - Title + optional Description */}
                  <div className={`p-3 border-b shrink-0 space-y-2 ${
                    effectiveChartTheme === 'light' ? 'border-gray-200' : 'border-gray-700/80'
                  }`}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commitTitleInput}
                        onChange={(e) => setCommitTitleInput(e.target.value)}
                        placeholder="Commit title (required)"
                        className={`flex-1 px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 ${
                          effectiveChartTheme === 'light'
                            ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500'
                            : 'bg-gray-700/80 border border-gray-600 text-gray-200 placeholder-gray-500'
                        }`}
                        maxLength={72}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!playgroundStrategyId || !commitTitleInput.trim()) return;
                            const msg = commitTitleInput.trim() + (commitDescriptionInput.trim() ? '\n\n' + commitDescriptionInput.trim() : '');
                            api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams })
                              .then(() => api.createVersion(playgroundStrategyId!, msg))
                              .then(() => {
                                setCommitTitleInput('');
                                setCommitDescriptionInput('');
                                return api.listVersions(playgroundStrategyId!, 0, 10);
                              })
                              .then((v) => { setVersionList(v); setVersionListHasMore(v.length >= 10); })
                              .catch((err: unknown) => { setError(extractApiError(err, 'Failed to commit')); });
                          }
                        }}
                      />
                      <button
                        onClick={async () => {
                          if (!playgroundStrategyId || !commitTitleInput.trim()) return;
                          try {
                            const msg = commitTitleInput.trim() + (commitDescriptionInput.trim() ? '\n\n' + commitDescriptionInput.trim() : '');
                            await api.updateStrategy(playgroundStrategyId, { code, parameters: strategyParams });
                            await api.createVersion(playgroundStrategyId, msg);
                            setCommitTitleInput('');
                            setCommitDescriptionInput('');
                            const versions = await api.listVersions(playgroundStrategyId, 0, 10);
                            setVersionList(versions);
                            setVersionListHasMore(versions.length >= 10);
                          } catch (err) {
                            setError(extractApiError(err, 'Failed to commit'));
                          }
                        }}
                        disabled={!commitTitleInput.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors flex items-center gap-2 shrink-0"
                        title="Commit changes"
                      >
                        <GitBranch className="h-4 w-4" />
                        Commit
                      </button>
                    </div>
                    <textarea
                      value={commitDescriptionInput}
                      onChange={(e) => setCommitDescriptionInput(e.target.value)}
                      placeholder="Description (optional)"
                      rows={2}
                      className={`w-full px-3 py-2 text-sm rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 ${
                        effectiveChartTheme === 'light'
                          ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500'
                          : 'bg-gray-700/80 border border-gray-600 text-gray-200 placeholder-gray-500'
                      }`}
                      maxLength={500}
                    />
                  </div>
                  {/* Commit history - GitHub-style, theme-aware */}
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className={`text-[10px] font-medium uppercase tracking-wider mb-2 ${
                      effectiveChartTheme === 'light' ? 'text-gray-500' : 'text-gray-500'
                    }`}>History</div>
                    {versionLoading ? (
                      <div className={`text-xs py-4 ${effectiveChartTheme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>Loading...</div>
                    ) : versionList.length === 0 ? (
                      <div className={`text-xs py-6 text-center ${effectiveChartTheme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>No commits yet. Add a message above and commit.</div>
                    ) : (
                      <>
                      <div className={`divide-y ${
                        effectiveChartTheme === 'light' ? 'divide-gray-200' : 'divide-gray-600/50'
                      }`}>
                        {versionList.map((v, i) => {
                          const isLatest = i === 0;
                          const fullMsg = (v.commit_message || '').trim() || null;
                          const title = fullMsg ? fullMsg.split('\n')[0] : null;
                          const isLight = effectiveChartTheme === 'light';
                          return (
                            <div
                              key={v.id}
                              className={`flex items-center gap-3 py-3 group transition-colors -mx-1 px-3 rounded-md ${
                                isLatest
                                  ? isLight ? 'bg-emerald-50 border border-emerald-200/60' : 'bg-gray-700/60'
                                  : isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700/30'
                              }`}
                            >
                                  <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm font-medium truncate ${
                                    isLatest ? (isLight ? 'text-gray-900' : 'text-gray-100') : (isLight ? 'text-gray-800' : 'text-gray-200')
                                  }`}
                                  title={fullMsg || undefined}
                                >
                                  {title || <span className={isLight ? 'italic text-gray-500' : 'italic text-gray-500'}>No message</span>}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                    isLight ? 'bg-emerald-600/80' : 'bg-gray-500/80'
                                  }`}>
                                    <span className="text-[10px] font-medium text-white">
                                      {(user?.username || '?')[0].toUpperCase()}
                                    </span>
                                  </div>
                                  <span className={`text-[11px] truncate ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>{user?.username || 'You'}</span>
                                  <span className={isLight ? 'text-gray-400' : 'text-gray-600'}>•</span>
                                  <span className={`text-[11px] ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>{formatCommitTime(v.created_at)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={async () => {
                                        if (!playgroundStrategyId) return;
                                        try {
                                          const data = await api.restoreVersion(playgroundStrategyId, v.version);
                                          setCode(data.code);
                                      setStrategyParams((data.parameters as Record<string, number>) ?? {});
                                          setEditorTab('code');
                                      setLastEditorSaveTime(null);
                                        } catch (err) {
                                          setError(extractApiError(err, 'Failed to restore version'));
                                        }
                                      }}
                                  className={`p-2 rounded-full transition-colors ${
                                    isLatest
                                      ? isLight
                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                        : 'bg-emerald-600/80 hover:bg-emerald-500/90 text-white'
                                      : isLight
                                        ? 'text-gray-500 hover:text-emerald-600 hover:bg-gray-200'
                                        : 'text-gray-400 hover:text-emerald-400 hover:bg-gray-600/60'
                                  }`}
                                  title="Revert to this version (working copy only, no new commit)"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (!playgroundStrategyId || !confirm(`Delete v${v.version}?`)) return;
                                        try {
                                          await api.deleteVersion(playgroundStrategyId, v.version);
                                          setVersionList(prev => prev.filter(x => x.id !== v.id));
                                        } catch (err) {
                                          setError(extractApiError(err, 'Failed to delete version'));
                                        }
                                      }}
                                  className={`p-2 rounded-full transition-colors ${
                                    isLatest
                                      ? isLight ? 'text-gray-600 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-red-300 hover:bg-red-500/20'
                                      : isLight ? 'text-gray-500 hover:text-red-600 hover:bg-gray-200' : 'text-gray-500 hover:text-red-400 hover:bg-gray-600/60'
                                  }`}
                                      title="Delete commit"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                          );
                        })}
                        </div>
                        {versionListHasMore && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!playgroundStrategyId) return;
                              setVersionLoading(true);
                              try {
                                const more = await api.listVersions(playgroundStrategyId, versionList.length, 10);
                                setVersionList(prev => [...prev, ...more]);
                                setVersionListHasMore(more.length >= 10);
                              } catch (err) {
                                console.error('Failed to load more versions:', err);
                              }
                              setVersionLoading(false);
                            }}
                            className={`w-full mt-2 py-2 text-[11px] rounded-lg border border-dashed transition-colors ${
                              effectiveChartTheme === 'light'
                                ? 'text-gray-500 hover:text-gray-700 border-gray-300 hover:border-gray-400'
                                : 'text-gray-500 hover:text-gray-300 border-gray-600 hover:border-gray-500'
                            }`}
                          >
                            Load more
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a custom strategy for version control</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
