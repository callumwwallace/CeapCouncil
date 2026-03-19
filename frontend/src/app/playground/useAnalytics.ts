import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type { OptimizeResults, WalkForwardResults, OosResults, MonteCarloResults, CpcvResults, FactorResults } from '@/types';
import { STRATEGY_PARAMS, type StrategyTemplateKey } from './strategyTemplates';
import type { BacktestConfig } from './types';
import { extractApiError, pollTaskResult } from './utils';

interface UseAnalyticsInput {
  config: BacktestConfig;
  code: string;
  playgroundStrategyId: number | null;
  strategyMode: 'templates' | 'custom';
  selectedTemplate: StrategyTemplateKey;
  strategyParams: Record<string, number>;
}

export function useAnalytics({
  config,
  code,
  playgroundStrategyId,
  strategyMode,
  selectedTemplate,
  strategyParams,
}: UseAnalyticsInput) {
  // Optimization
  const [optimizeResults, setOptimizeResults] = useState<OptimizeResults | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeMethod, setOptimizeMethod] = useState<'grid' | 'bayesian' | 'genetic' | 'multiobjective' | 'heatmap'>('grid');
  const [optConstraints, setOptConstraints] = useState<{max_drawdown?: number; min_trades?: number; min_win_rate?: number}>({});
  const [showConstraints, setShowConstraints] = useState(false);
  const [heatmapParamX, setHeatmapParamX] = useState('');
  const [heatmapParamY, setHeatmapParamY] = useState('');
  const [multiObjMetrics, setMultiObjMetrics] = useState<[string, string]>(['sharpe_ratio', 'max_drawdown']);

  // Walk-forward
  const [walkForwardResults, setWalkForwardResults] = useState<WalkForwardResults | null>(null);
  const [walkForwardLoading, setWalkForwardLoading] = useState(false);
  const [walkForwardPurgeBars, setWalkForwardPurgeBars] = useState(0);
  const [walkForwardWindowMode, setWalkForwardWindowMode] = useState<'rolling' | 'anchored'>('rolling');

  // OOS
  const [oosResults, setOosResults] = useState<OosResults | null>(null);
  const [oosLoading, setOosLoading] = useState(false);
  const [oosNfolds, setOosNfolds] = useState(1);

  // CPCV
  const [cpcvResults, setCpcvResults] = useState<CpcvResults | null>(null);
  const [cpcvLoading, setCpcvLoading] = useState(false);
  const [cpcvNGroups, setCpcvNGroups] = useState(6);
  const [cpcvPurgeBars, setCpcvPurgeBars] = useState(10);

  // Factor attribution
  const [factorResults, setFactorResults] = useState<FactorResults | null>(null);
  const [factorLoading, setFactorLoading] = useState(false);

  // Monte Carlo
  const [monteCarloResults, setMonteCarloResults] = useState<MonteCarloResults | null>(null);
  const [monteCarloLoading, setMonteCarloLoading] = useState(false);

  // Shared
  const [lastBacktestId, setLastBacktestId] = useState<number | null>(null);

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

  return {
    // Results
    optimizeResults,
    walkForwardResults,
    oosResults,
    cpcvResults,
    factorResults,
    monteCarloResults,
    // Loading states
    optimizeLoading,
    walkForwardLoading,
    oosLoading,
    cpcvLoading,
    factorLoading,
    monteCarloLoading,
    // Config state
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
    // Handlers
    handleRunOptimization,
    handleRunWalkForward,
    handleRunOos,
    handleRunCpcv,
    handleRunFactorAttribution,
    handleRunMonteCarlo,
  };
}
