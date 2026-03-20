import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import FeedPage from '@/app/feed/page';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getFeed: jest.fn(),
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}));

describe('FeedPage link sanitization', () => {
  it('sanitizes unsafe links to /', async () => {
    (api.getFeed as jest.Mock).mockResolvedValue([
      {
        type: 'strategy',
        id: 1,
        title: 'Test strategy',
        description: 'Desc',
        username: 'user1',
        link: 'javascript:alert(1)',
        created_at: new Date().toISOString(),
      },
    ]);
    render(<FeedPage />);
    const title = await screen.findByText('Test strategy', {}, { timeout: 3000 });
    const link = title.closest('a');
    expect(link?.getAttribute('href')).toBe('/');
  });

  it('allows safe relative links', async () => {
    (api.getFeed as jest.Mock).mockResolvedValue([
      {
        type: 'strategy',
        id: 1,
        title: 'Safe strategy',
        description: 'Desc',
        username: 'user1',
        link: '/strategies/123',
        created_at: new Date().toISOString(),
      },
    ]);
    render(<FeedPage />);
    const title = await screen.findByText('Safe strategy', {}, { timeout: 3000 });
    const link = title.closest('a');
    expect(link?.getAttribute('href')).toBe('/strategies/123');
  });
});
