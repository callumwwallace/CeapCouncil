import { render, screen, fireEvent } from '@testing-library/react';
import AssetChart, { generatePriceData } from '@/components/playground/AssetChart';

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

      expect(ma20Button.className).not.toContain('bg-blue-900');
      expect(ma50Button.className).not.toContain('bg-orange-900');
    });

    it('toggles MA20 indicator on click', () => {
      render(<AssetChart {...defaultProps} />);
      const ma20Button = screen.getByTestId('indicator-ma20');

      fireEvent.click(ma20Button);

      expect(ma20Button.className).toContain('bg-blue-900');
    });

    it('toggles MA50 indicator on click', () => {
      render(<AssetChart {...defaultProps} />);
      const ma50Button = screen.getByTestId('indicator-ma50');

      fireEvent.click(ma50Button);

      expect(ma50Button.className).toContain('bg-orange-900');
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

describe('generatePriceData', () => {
  it('generates price data with correct structure', () => {
    const data = generatePriceData('AAPL', '2023-01-01', '2023-01-31');

    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('date');
    expect(data[0]).toHaveProperty('open');
    expect(data[0]).toHaveProperty('high');
    expect(data[0]).toHaveProperty('low');
    expect(data[0]).toHaveProperty('close');
    expect(data[0]).toHaveProperty('volume');
    expect(data[0]).toHaveProperty('return');
  });

  it('generates different base prices for different symbols', () => {
    const aaplData = generatePriceData('AAPL', '2023-01-01', '2023-01-10');
    const btcData = generatePriceData('BTC-USD', '2023-01-01', '2023-01-10');

    expect(aaplData[0].close).toBeLessThan(500);
    expect(btcData[0].close).toBeGreaterThan(10000);
  });

  it('calculates MA20 after 20 data points', () => {
    const data = generatePriceData('AAPL', '2023-01-01', '2023-06-01');
    const withMa20 = data.find(d => d.ma20 !== undefined);
    expect(withMa20).toBeDefined();
    expect(typeof withMa20?.ma20).toBe('number');
  });

  it('calculates MA50 after 50 data points', () => {
    const data = generatePriceData('AAPL', '2023-01-01', '2023-06-01');
    const withMa50 = data.find(d => d.ma50 !== undefined);
    expect(withMa50).toBeDefined();
    expect(typeof withMa50?.ma50).toBe('number');
  });

  it('high is always >= close and low is always <= close', () => {
    const data = generatePriceData('AAPL', '2023-01-01', '2023-03-01');
    data.forEach(point => {
      expect(point.high).toBeGreaterThanOrEqual(point.close);
      expect(point.low).toBeLessThanOrEqual(point.close);
    });
  });

  it('volume is always positive', () => {
    const data = generatePriceData('AAPL', '2023-01-01', '2023-03-01');
    data.forEach(point => {
      expect(point.volume).toBeGreaterThan(0);
    });
  });

  it('samples down large date ranges', () => {
    const data = generatePriceData('AAPL', '2020-01-01', '2024-01-01');
    expect(data.length).toBeLessThanOrEqual(750);
    expect(data.length).toBeGreaterThan(50);
  });
});
