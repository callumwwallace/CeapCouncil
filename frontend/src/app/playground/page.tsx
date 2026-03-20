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
import StatusBar from '@/components/playground/StatusBar';
import AssetSelector from '@/components/playground/AssetSelector';
import ConfigSelect from '@/components/playground/ConfigSelect';
import ChartHeader from '@/components/playground/ChartHeader';
import ResultsBar from '@/components/playground/ResultsBar';
import api from '@/lib/api';
import type { BacktestTrade, EquityCurvePoint, DrawdownPoint, Strategy } from '@/types';
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

import { STRATEGY_TEMPLATES, DEFAULT_CODE, type StrategyTemplateKey } from './strategyTemplates';
import { applyDatePreset, formatRelativeTime, formatCommitTime, extractApiError, type DatePreset } from './utils';
import type { BacktestConfig, BacktestResult, BrokerPreset } from './types';
import { SYMBOLS, BROKER_PRESETS } from './types';
import { useExport } from './useExport';
import { usePlaygroundShortcuts } from './usePlaygroundShortcuts';
import { useAnalytics } from './useAnalytics';
import { extractParamsFromCode, updateCodeWithParams } from './extractParams';
import { parseErrorLines } from './parseErrorLine';
import ResultsTabContent from '@/components/playground/results/ResultsTabContent';
import FloatingCodeEditor from '@/components/playground/FloatingCodeEditor';

function MetricItem({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? 'text-gray-200' : positive ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] text-gray-500 uppercase">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

export default function PlaygroundPage() {
  const { isAuthenticated, user } = useAuthStore();
  
  const [code, setCode] = useState(DEFAULT_CODE);
  const [selectedStarter, setSelectedStarter] = useState<StrategyTemplateKey>('sma_crossover');
  const [savedStrategyId, setSavedStrategyId] = useState<number | null>(null);
  const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);
  const [savedStrategiesLoading, setSavedStrategiesLoading] = useState(false);
  const [strategyBoxMinimised, setStrategyBoxMinimised] = useState(false);
  const [editingRenameId, setEditingRenameId] = useState<number | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');

  // Dynamic parameter introspection from code
  const paramDefs = useMemo(() => extractParamsFromCode(code), [code]);

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
    extractParamsFromCode(DEFAULT_CODE).forEach(p => { defaultParams[p.key] = p.defaultValue; });
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
  const [activeSetupPanel, setActiveSetupPanel] = useState<'strategy' | 'dates' | 'capital' | 'benchmark' | 'costs' | 'risk' | 'engine' | 'history' | null>(null);
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

  // Check for injected code from docs "Try in Playground" or forum embed cards
  useEffect(() => {
    const injectedCode = sessionStorage.getItem('playground_inject_code');
    if (injectedCode) {
      setCode(injectedCode);
      setSelectedStarter('custom');
      setSavedStrategyId(null);
      const extracted = extractParamsFromCode(injectedCode);
      const defaultParams: Record<string, number> = {};
      extracted.forEach(p => { defaultParams[p.key] = p.defaultValue; });
      setStrategyParams(defaultParams);
      sessionStorage.removeItem('playground_inject_code');
      sessionStorage.removeItem('playground_inject_template');
    }
  }, []);

  // Handle ?strategy=ID share links (load a public strategy by ID)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const strategyIdParam = params.get('strategy');
    if (!strategyIdParam) return;
    const id = parseInt(strategyIdParam, 10);
    if (isNaN(id)) return;

    api.getStrategy(id)
      .then((strategy) => {
        setCode(strategy.code);
        setSelectedStarter('custom');
        setSavedStrategyId(null);
        const extracted = extractParamsFromCode(strategy.code);
        const defaultParams: Record<string, number> = {};
        extracted.forEach(p => { defaultParams[p.key] = p.defaultValue; });
        setStrategyParams(defaultParams);
      })
      .catch(() => {
        setError('Could not load shared strategy — it may be private or deleted');
      });
  }, []);

  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [resultsBarExpanded, setResultsBarExpanded] = useState(false);
  const [resultsPanelWidth, setResultsPanelWidth] = useState(320);
  const [isResizingResults, setIsResizingResults] = useState(false);
  const resizeStartRef = useRef<{ x: number; w: number }>({ x: 0, w: 320 });
  const [uiScale, setUiScale] = useState(1); // 0.75–1.25, applied to sidebars only (not chart)
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastBacktestShareToken, setLastBacktestShareToken] = useState<string | null>(null);
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
  const [comparisonHistory, setComparisonHistory] = useState<(BacktestResult & {
    label: string;
    timestamp: number;
    configSnapshot: { symbol: string; startDate: string; endDate: string; initialCapital: number; interval: string };
    paramsSnapshot: Record<string, number>;
  })[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  // Advanced analytics (extracted hook)
  const analytics = useAnalytics({ config, code, paramDefs, strategyParams });
  const {
    optimizeResults, walkForwardResults, oosResults, cpcvResults, factorResults, monteCarloResults,
    optimizeLoading, walkForwardLoading, oosLoading, cpcvLoading, factorLoading, monteCarloLoading,
    optimizeMethod, setOptimizeMethod,
    optConstraints, setOptConstraints,
    showConstraints, setShowConstraints,
    heatmapParamX, setHeatmapParamX,
    heatmapParamY, setHeatmapParamY,
    multiObjMetrics, setMultiObjMetrics,
    walkForwardPurgeBars, setWalkForwardPurgeBars,
    walkForwardWindowMode, setWalkForwardWindowMode,
    oosNfolds, setOosNfolds,
    cpcvNGroups, setCpcvNGroups,
    cpcvPurgeBars, setCpcvPurgeBars,
    lastBacktestId, setLastBacktestId,
    handleRunOptimization, handleRunWalkForward, handleRunOos,
    handleRunCpcv, handleRunFactorAttribution, handleRunMonteCarlo,
  } = analytics;
  
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
    if (error && !isRunning && validateConfig() === null) {
      setError(null);
    }
  }, [config, code, isRunning]); // eslint-disable-line react-hooks/exhaustive-deps -- error intentionally excluded to avoid loops

  // Auto-open code editor when error has parseable line numbers (code-related failure)
  useEffect(() => {
    if (error && parseErrorLines(error).length > 0) {
      setShowCodeEditor(true);
    }
  }, [error]);

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

    setIsRunning(true);
    setError(null);
    setResults(null);
    setActiveResultsTab('summary');
    runCancelledRef.current = false;
    const startTime = Date.now();

    try {
      // Strategy params (user-defined in code) are kept separate from engine config
      // so self.params in the strategy only contains trading parameters, not engine noise.
      const backtestConfig = {
        symbol: config.symbol,
        symbols: additionalSymbols.length > 0 ? additionalSymbols : undefined,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        slippage: config.slippage / 100,
        commission: config.commission / 100,
        parameters: {
          // Strategy params (appear in self.params)
          ...strategyParams,
          // Engine config (consumed by EngineConfig, also lands in self.params for now)
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
          setLastBacktestShareToken(result.share_token);
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
          // Add to comparison history with config snapshot
          setComparisonHistory(prev => [
            ...prev.slice(-9), // Keep last 10 total
            {
              ...resultsObj,
              label: `${STRATEGY_TEMPLATES[selectedStarter]?.name ?? 'Strategy'} - ${config.symbol}`,
              timestamp: Date.now(),
              configSnapshot: {
                symbol: config.symbol,
                startDate: config.startDate,
                endDate: config.endDate,
                initialCapital: config.initialCapital,
                interval: config.interval,
              },
              paramsSnapshot: { ...strategyParams },
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
  }, [isAuthenticated, code, config, strategyParams]);

  const handleCancelBacktest = useCallback(() => {
    runCancelledRef.current = true;
  }, []);

  const handleRetryBacktest = useCallback(() => {
    setError(null);
    handleRunBacktest();
  }, [handleRunBacktest]);

  const handleReset = () => {
    setCode(DEFAULT_CODE);
    setSelectedStarter('sma_crossover');
    // Params will be extracted dynamically from the default code
    const extracted = extractParamsFromCode(DEFAULT_CODE);
    const defaultParams: Record<string, number> = {};
    extracted.forEach(p => { defaultParams[p.key] = p.defaultValue; });
    setStrategyParams(defaultParams);
    setResults(null);
    setError(null);
  };

  const handleStarterChange = (templateKey: StrategyTemplateKey) => {
    setSelectedStarter(templateKey);
    const newCode = STRATEGY_TEMPLATES[templateKey].code;
    setCode(newCode);
    // Extract params dynamically from the new code
    const extracted = extractParamsFromCode(newCode);
    const defaultParams: Record<string, number> = {};
    extracted.forEach(p => { defaultParams[p.key] = p.defaultValue; });
    setStrategyParams(defaultParams);
    setSavedStrategyId(null); // Loading a starter detaches from saved strategy
  };

  const handleSavedStrategySelect = async (value: string) => {
    const id = parseInt(value, 10);
    if (isNaN(id)) return;
    try {
      const strategy = await api.getStrategy(id);
      setCode(strategy.code);
      setSavedStrategyId(strategy.id);
      setStrategyParams((strategy.parameters as Record<string, number>) || {});
    } catch {
      setCode(DEFAULT_CODE);
      setSavedStrategyId(null);
    }
  };

  const handleCreateNewStrategy = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const strat = await api.createStrategy({
        title: 'New Strategy',
        code,
        parameters: strategyParams,
        is_public: false,
      });
      setSavedStrategies(prev => [strat, ...prev]);
      setSavedStrategyId(strat.id);
    } catch (err) {
      setError(extractApiError(err, 'Failed to create strategy'));
    }
  }, [isAuthenticated, code, strategyParams]);

  const refetchSavedStrategies = useCallback(async () => {
    if (!isAuthenticated) return;
    setSavedStrategiesLoading(true);
    try {
      const list = await api.getMyStrategies();
      setSavedStrategies(list);
      setDeletedStrategyIds(prev => new Set([...prev].filter(id => list.some(s => s.id === id))));
    } catch {
      setSavedStrategies([]);
    } finally {
      setSavedStrategiesLoading(false);
    }
  }, [isAuthenticated]);

  const [deletedStrategyIds, setDeletedStrategyIds] = useState<Set<number>>(new Set());
  const displayedSavedStrategies = useMemo(
    () => savedStrategies.filter(s => !deletedStrategyIds.has(s.id)),
    [savedStrategies, deletedStrategyIds]
  );

  // Load saved strategies when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      refetchSavedStrategies();
    }
  }, [isAuthenticated, refetchSavedStrategies]);

  const handleDuplicateStrategy = useCallback(async () => {
    if (!savedStrategyId || !isAuthenticated) return;
    const current = displayedSavedStrategies.find(s => s.id === savedStrategyId);
    try {
      const strat = await api.createStrategy({
        title: `Copy of ${current?.title ?? 'Strategy'}`,
        code,
        parameters: strategyParams,
        is_public: false,
      });
      setSavedStrategyId(strat.id);
      setSavedStrategies(prev => [strat, ...prev]);
    } catch (err) {
      setError(extractApiError(err, 'Failed to duplicate strategy'));
    }
  }, [savedStrategyId, code, strategyParams, displayedSavedStrategies, isAuthenticated]);

  const handleDeleteStrategy = useCallback(async (strategyId?: number) => {
    const idToDelete = strategyId ?? savedStrategyId;
    if (!idToDelete) return;
    if (!confirm('Delete this strategy? This cannot be undone.')) return;
    if (idToDelete === savedStrategyId) {
      setSavedStrategyId(null);
      setCode(DEFAULT_CODE);
      setResults(null);
    }
    setSavedStrategies(prev => prev.filter(s => s.id !== idToDelete));
    try {
      await api.deleteStrategy(idToDelete);
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete strategy'));
      refetchSavedStrategies();
    }
  }, [savedStrategyId, refetchSavedStrategies]);

  const startRenameStrategy = useCallback((strategyId?: number) => {
    const id = strategyId ?? savedStrategyId;
    if (!id) return;
    const current = displayedSavedStrategies.find(s => s.id === id);
    setEditingRenameId(id);
    setRenameInputValue(current?.title ?? '');
  }, [savedStrategyId, displayedSavedStrategies]);

  const saveRenameStrategy = useCallback(async () => {
    if (!editingRenameId || !renameInputValue.trim()) {
      setEditingRenameId(null);
      return;
    }
    const trimmed = renameInputValue.trim();
    try {
      await api.updateStrategy(editingRenameId, { title: trimmed });
      setSavedStrategies(prev => prev.map(s => s.id === editingRenameId ? { ...s, title: trimmed } : s));
      setEditingRenameId(null);
    } catch (err) {
      setError(extractApiError(err, 'Failed to rename strategy'));
    }
  }, [editingRenameId, renameInputValue]);

  const cancelRenameStrategy = useCallback(() => {
    setEditingRenameId(null);
    setRenameInputValue('');
  }, []);

  const { handleExportResults, handleExportJSON, generateLocalTearsheet } = useExport(results, config);

  const handleSave = useCallback(async () => {
    if (!isAuthenticated) return;
    // Only save if we have a saved strategy to update
    if (!savedStrategyId) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await api.updateStrategy(savedStrategyId, { code, parameters: strategyParams });
      setSaveMessage('Strategy saved!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setSaveMessage('Failed to save');
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [isAuthenticated, savedStrategyId, code, strategyParams]);

  usePlaygroundShortcuts({
    isRunning,
    isAuthenticated,
    savedStrategyId,
    isSaving,
    results,
    onRun: handleRunBacktest,
    onSave: handleSave,
    onExport: handleExportResults,
  });

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
        canRun={true}
        runDisabledReason={undefined}
        onReset={handleReset}
        onSave={savedStrategyId ? handleSave : undefined}
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
            {([
              'strategy', 'dates',
              '---',
              'capital', 'benchmark', 'costs',
              '---',
              'risk', 'engine',
              '---',
              'history',
            ] as const).map((item, i) => {
              if (item === '---') return <div key={`sep-${i}`} className="h-px bg-gray-200 w-6 my-1" />;
              const panel = item as 'strategy' | 'dates' | 'capital' | 'benchmark' | 'costs' | 'risk' | 'engine' | 'history';
              const labels = { strategy: 'Strategy', dates: 'Dates', capital: 'Capital & Sizing', benchmark: 'Benchmark', costs: 'Costs', risk: 'Risk', engine: 'Engine', history: 'Run History' };
              const icons = { strategy: FileCode, dates: Calendar, capital: DollarSign, benchmark: TrendingUp, costs: Percent, risk: Shield, engine: Settings, history: RefreshCw };
              const Icon = icons[panel];
              const isActive = activeSetupPanel === panel;
              return (
                <div key={panel} className="group relative">
                  <button
                    onClick={() => setActiveSetupPanel(isActive ? null : panel)}
                    className={`relative p-2 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 ${isActive ? 'bg-gray-100 text-emerald-600' : ''}`}
                  >
                    {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-emerald-500 rounded-full" />}
                    <Icon className="h-5 w-5" />
                    {panel === 'history' && comparisonHistory.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-emerald-500 text-white text-[8px] font-bold rounded-full leading-none px-0.5">
                        {comparisonHistory.length}
                      </span>
                    )}
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
              backtestShareToken={lastBacktestShareToken}
              symbol={config.symbol}
              renderContent={() => (
                <ResultsTabContent
                  results={results}
                  activeTab={activeResultsTab}
                  onTabChange={setActiveResultsTab}
                  analytics={analytics}
                  paramDefs={paramDefs}
                />
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
              {({ strategy: 'Strategy', dates: 'Dates', capital: 'Capital & Sizing', benchmark: 'Benchmark', costs: 'Costs', risk: 'Risk', engine: 'Engine', history: 'Run History' } as Record<string, string>)[activeSetupPanel]}
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
                <p className="text-[10px] text-gray-400 leading-relaxed">Sidebar controls the environment (capital, costs, dates). Your code controls the trading logic.</p>
                {/* Load starter code */}
                <div>
                  <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Load Starter</div>
                  <ConfigSelect value={selectedStarter} onChange={(v) => handleStarterChange(v as StrategyTemplateKey)} light options={Object.entries(STRATEGY_TEMPLATES).map(([key, t]) => ({ value: key, label: t.name }))} />
                </div>

                {/* Dynamic parameters (extracted from code) */}
                {paramDefs.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Parameters</div>
                    {paramDefs.map((p) => (
                      <div key={p.key}>
                        <label className="block text-[10px] text-gray-500 mb-0.5">{p.label}</label>
                        <input
                          type="number"
                          value={strategyParams[p.key] ?? p.defaultValue}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || p.defaultValue;
                            setStrategyParams((prev) => ({ ...prev, [p.key]: val }));
                            setCode((prev) => updateCodeWithParams(prev, { [p.key]: val }));
                          }}
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Saved strategies */}
                {isAuthenticated && (
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Saved Strategies</div>
                    {savedStrategiesLoading ? <div className="text-[10px] text-gray-500 py-1">Loading...</div> : displayedSavedStrategies.length > 0 ? (
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {displayedSavedStrategies.map(s => (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${editingRenameId === s.id ? '' : 'cursor-pointer'} ${savedStrategyId === s.id && editingRenameId !== s.id ? 'bg-emerald-50 text-emerald-600' : 'text-gray-700 hover:bg-gray-50'}`}
                            onClick={() => editingRenameId !== s.id && handleSavedStrategySelect(String(s.id))}
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
                    ) : <div className="text-[10px] text-gray-500 py-1">No saved strategies yet</div>}
                    <div className="flex gap-2">
                      <button type="button" onClick={handleCreateNewStrategy} disabled={!isAuthenticated || savedStrategiesLoading} className="flex-1 py-2 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">Save as New</button>
                      <button type="button" onClick={() => refetchSavedStrategies()} disabled={savedStrategiesLoading} className="px-3 py-2 text-[11px] text-gray-500 hover:text-gray-900 bg-gray-100 rounded-md">Refresh</button>
                    </div>
                  </div>
                )}

                {/* Multi-symbol for multi-asset strategies */}
                <div className="space-y-1.5 pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Additional Symbols</div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">Add extra symbols for multi-asset strategies. Data is passed to <code className="bg-gray-100 px-0.5 rounded">self.history(symbol)</code>.</p>
                  {additionalSymbols.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {additionalSymbols.map((sym) => (
                        <span key={sym} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-medium rounded-md">
                          {sym}
                          <button
                            onClick={() => setAdditionalSymbols((prev) => prev.filter((s) => s !== sym))}
                            className="text-gray-400 hover:text-red-500 transition"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="e.g. MSFT"
                      className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 uppercase"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim().toUpperCase();
                          if (val && val !== config.symbol && !additionalSymbols.includes(val)) {
                            setAdditionalSymbols((prev) => [...prev, val]);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.querySelector<HTMLInputElement>('input[placeholder="e.g. MSFT"]');
                        if (input) {
                          const val = input.value.trim().toUpperCase();
                          if (val && val !== config.symbol && !additionalSymbols.includes(val)) {
                            setAdditionalSymbols((prev) => [...prev, val]);
                            input.value = '';
                          }
                        }
                      }}
                      className="px-2 py-1.5 text-[10px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Open code editor — always available */}
                <button onClick={() => setShowCodeEditor(true)} className="w-full py-2 text-[11px] text-emerald-600 border border-emerald-200 rounded-md mt-2 hover:bg-emerald-50">Open Editor</button>
              </div>
            )}
            {activeSetupPanel === 'dates' && (
              <div className="space-y-3">
                {/* Quick presets */}
                <div>
                  <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Quick Select</div>
                  <div className="flex flex-wrap gap-1">
                    {(['1M', '3M', '6M', 'YTD', '1Y', '2Y', '3Y', '5Y', 'Max'] as DatePreset[]).map((p) => {
                      // Check if this preset matches current dates
                      const preview = applyDatePreset(p);
                      const isActive = preview.startDate === config.startDate && preview.endDate === config.endDate;
                      return (
                        <button
                          key={p}
                          onClick={() => {
                            const { startDate, endDate } = applyDatePreset(p);
                            setConfig((prev) => ({ ...prev, startDate, endDate }));
                          }}
                          className={`px-2 py-1 text-[10px] font-medium rounded transition ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Manual date inputs */}
                <div className="pt-2 border-t border-gray-200">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Start</div>
                  <input type="date" value={config.startDate} onChange={(e) => setConfig({ ...config, startDate: e.target.value })} className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900" />
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-2 mb-1">End</div>
                  <input type="date" value={config.endDate} onChange={(e) => setConfig({ ...config, endDate: e.target.value })} className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900" />
                  <div className="text-[11px] text-gray-500 mt-1">{daysOfData} days · Interval set via chart toolbar</div>
                </div>
              </div>
            )}
            {activeSetupPanel === 'capital' && (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Initial Capital</div>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input type="number" value={config.initialCapital} onChange={(e) => setConfig({ ...config, initialCapital: parseFloat(e.target.value) || 10000 })} className="w-full pl-8 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md text-gray-900" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                    Sets <code className="bg-gray-100 px-1 rounded">self.portfolio.cash</code> at start. Your strategy code controls position sizing via order quantities.
                  </p>
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
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Spread model</div>
                  <select
                    value={config.spreadModel}
                    onChange={(e) => setConfig({ ...config, spreadModel: e.target.value as BacktestConfig['spreadModel'] })}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-gray-200 rounded text-gray-900 mb-2"
                  >
                    <option value="auto">Auto (estimated from data)</option>
                    <option value="volatility">Volatility-based</option>
                    <option value="fixed_bps">Fixed basis points</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div><span className="text-[10px] text-gray-500 uppercase">Slippage %</span><input type="number" step={0.01} value={config.slippage} onChange={(e) => setConfig({ ...config, slippage: parseFloat(e.target.value) || 0, brokerPreset: 'custom' })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500" disabled={config.slippageModel === 'auto' || config.slippageModel === 'volume_aware' || (config.brokerPreset && config.brokerPreset !== 'custom')} title={config.slippageModel === 'auto' || config.slippageModel === 'volume_aware' ? 'Not used for volume-aware/auto models' : (config.brokerPreset && config.brokerPreset !== 'custom') ? 'Select Custom preset to edit' : undefined} /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Commission %</span><input type="number" step={0.01} value={config.commission} onChange={(e) => setConfig({ ...config, commission: parseFloat(e.target.value) || 0, brokerPreset: 'custom' })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500" disabled={config.brokerPreset !== undefined && config.brokerPreset !== 'custom'} title={config.brokerPreset && config.brokerPreset !== 'custom' ? 'Select Custom preset to edit' : ''} /></div>
              </div>
            )}
            {activeSetupPanel === 'risk' && (
              <div className="space-y-3">
                <p className="text-[10px] text-gray-400 leading-relaxed">Engine-level risk guards. These apply on top of your strategy&apos;s own exit logic.</p>
                <div><span className="text-[10px] text-gray-500 uppercase">Stop Loss %</span><input type="number" step={0.1} value={config.stopLossPct ?? ''} onChange={(e) => setConfig({ ...config, stopLossPct: e.target.value ? parseFloat(e.target.value) : null })} placeholder="None" className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Take Profit %</span><input type="number" step={0.1} value={config.takeProfitPct ?? ''} onChange={(e) => setConfig({ ...config, takeProfitPct: e.target.value ? parseFloat(e.target.value) : null })} placeholder="None" className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Max Drawdown %</span><input type="number" value={config.maxDrawdownPct} onChange={(e) => setConfig({ ...config, maxDrawdownPct: parseFloat(e.target.value) || 50 })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Max Position %</span><input type="number" value={config.maxPositionPct} onChange={(e) => setConfig({ ...config, maxPositionPct: parseFloat(e.target.value) || 100 })} min={1} max={100} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
              </div>
            )}
            {activeSetupPanel === 'engine' && (
              <div className="space-y-3">
                <p className="text-[10px] text-gray-400 leading-relaxed">Engine-level settings. Also configurable in code via <code className="bg-gray-100 px-0.5 rounded">self.set_warmup()</code>.</p>
                <label className="flex items-center gap-2 text-xs text-gray-900"><input type="checkbox" checked={config.marginEnabled} onChange={(e) => setConfig({ ...config, marginEnabled: e.target.checked })} className="rounded" /> Margin</label>
                <label className="flex items-center gap-2 text-xs text-gray-900"><input type="checkbox" checked={config.allowShortsWithoutMargin} onChange={(e) => setConfig({ ...config, allowShortsWithoutMargin: e.target.checked })} className="rounded" /> Allow shorts w/o margin</label>
                <div><span className="text-[10px] text-gray-500 uppercase">Leverage</span><input type="number" min={1} max={10} value={config.leverage} onChange={(e) => setConfig({ ...config, leverage: parseFloat(e.target.value) || 1 })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <div><span className="text-[10px] text-gray-500 uppercase">Warmup bars</span><input type="number" value={config.warmupBars} onChange={(e) => setConfig({ ...config, warmupBars: parseInt(e.target.value, 10) || 0 })} className="ml-2 w-20 px-2 py-1 text-xs bg-white border border-gray-200 rounded text-gray-900" /></div>
                <label className="flex items-center gap-2 text-xs text-gray-900"><input type="checkbox" checked={config.pdtEnabled} onChange={(e) => setConfig({ ...config, pdtEnabled: e.target.checked })} className="rounded" /> PDT rule</label>
              </div>
            )}
            {activeSetupPanel === 'history' && (
              <div className="space-y-2">
                {comparisonHistory.length === 0 ? (
                  <div className="text-center py-6">
                    <RefreshCw className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No runs yet</p>
                    <p className="text-[10px] text-gray-400 mt-1">Run a backtest to see results here</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Recent Runs</div>
                      <button
                        onClick={() => setComparisonHistory([])}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {[...comparisonHistory].reverse().map((run, i) => {
                        const isActive = results && run.timestamp === comparisonHistory[comparisonHistory.length - 1]?.timestamp && results.total_return === run.total_return;
                        const returnPct = run.total_return;
                        const isPositive = returnPct >= 0;
                        const elapsed = Date.now() - run.timestamp;
                        const timeLabel = elapsed < 60000 ? 'just now' : elapsed < 3600000 ? `${Math.floor(elapsed / 60000)}m ago` : `${Math.floor(elapsed / 3600000)}h ago`;

                        // Detect what changed from previous run
                        const prevRun = comparisonHistory[comparisonHistory.length - 1 - i - 1];
                        const changes: string[] = [];
                        if (prevRun) {
                          if (run.configSnapshot.symbol !== prevRun.configSnapshot.symbol) changes.push(`→ ${run.configSnapshot.symbol}`);
                          if (run.configSnapshot.initialCapital !== prevRun.configSnapshot.initialCapital) changes.push(`$${(run.configSnapshot.initialCapital / 1000).toFixed(0)}k`);
                          const paramKeys = Object.keys(run.paramsSnapshot);
                          for (const k of paramKeys) {
                            if (run.paramsSnapshot[k] !== prevRun.paramsSnapshot[k]) {
                              changes.push(`${k}=${run.paramsSnapshot[k]}`);
                            }
                          }
                        }

                        return (
                          <button
                            key={run.timestamp}
                            onClick={() => {
                              setResults(run);
                              setResultsBarExpanded(true);
                              setActiveResultsTab('summary');
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg border transition ${
                              isActive
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-gray-500 truncate max-w-[60%]">{run.label}</span>
                              <span className="text-[9px] text-gray-400 shrink-0">{timeLabel}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isPositive ? '+' : ''}{returnPct.toFixed(1)}%
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <span>SR {run.sharpe_ratio.toFixed(2)}</span>
                                <span>DD {(run.max_drawdown * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                            {changes.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {changes.slice(0, 3).map((c, j) => (
                                  <span key={j} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
                                    {c}
                                  </span>
                                ))}
                                {changes.length > 3 && (
                                  <span className="text-[9px] text-gray-400">+{changes.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="pt-2 border-t border-gray-200">
                      <div className="text-[10px] text-gray-400">
                        {comparisonHistory.length} run{comparisonHistory.length !== 1 ? 's' : ''} · Best: {
                          Math.max(...comparisonHistory.map(r => r.total_return)).toFixed(1)
                        }% · Worst: {
                          Math.min(...comparisonHistory.map(r => r.total_return)).toFixed(1)
                        }%
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Resize handle */}
          <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" onMouseDown={handleSetupPanelResizeStart} style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(156,163,175,0.6) 50%)' }} title="Resize" />
        </div>,
        document.getElementById('portal-root') ?? document.body
      )}

      {/* Floating Code Editor */}
      <FloatingCodeEditor
        visible={showCodeEditor}
        onClose={() => setShowCodeEditor(false)}
        code={code}
        onCodeChange={setCode}
        savedStrategyId={savedStrategyId}
        strategyParams={strategyParams}
        onSetStrategyParams={setStrategyParams}
        effectiveChartTheme={effectiveChartTheme}
        user={user ? { username: user.username } : null}
        onError={setError}
        strategyTitle={displayedSavedStrategies.find(s => s.id === savedStrategyId)?.title ?? 'strategy.py'}
        error={error}
      />
    </div>
  );
}
