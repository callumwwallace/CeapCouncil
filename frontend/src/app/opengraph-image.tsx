import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Ceap Council — Backtest Trading Strategies & Compete';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f0fdf4 100%)',
          padding: '80px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: '#059669',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: 5,
              paddingBottom: 12,
            }}
          >
            <div style={{ width: 10, height: 20, background: '#fff', borderRadius: 3 }} />
            <div style={{ width: 10, height: 32, background: '#fff', borderRadius: 3 }} />
            <div style={{ width: 10, height: 24, background: '#fff', borderRadius: 3 }} />
          </div>
          <span style={{ marginLeft: 20, fontSize: 36, fontWeight: 700, color: '#111827' }}>
            Ceap Council
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.1,
            marginBottom: 28,
            maxWidth: 900,
          }}
        >
          Backtest trading strategies.{' '}
          <span style={{ color: '#059669' }}>Compete.</span>
        </div>

        {/* Sub */}
        <div style={{ fontSize: 28, color: '#475569', maxWidth: 800, lineHeight: 1.4 }}>
          Write Python strategies, run backtests on real market data, and rank on the leaderboard.
        </div>

        {/* URL badge */}
        <div
          style={{
            marginTop: 60,
            padding: '10px 24px',
            background: '#059669',
            borderRadius: 8,
            color: '#fff',
            fontSize: 22,
            fontWeight: 600,
          }}
        >
          ceapcouncil.com
        </div>
      </div>
    ),
    { ...size },
  );
}
