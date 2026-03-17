import { render, screen, fireEvent } from '@testing-library/react';
import AssetChart from '@/components/playground/AssetChart';

// Mock Recharts to avoid complex SVG rendering issues
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ReferenceLine: () => <div data-testid="reference-line" />,
  ReferenceDot: () => <div data-testid="reference-dot" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Brush: () => <div data-testid="brush" />,
  usePlotArea: () => ({ x: 0, y: 0, width: 800, height: 400 }),
  useYAxisDomain: () => [100, 200],
}));

describe('AssetChart', () => {
  const defaultProps = {
    symbol: 'AAPL',
    startDate: '2023-01-01',
    endDate: '2024-01-01',
  };

  describe('rendering', () => {
    it('renders the chart component', () => {
      render(<AssetChart {...defaultProps} />);
      expect(screen.getByTestId('asset-chart')).toBeInTheDocument();
    });

    it('renders indicator toggles', () => {
      render(<AssetChart {...defaultProps} />);
      expect(screen.getByTestId('indicator-toggles')).toBeInTheDocument();
      expect(screen.getByTestId('indicator-ma20')).toBeInTheDocument();
      expect(screen.getByTestId('indicator-ma50')).toBeInTheDocument();
    });
  });

  describe('indicator toggles', () => {
    it('indicators are off by default', () => {
      render(<AssetChart {...defaultProps} />);
      const ma20Button = screen.getByTestId('indicator-ma20');
      const ma50Button = screen.getByTestId('indicator-ma50');

      expect(ma20Button.className).not.toContain('bg-blue-500');
      expect(ma50Button.className).not.toContain('bg-orange-500');
    });

    it('toggles MA20 indicator on click', () => {
      render(<AssetChart {...defaultProps} />);
      const ma20Button = screen.getByTestId('indicator-ma20');

      fireEvent.click(ma20Button);

      expect(ma20Button.className).toContain('bg-blue-500');
    });

    it('toggles MA50 indicator on click', () => {
      render(<AssetChart {...defaultProps} />);
      const ma50Button = screen.getByTestId('indicator-ma50');

      fireEvent.click(ma50Button);

      expect(ma50Button.className).toContain('bg-orange-500');
    });

    it('calls onIndicatorsChange when controlled', () => {
      const onIndicatorsChange = jest.fn();
      render(
        <AssetChart
          {...defaultProps}
          showIndicators={{ ma20: false, ma50: false }}
          onIndicatorsChange={onIndicatorsChange}
        />
      );

      fireEvent.click(screen.getByTestId('indicator-ma20'));

      expect(onIndicatorsChange).toHaveBeenCalledWith({ ma20: true, ma50: false });
    });
  });
});
