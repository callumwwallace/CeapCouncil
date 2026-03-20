import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationBell from '@/components/layout/NotificationBell';
import type { GroupedNotifications } from '@/types';

const mockGetNotifications = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockClearAll = jest.fn();

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
    getUnreadNotificationCount: () => mockGetUnreadCount(),
    markNotificationRead: (id: number) => mockMarkRead(id),
    markAllNotificationsRead: () => mockMarkAllRead(),
    clearAllNotifications: () => mockClearAll(),
  },
}));

const mockUseAuthStore = jest.fn();
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

// Mock WebSocket
const mockWsSend = jest.fn();
const mockWsClose = jest.fn();
jest.spyOn(global, 'WebSocket').mockImplementation(() => ({
  send: mockWsSend,
  close: mockWsClose,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: WebSocket.OPEN,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as unknown as WebSocket));

jest.mock('lucide-react', () => ({
  Bell: () => <span data-testid="bell-icon" />,
  Trophy: () => <span data-testid="icon-trophy" />,
  MessageSquare: () => <span data-testid="icon-message" />,
  Code2: () => <span data-testid="icon-code" />,
  Megaphone: () => <span data-testid="icon-megaphone" />,
}));

const groupedNotifications: GroupedNotifications = {
  competition: [
    {
      id: 1,
      type: 'competition_rank',
      category: 'competition',
      message: 'Competition ended. You placed 1st!',
      link: '/competitions/1',
      actor_username: '',
      read_at: null,
      created_at: new Date().toISOString(),
      extra_data: { rank: 1 },
    },
  ],
  forum: [
    {
      id: 2,
      type: 'mention',
      category: 'forum',
      message: 'user2 mentioned you in a post',
      link: '/community/general/1',
      actor_username: 'user2',
      read_at: null,
      created_at: new Date().toISOString(),
    },
  ],
  strategy: [],
  system: [
    {
      id: 3,
      type: 'follow',
      category: 'system',
      message: 'user2 started following you',
      link: '/profile/user2',
      actor_username: 'user2',
      read_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
};

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      accessToken: 'fake-token',
    });
    mockGetUnreadCount.mockResolvedValue(2);
    mockGetNotifications.mockResolvedValue(groupedNotifications);
  });

  describe('when unauthenticated', () => {
    it('still renders the bell but does not connect WebSocket', () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: false,
        accessToken: null,
      });
      render(<NotificationBell />);
      expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
      // WebSocket is not created when unauthenticated
      expect(global.WebSocket).not.toHaveBeenCalled();
    });
  });

  describe('when authenticated', () => {
    it('renders the bell button', () => {
      render(<NotificationBell />);
      expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
      expect(screen.getByTitle('Notifications')).toBeInTheDocument();
    });

    it('fetches unread count on mount', async () => {
      render(<NotificationBell />);
      await waitFor(() => {
        expect(mockGetUnreadCount).toHaveBeenCalled();
      });
    });

    it('shows unread badge when count > 0', async () => {
      render(<NotificationBell />);
      await waitFor(() => {
        expect(mockGetUnreadCount).toHaveBeenCalled();
      });
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('does not show badge when count is 0', async () => {
      mockGetUnreadCount.mockResolvedValue(0);
      render(<NotificationBell />);
      await waitFor(() => {
        expect(mockGetUnreadCount).toHaveBeenCalled();
      });
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  describe('dropdown', () => {
    it('opens on bell click and fetches notifications', async () => {
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      await waitFor(() => {
        expect(mockGetNotifications).toHaveBeenCalledWith({
          limit: 20,
          group_by: 'category',
        });
      });

      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });

    it('displays grouped notifications by category', async () => {
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      await waitFor(() => {
        expect(mockGetNotifications).toHaveBeenCalled();
      });

      expect(screen.getByText('Competition updates')).toBeInTheDocument();
      expect(screen.getByText('Forum replies')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
      expect(screen.getByText('Competition ended. You placed 1st!')).toBeInTheDocument();
      expect(screen.getByText('user2 mentioned you in a post')).toBeInTheDocument();
      expect(screen.getByText('user2 started following you')).toBeInTheDocument();
    });

    it('shows loading state while fetching', async () => {
      mockGetNotifications.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(groupedNotifications), 100))
      );
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });

    it('shows no notifications when empty', async () => {
      mockGetNotifications.mockResolvedValue({
        competition: [],
        forum: [],
        strategy: [],
        system: [],
      });
      mockGetUnreadCount.mockResolvedValue(0);
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      await waitFor(() => {
        expect(mockGetNotifications).toHaveBeenCalled();
      });

      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('calls markAllRead when Mark all read is clicked', async () => {
      mockMarkAllRead.mockResolvedValue(undefined);
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      await waitFor(() => {
        expect(mockGetNotifications).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByText('Mark all read'));
      expect(mockMarkAllRead).toHaveBeenCalled();
    });

    it('calls clearAll when Clear all is clicked', async () => {
      mockClearAll.mockResolvedValue(undefined);
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      await waitFor(() => {
        expect(mockGetNotifications).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByText('Clear all'));
      expect(mockClearAll).toHaveBeenCalled();
    });

    it('calls markNotificationRead when a notification is clicked', async () => {
      mockMarkRead.mockResolvedValue(undefined);
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      await waitFor(() => {
        expect(mockGetNotifications).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByText('user2 mentioned you in a post'));
      expect(mockMarkRead).toHaveBeenCalledWith(2);
    });
  });

  describe('fallback for flat list response', () => {
    it('converts flat list to grouped when API returns array', async () => {
      mockGetNotifications.mockResolvedValue([
        {
          id: 10,
          type: 'mention',
          category: 'forum',
          message: 'Flat list item',
          link: '/test',
          actor_username: 'test',
          read_at: null,
          created_at: new Date().toISOString(),
        },
      ]);
      render(<NotificationBell />);
      fireEvent.click(screen.getByTitle('Notifications'));

      await waitFor(() => {
        expect(mockGetNotifications).toHaveBeenCalled();
      });

      expect(screen.getByText('Flat list item')).toBeInTheDocument();
      expect(screen.getByText('Forum replies')).toBeInTheDocument();
    });
  });
});
