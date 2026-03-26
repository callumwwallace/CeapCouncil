import { useState, useCallback, useRef } from 'react';
import api from '@/lib/api';
import type { OptimizeResults, WalkForwardResults, OosResults, MonteCarloResults, CpcvResults, FactorResults } from '@/types';
import type { BacktestConfig } from './types';
import { extractApiError, pollTaskResult } from './utils';
import { type ExtractedParam, buildParamRanges } from './extractParams';

// Polling budgets per operation type.
// Standard tasks (grid, bayesian, genetic, WFO, OOS, Monte Carlo): 4 min
// CPCV runs N×(N-1)/2 backtests so we budget 9 min at a longer interval.
// Factor attribution is fast (seconds), 2 min is plenty.
const POLL_STANDARD   = { maxAttempts: 120, intervalMs: 2000 } as const; // 4 min
const POLL_CPCV       = { maxAttempts: 180, intervalMs: 3000 } as const; // 9 min
const POLL_FACTOR     = { maxAttempts:  60, intervalMs: 2000 } as const; // 2 min

interface UseAnalyticsInput {
  config: BacktestConfig;
  code: string;
  paramDefs: ExtractedParam[];
  strategyParams: Record<string, number>;
}

export function useAnalytics({
  config,
  code,
  paramDefs,
  strategyParams,
}: UseAnalyticsInput) {
  // optimization state
  const [optimizeResults, setOptimizeResults] = useState<OptimizeResults | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeElapsed, setOptimizeElapsed] = useState(0);
  const optimizeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [optimizeMethod, setOptimizeMethod] = useState<'grid' | 'bayesian' | 'genetic' | 'multiobjective' | 'heatmap'>('grid');
  const [optConstraints, setOptConstraints] = useState<{max_drawdown?: number; min_trades?: number; min_win_rate?: number}>({});
  const [showConstraints, setShowConstraints] = useState(false);
  const [heatmapParamX, setHeatmapParamX] = useState('');
  const [heatmapParamY, setHeatmapParamY] = useState('');
  const [multiObjMetrics, setMultiObjMetrics] = useState<[string, string]>(['sharpe_ratio', 'max_drawdown']);

  // walk-forward state
  const [walkForwardResults, setWalkForwardResults] = useState<WalkForwardResults | null>(null);
  const [walkForwardLoading, setWalkForwardLoading] = useState(false);
  const [walkForwardPurgeBars, setWalkForwardPurgeBars] = useState(0);
  const [walkForwardWindowMode, setWalkForwardWindowMode] = useState<'rolling' | 'anchored'>('rolling');

  // out-of-sample state
  const [oosResults, setOosResults] = useState<OosResults | null>(null);
  const [oosLoading, setOosLoading] = useState(false);
  const [oosNfolds, setOosNfolds] = useState(1);

  // CPCV state
  const [cpcvResults, setCpcvResults] = useState<CpcvResults | null>(null);
  const [cpcvLoading, setCpcvLoading] = useState(false);
  const [cpcvNGroups, setCpcvNGroups] = useState(6);
  const [cpcvPurgeBars, setCpcvPurgeBars] = useState(10);

  // factor attribution state
  const [factorResults, setFactorResults] = useState<FactorResults | null>(null);
  const [factorLoading, setFactorLoading] = useState(false);

  // monte carlo state
  const [monteCarloResults, setMonteCarloResults] = useState<MonteCarloResults | null>(null);
  const [monteCarloLoading, setMonteCarloLoading] = useState(false);

  // the last backtest ID — needed for factor attribution and monte carlo
  const [lastBacktestId, setLastBacktestId] = useState<number | null>(null);

  // handlers

  const handleRunOptimization = useCallback(async () => {
    if (paramDefs.length === 0) {
      setOptimizeResults({ error: 'No parameters detected — add at least one @param annotation to your strategy' });
      return;
    }
    setOptimizeLoading(true);
    setOptimizeResults(null);
    setOptimizeElapsed(0);
    optimizeTimerRef.current = setInterval(() => setOptimizeElapsed(s => s + 1), 1000);
    try {
      const activeConstraints = showConstraints && Object.keys(optConstraints).length > 0 ? optConstraints : undefined;
      const basePayload = {
        code,
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
            low: p.min,
            high: p.max,
            step: p.step,
            type: p.type === 'float' ? 'float' : 'int',
          };
        }
        return ranges;
      };

      const poll = (task_id: string) =>
        pollTaskResult(api.getOptimizationResult.bind(api), task_id, POLL_STANDARD).then(setOptimizeResults);

      if (optimizeMethod === 'bayesian') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) {
          setOptimizeResults({ error: 'No parameter ranges defined for optimization' });
          return;
        }
        const { task_id } = await api.runBayesianOptimization({
          ...basePayload,
          param_ranges: ranges, n_trials: 50, objective_metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await poll(task_id);

      } else if (optimizeMethod === 'genetic') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) {
          setOptimizeResults({ error: 'No parameter ranges defined for optimization' });
          return;
        }
        const { task_id } = await api.runGeneticOptimization({
          ...basePayload,
          param_ranges: ranges, population_size: 50, n_generations: 20,
          objective_metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await poll(task_id);

      } else if (optimizeMethod === 'multiobjective') {
        const ranges = buildRanges();
        if (Object.keys(ranges).length === 0) {
          setOptimizeResults({ error: 'No parameter ranges defined for optimization' });
          return;
        }
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
        if (!px || !py) {
          setOptimizeResults({ error: 'Selected heatmap parameters not found in strategy code' });
          return;
        }
        const { task_id } = await api.runHeatmap({
          ...basePayload,
          param_x: heatmapParamX, param_y: heatmapParamY,
          x_range: { low: px.min, high: px.max, steps: 15 },
          y_range: { low: py.min, high: py.max, steps: 15 },
          metric: 'sharpe_ratio',
          constraints: activeConstraints,
        });
        await poll(task_id);

      } else {
        // Grid search
        const grid: Record<string, number[]> = {};
        for (const p of paramDefs) {
          const current = strategyParams[p.key] ?? p.defaultValue;
          const step = p.step;
          const vals: number[] = [];
          for (let i = -2; i <= 2; i++) {
            const v = +(current + i * step * 2).toFixed(4);
            if (v >= p.min && v <= p.max) vals.push(v);
          }
          if (vals.length > 0) grid[p.key] = [...new Set(vals)];
        }
        if (Object.keys(grid).length === 0) {
          setOptimizeResults({ error: 'Could not build a parameter grid — check your parameter ranges' });
          return;
        }
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
      if (optimizeTimerRef.current) {
        clearInterval(optimizeTimerRef.current);
        optimizeTimerRef.current = null;
      }
    }
  }, [paramDefs, strategyParams, config, code, optimizeMethod, optConstraints, showConstraints, heatmapParamX, heatmapParamY, multiObjMetrics]);

  const handleRunWalkForward = useCallback(async () => {
    setWalkForwardLoading(true);
    setWalkForwardResults(null);
    try {
      const { task_id } = await api.runWalkForward({
        code,
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

      const res = await pollTaskResult(api.getWalkForwardResult.bind(api), task_id, POLL_STANDARD);
      setWalkForwardResults(res);
    } catch (err: unknown) {
      setWalkForwardResults({ error: extractApiError(err, 'Walk-forward failed') });
    } finally {
      setWalkForwardLoading(false);
    }
  }, [code, config, walkForwardPurgeBars, walkForwardWindowMode]);

  const handleRunOos = useCallback(async () => {
    setOosLoading(true);
    setOosResults(null);
    try {
      const paramRanges = paramDefs.length > 0 ? buildParamRanges(paramDefs) : undefined;
      const { task_id } = await api.runOosValidation({
        code,
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        initial_capital: config.initialCapital,
        commission: config.commission / 100,
        slippage: config.slippage / 100,
        oos_ratio: 0.3,
        n_folds: oosNfolds,
        param_ranges: paramRanges,
        n_trials: 30,
        interval: config.interval,
      });
      const res = await pollTaskResult(api.getOosResult.bind(api), task_id, POLL_STANDARD);
      setOosResults(res);
    } catch (err: unknown) {
      setOosResults({ error: extractApiError(err, 'OOS validation failed') });
    } finally {
      setOosLoading(false);
    }
  }, [code, config, oosNfolds, paramDefs]);

  const handleRunCpcv = useCallback(async () => {
    setCpcvLoading(true);
    setCpcvResults(null);
    try {
      const paramRanges = paramDefs.length > 0 ? buildParamRanges(paramDefs) : undefined;
      const { task_id } = await api.runCpcv({
        code,
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
        param_ranges: paramRanges,
        n_trials: 30,
        interval: config.interval,
      });
      const res = await pollTaskResult(api.getCpcvResult.bind(api), task_id, POLL_CPCV);
      setCpcvResults(res);
    } catch (err: unknown) {
      setCpcvResults({ error: extractApiError(err, 'CPCV failed') });
    } finally {
      setCpcvLoading(false);
    }
  }, [code, config, cpcvNGroups, cpcvPurgeBars, paramDefs]);

  const handleRunFactorAttribution = useCallback(async () => {
    if (!lastBacktestId) {
      setFactorResults({ error: 'Run a backtest first — factor attribution requires a completed backtest' });
      return;
    }
    setFactorLoading(true);
    setFactorResults(null);
    try {
      const { task_id } = await api.runFactorAttribution(lastBacktestId);
      const res = await pollTaskResult(api.getFactorAttributionResult.bind(api), task_id, POLL_FACTOR);
      setFactorResults(res);
    } catch (err: unknown) {
      setFactorResults({ error: extractApiError(err, 'Factor attribution failed') });
    } finally {
      setFactorLoading(false);
    }
  }, [lastBacktestId]);

  const handleRunMonteCarlo = useCallback(async () => {
    if (!lastBacktestId) {
      setMonteCarloResults({ error: 'Run a backtest first — Monte Carlo simulation requires a completed backtest' });
      return;
    }
    setMonteCarloLoading(true);
    setMonteCarloResults(null);
    try {
      const { task_id } = await api.runMonteCarlo(lastBacktestId, {
        n_simulations: 1000,
      });

      const res = await pollTaskResult(api.getMonteCarloResult.bind(api), task_id, POLL_STANDARD);
      setMonteCarloResults(res);
    } catch (err: unknown) {
      setMonteCarloResults({ error: extractApiError(err, 'Monte Carlo failed') });
    } finally {
      setMonteCarloLoading(false);
    }
  }, [lastBacktestId]);

  return {
    // results
    optimizeResults,
    walkForwardResults,
    oosResults,
    cpcvResults,
    factorResults,
    monteCarloResults,
    // loading flags
    optimizeLoading,
    optimizeElapsed,
    walkForwardLoading,
    oosLoading,
    cpcvLoading,
    factorLoading,
    monteCarloLoading,
    // per-tab config
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
    // run handlers
    handleRunOptimization,
    handleRunWalkForward,
    handleRunOos,
    handleRunCpcv,
    handleRunFactorAttribution,
    handleRunMonteCarlo,
  };
}