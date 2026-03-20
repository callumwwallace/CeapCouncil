'use client';

import Editor, { OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import { parseErrorLines } from '@/app/playground/parseErrorLine';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

const STRATEGY_COMPLETIONS = [
  // Lifecycle
  { label: 'on_init', kind: 'Method', detail: 'Called once before backtest starts', insertText: 'def on_init(self):\n    ${1:pass}' },
  { label: 'on_data', kind: 'Method', detail: 'Called on each new bar', insertText: 'def on_data(self, bar):\n    ${1:pass}' },
  { label: 'on_order_event', kind: 'Method', detail: 'Called when an order fills', insertText: 'def on_order_event(self, fill):\n    ${1:pass}' },
  { label: 'on_end', kind: 'Method', detail: 'Called when backtest finishes', insertText: 'def on_end(self):\n    ${1:pass}' },

  // Orders
  { label: 'market_order', kind: 'Method', detail: 'Submit a market order', insertText: 'self.market_order(${1:symbol}, ${2:quantity})' },
  { label: 'limit_order', kind: 'Method', detail: 'Submit a limit order', insertText: 'self.limit_order(${1:symbol}, ${2:quantity}, ${3:price})' },
  { label: 'stop_order', kind: 'Method', detail: 'Submit a stop order', insertText: 'self.stop_order(${1:symbol}, ${2:quantity}, ${3:stop_price})' },
  { label: 'stop_limit_order', kind: 'Method', detail: 'Submit a stop limit order', insertText: 'self.stop_limit_order(${1:symbol}, ${2:quantity}, ${3:stop_price}, ${4:limit_price})' },
  { label: 'trailing_stop', kind: 'Method', detail: 'Submit a trailing stop', insertText: 'self.trailing_stop(${1:symbol}, ${2:quantity}, trail_percent=${3:2.0})' },
  { label: 'bracket_order', kind: 'Method', detail: 'Entry + TP + SL bracket', insertText: 'self.bracket_order(${1:symbol}, ${2:quantity}, take_profit_price=${3:tp}, stop_loss_price=${4:sl})' },
  { label: 'oco_order', kind: 'Method', detail: 'One-Cancels-Other order', insertText: 'self.oco_order(${1:symbol}, {"quantity": ${2:qty}, "price": ${3:p1}, "order_type": "limit"}, {"quantity": ${4:qty}, "price": ${5:p2}, "order_type": "stop"})' },
  { label: 'close_position', kind: 'Method', detail: 'Close entire position', insertText: 'self.close_position(${1:symbol})' },
  { label: 'cancel_all_orders', kind: 'Method', detail: 'Cancel all pending orders', insertText: 'self.cancel_all_orders(${1:symbol})' },

  // Data
  { label: 'history', kind: 'Method', detail: 'Get recent bars', insertText: 'self.history(${1:symbol}, length=${2:20})' },
  { label: 'position_size', kind: 'Method', detail: 'Get position quantity', insertText: 'self.position_size(${1:symbol})' },
  { label: 'is_long', kind: 'Method', detail: 'Check if long', insertText: 'self.is_long(${1:symbol})' },
  { label: 'is_short', kind: 'Method', detail: 'Check if short', insertText: 'self.is_short(${1:symbol})' },
  { label: 'is_flat', kind: 'Method', detail: 'Check if no position', insertText: 'self.is_flat(${1:symbol})' },

  // Properties
  { label: 'portfolio', kind: 'Property', detail: 'Access portfolio state', insertText: 'self.portfolio' },
  { label: 'portfolio.equity', kind: 'Property', detail: 'Current portfolio equity', insertText: 'self.portfolio.equity' },
  { label: 'portfolio.cash', kind: 'Property', detail: 'Available cash', insertText: 'self.portfolio.cash' },
  { label: 'time', kind: 'Property', detail: 'Current simulation time', insertText: 'self.time' },
  { label: 'bar_index', kind: 'Property', detail: 'Current bar index', insertText: 'self.bar_index' },

  // Warm-up
  { label: 'set_warmup', kind: 'Method', detail: 'Set warm-up period (bars)', insertText: 'self.set_warmup(bars=${1:200})' },
  { label: 'is_warming_up', kind: 'Property', detail: 'True during warm-up', insertText: 'self.is_warming_up' },

  // Custom charts & notifications
  { label: 'plot', kind: 'Method', detail: 'Plot value on custom chart', insertText: 'self.plot(${1:"Chart Name"}, ${2:"Series"}, ${3:value})' },
  { label: 'notify', kind: 'Method', detail: 'Send alert notification', insertText: 'self.notify(${1:"message"}, level=${2:"info"})' },

  // Scheduling
  { label: 'schedule', kind: 'Method', detail: 'Schedule recurring callback', insertText: 'self.schedule(${1:"name"}, every_n_bars=${2:20}, callback=${3:self.rebalance})' },

  // Params
  { label: 'params.setdefault', kind: 'Method', detail: 'Set default parameter', insertText: "self.params.setdefault('${1:name}', ${2:value})" },

  // Indicators
  { label: 'SMA', kind: 'Class', detail: 'Simple Moving Average', insertText: 'SMA(period=${1:20})' },
  { label: 'EMA', kind: 'Class', detail: 'Exponential Moving Average', insertText: 'EMA(period=${1:20})' },
  { label: 'RSI', kind: 'Class', detail: 'Relative Strength Index', insertText: 'RSI(period=${1:14})' },
  { label: 'MACD', kind: 'Class', detail: 'MACD (fast, slow, signal)', insertText: 'MACD(fast=${1:12}, slow=${2:26}, signal=${3:9})' },
  { label: 'BollingerBands', kind: 'Class', detail: 'Bollinger Bands', insertText: 'BollingerBands(period=${1:20}, num_std=${2:2.0})' },
  { label: 'ATR', kind: 'Class', detail: 'Average True Range', insertText: 'ATR(period=${1:14})' },
  { label: 'Stochastic', kind: 'Class', detail: 'Stochastic Oscillator', insertText: 'Stochastic(k_period=${1:14}, d_period=${2:3})' },
  { label: 'ADX', kind: 'Class', detail: 'Average Directional Index', insertText: 'ADX(period=${1:14})' },
  { label: 'CCI', kind: 'Class', detail: 'Commodity Channel Index', insertText: 'CCI(period=${1:20})' },
  { label: 'WilliamsR', kind: 'Class', detail: 'Williams %R', insertText: 'WilliamsR(period=${1:14})' },
  { label: 'ROC', kind: 'Class', detail: 'Rate of Change', insertText: 'ROC(period=${1:12})' },
  { label: 'OBV', kind: 'Class', detail: 'On-Balance Volume', insertText: 'OBV()' },
  { label: 'MFI', kind: 'Class', detail: 'Money Flow Index', insertText: 'MFI(period=${1:14})' },
  { label: 'IchimokuCloud', kind: 'Class', detail: 'Ichimoku Cloud', insertText: 'IchimokuCloud(tenkan=${1:9}, kijun=${2:26}, senkou_b=${3:52})' },
  { label: 'ParabolicSAR', kind: 'Class', detail: 'Parabolic SAR', insertText: 'ParabolicSAR()' },
  { label: 'DonchianChannel', kind: 'Class', detail: 'Donchian Channel', insertText: 'DonchianChannel(period=${1:20})' },
  { label: 'KeltnerChannel', kind: 'Class', detail: 'Keltner Channel', insertText: 'KeltnerChannel(period=${1:20})' },
  { label: 'StdDev', kind: 'Class', detail: 'Standard Deviation', insertText: 'StdDev(period=${1:20})' },
  { label: 'LinearRegression', kind: 'Class', detail: 'Linear Regression', insertText: 'LinearRegression(period=${1:20})' },
  { label: 'ZScore', kind: 'Class', detail: 'Z-Score', insertText: 'ZScore(period=${1:20})' },
  { label: 'HurstExponent', kind: 'Class', detail: 'Hurst exponent (trend test)', insertText: 'HurstExponent(max_lag=${1:20})' },
  { label: 'HistoricalVolatility', kind: 'Class', detail: 'Annualized volatility', insertText: 'HistoricalVolatility(period=${1:20})' },

  // Consolidators
  { label: 'TimeConsolidator', kind: 'Class', detail: 'Consolidate bars by time', insertText: 'TimeConsolidator(minutes=${1:60}, callback=${2:self.on_hourly})' },
  { label: 'BarCountConsolidator', kind: 'Class', detail: 'Consolidate every N bars', insertText: 'BarCountConsolidator(count=${1:5}, callback=${2:self.on_consolidated})' },
  { label: 'RenkoConsolidator', kind: 'Class', detail: 'Renko bars', insertText: 'RenkoConsolidator(brick_size=${1:10.0}, callback=${2:self.on_renko})' },

  // Bar properties
  { label: 'bar.open', kind: 'Property', detail: 'Bar open price', insertText: 'bar.open' },
  { label: 'bar.high', kind: 'Property', detail: 'Bar high price', insertText: 'bar.high' },
  { label: 'bar.low', kind: 'Property', detail: 'Bar low price', insertText: 'bar.low' },
  { label: 'bar.close', kind: 'Property', detail: 'Bar close price', insertText: 'bar.close' },
  { label: 'bar.volume', kind: 'Property', detail: 'Bar volume', insertText: 'bar.volume' },
  { label: 'bar.symbol', kind: 'Property', detail: 'Bar symbol', insertText: 'bar.symbol' },
  { label: 'bar.timestamp', kind: 'Property', detail: 'Bar timestamp', insertText: 'bar.timestamp' },
];

export default function CodeEditor({ value, onChange, error }: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!model || !monaco) return;

    const lineCount = model.getLineCount();
    const parsed = parseErrorLines(error, lineCount);

    if (parsed.length === 0) {
      monaco.editor.setModelMarkers(model, 'backtest', []);
      return;
    }

    const markers = parsed.map(({ line, message }) => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: model.getLineMaxColumn(line),
      message: message.slice(0, 500),
    }));

    monaco.editor.setModelMarkers(model, 'backtest', markers);

    if (parsed.length > 0 && editor) {
      editor.revealLineInCenter(parsed[0].line);
    }
  }, [error, value]);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // Register completion provider for Python
    monaco.languages.registerCompletionItemProvider('python', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // Get the text before cursor for context
        const lineContent = model.getLineContent(position.lineNumber);
        const textBefore = lineContent.substring(0, position.column - 1);

        const suggestions = STRATEGY_COMPLETIONS.map((item) => {
          let kindEnum = monaco.languages.CompletionItemKind.Method;
          if (item.kind === 'Class') kindEnum = monaco.languages.CompletionItemKind.Class;
          if (item.kind === 'Property') kindEnum = monaco.languages.CompletionItemKind.Property;

          return {
            label: item.label,
            kind: kindEnum,
            detail: item.detail,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          };
        });

        return { suggestions };
      },
      triggerCharacters: ['.', '('],
    });

    // Add custom theme overrides for better contrast
    monaco.editor.defineTheme('ceapcouncil-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c586c0' },
        { token: 'string', foreground: 'ce9178' },
        { token: 'number', foreground: 'b5cea8' },
        { token: 'comment', foreground: '6a9955' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editor.lineHighlightBackground': '#161b22',
        'editorCursor.foreground': '#10b981',
        'editor.selectionBackground': '#264f78',
      },
    });
    monaco.editor.setTheme('ceapcouncil-dark');
  }, []);

  return (
    <Editor
      height="100%"
      defaultLanguage="python"
      value={value}
      onChange={(val) => onChange(val || '')}
      theme="vs-dark"
      onMount={handleEditorMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Monaco', monospace",
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        wordWrap: 'off',
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        smoothScrolling: true,
        folding: true,
        bracketPairColorization: { enabled: true },
        lineHeight: 20,
        letterSpacing: 0.3,
        renderWhitespace: 'selection',
        guides: {
          indentation: true,
          bracketPairs: true,
        },
        quickSuggestions: {
          other: true,
          comments: false,
          strings: false,
        },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnCommitCharacter: true,
        snippetSuggestions: 'top',
        suggest: {
          showMethods: true,
          showFunctions: true,
          showClasses: true,
          showKeywords: true,
          showSnippets: true,
          preview: true,
        },
      }}
      loading={
        <div className="h-full flex items-center justify-center bg-[#0d1117]">
          <div className="text-gray-400 text-sm">Loading editor...</div>
        </div>
      }
    />
  );
}
