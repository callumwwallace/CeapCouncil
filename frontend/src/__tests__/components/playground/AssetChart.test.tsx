import { render, screen } from '@testing-library/react';
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

    it('renders chart controls toolbar', () => {
      render(<AssetChart {...defaultProps} />);
      expect(screen.getByTestId('chart-controls')).toBeInTheDocument();
    });
  });
});
