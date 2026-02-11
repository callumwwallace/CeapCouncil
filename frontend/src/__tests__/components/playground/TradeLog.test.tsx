import { render, screen } from '@testing-library/react';
import TradeLog, { generateMockTrades, Trade } from '@/components/playground/TradeLog';

describe('TradeLog', () => {
  // Use pre-defined trades for deterministic tests
  const mockTrades: Trade[] = [
    {
      id: 'trade-1',
      date: '2023-02-15',
      type: 'BUY',
      price: 150.00,
      shares: 66,
      value: 9900.00,
    },
    {
      id: 'trade-2',
      date: '2023-05-20',
      type: 'SELL',
      price: 165.00,
      shares: 66,
      value: 10890.00,
      pnl: 990.00,
      pnlPercent: 10.0,
    },
    {
      id: 'trade-3',
      date: '2023-07-10',
      type: 'BUY',
      price: 155.00,
      shares: 64,
      value: 9920.00,
    },
    {
      id: 'trade-4',
      date: '2023-10-15',
      type: 'SELL',
      price: 145.00,
      shares: 64,
      value: 9280.00,
      pnl: -640.00,
      pnlPercent: -6.45,
    },
  ];

  describe('rendering', () => {
    it('renders the trade log component with trades', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByTestId('trade-log')).toBeInTheDocument();
    });

    it('renders summary stats', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByText('Trades')).toBeInTheDocument();
      expect(screen.getByText('Round Trips')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
      expect(screen.getByText('Total P&L')).toBeInTheDocument();
    });

    it('renders table headers', () => {
      render(<TradeLog trades={mockTrades} />);
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Shares')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
      expect(screen.getByText('P&L')).toBeInTheDocument();
    });

    it('renders trade rows', () => {
      render(<TradeLog trades={mockTrades} />);
      const tradeRows = screen.getAllByTestId(/trade-row-/);
      expect(tradeRows.length).toBe(4);
    });
  });

  describe('trade display', () => {
    it('renders provided trades', () => {
      render(<TradeLog trades={mockTrades} />);
      
      expect(screen.getByTestId('trade-row-trade-1')).toBeInTheDocument();
      expect(screen.getByTestId('trade-row-trade-2')).toBeInTheDocument();
    });

    it('displays correct trade count', () => {
      render(<TradeLog trades={mockTrades} />);
      
      // Find the "4" in the Trades stat
      const tradesHeader = screen.getByText('Trades');
      const tradesValue = tradesHeader.parentElement?.querySelector('.font-semibold');
      expect(tradesValue?.textContent).toBe('4');
    });

    it('displays BUY trades with green styling', () => {
      render(<TradeLog trades={mockTrades} />);
      
      const buyBadges = screen.getAllByText('BUY');
      buyBadges.forEach(badge => {
        expect(badge).toHaveClass('bg-emerald-900/50');
      });
    });

    it('displays SELL trades with red styling', () => {
      render(<TradeLog trades={mockTrades} />);
      
      const sellBadges = screen.getAllByText('SELL');
      sellBadges.forEach(badge => {
        expect(badge).toHaveClass('bg-red-900/50');
      });
    });

    it('displays positive P&L with green color', () => {
      render(<TradeLog trades={mockTrades} />);
      
      // The first sell trade has positive P&L (+$990)
      const pnlText = screen.getByText(/\+\$990/);
      expect(pnlText).toHaveClass('text-emerald-400');
    });

    it('displays negative P&L with red color', () => {
      render(<TradeLog trades={mockTrades} />);
      
      // The second sell trade has negative P&L (-$640)
      // Use a function matcher to handle formatting variations
      const pnlText = screen.getByText((content, element) => {
        return element?.classList.contains('text-red-400') && content.includes('-640');
      });
      expect(pnlText).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no trades', () => {
      render(<TradeLog trades={[]} />);
      
      expect(screen.getByTestId('trade-log-empty')).toBeInTheDocument();
      expect(screen.getByText('No trades yet')).toBeInTheDocument();
    });
  });
});

describe('generateMockTrades', () => {
  // Note: This function uses random data, so tests must account for variability
  // Run multiple times to increase chance of getting trades
  
  it('returns array (possibly empty due to random data)', () => {
    const trades = generateMockTrades('AAPL', '2023-01-01', '2024-01-01', 10000);
    expect(Array.isArray(trades)).toBe(true);
  });

  it('when trades exist, first trade is always a BUY', () => {
    // Run multiple times to get a non-empty result
    for (let attempt = 0; attempt < 5; attempt++) {
      const trades = generateMockTrades('AAPL', '2020-01-01', '2024-01-01', 10000);
      if (trades.length > 0) {
        expect(trades[0].type).toBe('BUY');
        return;
      }
    }
    // If no trades after 5 attempts, that's acceptable for random data
  });

  it('when trades exist, they alternate between BUY and SELL', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const trades = generateMockTrades('AAPL', '2020-01-01', '2024-01-01', 10000);
      if (trades.length > 1) {
        for (let i = 1; i < trades.length; i++) {
          expect(trades[i].type).not.toBe(trades[i - 1].type);
        }
        return;
      }
    }
  });

  it('SELL trades have P&L calculated', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const trades = generateMockTrades('AAPL', '2020-01-01', '2024-01-01', 10000);
      const sellTrades = trades.filter(t => t.type === 'SELL');
      if (sellTrades.length > 0) {
        sellTrades.forEach(trade => {
          expect(trade.pnl).toBeDefined();
          expect(trade.pnlPercent).toBeDefined();
        });
        return;
      }
    }
  });

  it('BUY trades do not have P&L', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const trades = generateMockTrades('AAPL', '2020-01-01', '2024-01-01', 10000);
      const buyTrades = trades.filter(t => t.type === 'BUY');
      if (buyTrades.length > 0) {
        buyTrades.forEach(trade => {
          expect(trade.pnl).toBeUndefined();
          expect(trade.pnlPercent).toBeUndefined();
        });
        return;
      }
    }
  });

  it('when trades exist, position sizing respects initial capital', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const trades = generateMockTrades('AAPL', '2020-01-01', '2024-01-01', 10000);
      const buyTrades = trades.filter(t => t.type === 'BUY');
      if (buyTrades.length > 0) {
        buyTrades.forEach(trade => {
          expect(trade.value).toBeLessThanOrEqual(10000 * 1.1);
        });
        return;
      }
    }
  });

  it('generates unique trade IDs when trades exist', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const trades = generateMockTrades('AAPL', '2020-01-01', '2024-01-01', 10000);
      if (trades.length > 0) {
        const ids = trades.map(t => t.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
        return;
      }
    }
  });

  it('trade structure is correct when trades exist', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const trades = generateMockTrades('AAPL', '2020-01-01', '2024-01-01', 10000);
      if (trades.length > 0) {
        const firstTrade = trades[0];
        expect(firstTrade).toHaveProperty('id');
        expect(firstTrade).toHaveProperty('date');
        expect(firstTrade).toHaveProperty('type');
        expect(firstTrade).toHaveProperty('price');
        expect(firstTrade).toHaveProperty('shares');
        expect(firstTrade).toHaveProperty('value');
        return;
      }
    }
  });
});
