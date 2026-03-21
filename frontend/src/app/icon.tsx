import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#059669',
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Bar chart bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, paddingBottom: 2 }}>
          <div style={{ width: 4, height: 10, background: 'white', borderRadius: 1 }} />
          <div style={{ width: 4, height: 16, background: 'white', borderRadius: 1 }} />
          <div style={{ width: 4, height: 8, background: 'white', borderRadius: 1 }} />
          <div style={{ width: 4, height: 13, background: 'white', borderRadius: 1 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
