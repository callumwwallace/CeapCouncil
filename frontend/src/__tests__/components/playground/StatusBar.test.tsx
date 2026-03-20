import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StatusBar from '@/components/playground/StatusBar';

jest.mock('lucide-react', () => ({
  Download: () => <span data-testid="icon-download" />,
  Keyboard: () => <span data-testid="icon-keyboard" />,
  Clock: () => <span data-testid="icon-clock" />,
  ChevronDown: () => <span data-testid="icon-chevron" />,
  ZoomIn: () => <span data-testid="icon-zoom-in" />,
  ZoomOut: () => <span data-testid="icon-zoom-out" />,
}));

describe('StatusBar', () => {
  it('displays keyboard shortcuts hint', () => {
    render(
      <StatusBar isRunning={false} results={null} />
    );
    expect(screen.getByText(/Ctrl\+↵ Run · Ctrl\+S Save · Ctrl\+⇧E Export/)).toBeInTheDocument();
  });

  it('shows Ready when no results', () => {
    render(<StatusBar isRunning={false} results={null} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows Complete when results exist', () => {
    render(
      <StatusBar
        isRunning={false}
        results={{
          total_return: 10,
          sharpe_ratio: 1.2,
          max_drawdown: -5,
          total_trades: 50,
        }}
      />
    );
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('shows Running when backtest in progress', () => {
    render(<StatusBar isRunning={true} results={null} />);
    expect(screen.getByText('Running...')).toBeInTheDocument();
  });
});
