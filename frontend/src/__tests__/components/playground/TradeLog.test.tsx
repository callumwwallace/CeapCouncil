import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import TradeLog from '@/components/playground/TradeLog';
import { BacktestTrade } from '@/types';

jest.mock('lucide-react', () => ({
  ArrowUpRight: () => <span data-testid="icon-arrow-up" />,
  ArrowDownRight: () => <span data-testid="icon-arrow-down" />,
  TrendingUp: () => <span data-testid="icon-trending-up" />,
}));

jest.mock('react-window', () => ({
  List: ({ rowComponent: Row, rowCount, rowHeight, rowProps }: {
    rowComponent: React.ComponentType<{ index: number; style: React.CSSProperties; [key: string]: unknown }>;
    rowCount: number;
    rowHeight: number;
    rowProps?: Record<string, unknown>;
    overscanCount?: number;
    defaultHeight?: number;
  }) => (
    <div data-testid="virtual-list">
      {Array.from({ length: rowCount }, (_, i) => (
        <Row key={i} index={i} style={{ height: rowHeight }} {...rowProps} />
      ))}
    </div>
  ),
}));

const mockTrades: BacktestTrade[] = [
  {
    entry_date: '2023-02-15',
    exit_date: '2023-03-10',
    entry_price: 150.0,
    exit_price: 165.0,
    size: 66,
    pnl: 990.0,
    pnl_pct: 10.0,
    commission: 1.32,
    type: 'LONG',
  },
  {
    entry_date: '2023-05-20',
    exit_date: '2023-07-01',
    entry_price: 155.0,
    exit_price: 145.0,
    size: 64,
    pnl: -640.0,
    pnl_pct: -6.45,
    commission: 1.28,
    type: 'LONG',
  },
  {
    entry_date: '2023-08-01',
    exit_date: '2023-09-15',
    entry_price: 160.0,
    exit_price: 155.0,
    size: 50,
    pnl: -250.0,
    pnl_pct: -3.13,
    commission: 1.0,
    type: 'SHORT',
  },
];

describe('TradeLog', () => {
  describe('rendering', () => {
    it('renders the trade log component with trades', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByTestId('trade-log')).toBeInTheDocument();
    });

    it('renders summary stats', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByText('Trades')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
      expect(screen.getByText('Total P&L')).toBeInTheDocument();
      expect(screen.getByText('Avg Trade')).toBeInTheDocument();
    });

    it('renders column headers', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Entry')).toBeInTheDocument();
      expect(screen.getByText('Exit')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();
      expect(screen.getByText('P&L')).toBeInTheDocument();
      expect(screen.getByText('Comm.')).toBeInTheDocument();
    });

    it('renders trade rows with numeric index testids', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByTestId('trade-row-0')).toBeInTheDocument();
      expect(screen.getByTestId('trade-row-1')).toBeInTheDocument();
      expect(screen.getByTestId('trade-row-2')).toBeInTheDocument();
    });
  });

  describe('trade display', () => {
    it('displays correct trade count', () => {
      render(<TradeLog trades={mockTrades} />);
      const tradesHeader = screen.getByText('Trades');
      const tradesValue = tradesHeader.parentElement?.querySelector('.font-semibold');
      expect(tradesValue?.textContent).toBe('3');
    });

    it('displays LONG trades with green styling', () => {
      render(<TradeLog trades={mockTrades} />);
      const longBadges = screen.getAllByText('LONG');
      longBadges.forEach((badge) => {
        expect(badge.className).toContain('bg-emerald-');
      });
    });

    it('displays SHORT trades with red styling', () => {
      render(<TradeLog trades={mockTrades} />);
      const shortBadges = screen.getAllByText('SHORT');
      shortBadges.forEach((badge) => {
        expect(badge.className).toContain('bg-red-');
      });
    });

    it('displays positive P&L with emerald color', () => {
      render(<TradeLog trades={mockTrades} />);
      const pnlElement = screen.getByText((content, element) => {
        return !!element?.classList.contains('text-emerald-400') && content.includes('+$990');
      });
      expect(pnlElement).toBeInTheDocument();
    });

    it('displays negative P&L with red color', () => {
      render(<TradeLog trades={mockTrades} />);
      const pnlElement = screen.getByText(/-640\.00/);
      expect(pnlElement.closest('.text-red-400')).not.toBeNull();
    });

    it('displays win rate correctly', () => {
      render(<TradeLog trades={mockTrades} />);
      const winRateHeader = screen.getByText('Win Rate');
      const winRateValue = winRateHeader.parentElement?.querySelector('.font-semibold');
      expect(winRateValue?.textContent).toBe('33%');
    });

    it('displays entry and exit prices', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByText('$150.00')).toBeInTheDocument();
      expect(screen.getByText('$165.00')).toBeInTheDocument();
    });

    it('displays trade size', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByText('66')).toBeInTheDocument();
      expect(screen.getByText('64')).toBeInTheDocument();
    });

    it('displays commission', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByText('$1.32')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no trades', () => {
      render(<TradeLog trades={[]} />);
      expect(screen.getByTestId('trade-log-empty')).toBeInTheDocument();
      expect(screen.getByText('No trades yet')).toBeInTheDocument();
    });

    it('shows description text in empty state', () => {
      render(<TradeLog trades={[]} />);
      expect(screen.getByText('Run a backtest to see trade history')).toBeInTheDocument();
    });
  });

  describe('calculations', () => {
    it('computes total P&L across all trades', () => {
      render(<TradeLog trades={mockTrades} />);
      const totalPnlHeader = screen.getByText('Total P&L');
      const totalPnlValue = totalPnlHeader.parentElement?.querySelector('.font-semibold');
      expect(totalPnlValue?.textContent).toBe('+$100');
    });

    it('computes average trade P&L', () => {
      render(<TradeLog trades={mockTrades} />);
      const avgHeader = screen.getByText('Avg Trade');
      const avgValue = avgHeader.parentElement?.querySelector('.font-semibold');
      expect(avgValue?.textContent).toBe('+$33');
    });

    it('colors win rate amber when below 50%', () => {
      render(<TradeLog trades={mockTrades} />);
      const winRateHeader = screen.getByText('Win Rate');
      const winRateValue = winRateHeader.parentElement?.querySelector('.font-semibold');
      expect(winRateValue?.className).toContain('text-amber-400');
    });

    it('colors win rate green when 50% or above', () => {
      const winningTrades: BacktestTrade[] = [
        { ...mockTrades[0] },
        { ...mockTrades[0], entry_date: '2023-06-01', exit_date: '2023-07-01' },
      ];
      render(<TradeLog trades={winningTrades} />);
      const winRateHeader = screen.getByText('Win Rate');
      const winRateValue = winRateHeader.parentElement?.querySelector('.font-semibold');
      expect(winRateValue?.className).toContain('text-emerald-400');
    });
  });

  describe('virtualization', () => {
    it('uses virtual list when trade count exceeds threshold', () => {
      const manyTrades: BacktestTrade[] = Array.from({ length: 150 }, (_, i) => ({
        entry_date: `2023-01-${String((i % 28) + 1).padStart(2, '0')}`,
        exit_date: `2023-02-${String((i % 28) + 1).padStart(2, '0')}`,
        entry_price: 100 + i,
        exit_price: 105 + i,
        size: 10,
        pnl: 50,
        pnl_pct: 5.0,
        commission: 0.5,
        type: 'LONG' as const,
      }));
      render(<TradeLog trades={manyTrades} />);
      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });

    it('does not use virtual list for small trade counts', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.queryByTestId('virtual-list')).not.toBeInTheDocument();
    });
  });
});
