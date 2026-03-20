'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Bell, Trophy, MessageSquare, Code2, Megaphone } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { NotificationResponse, GroupedNotifications, NotificationCategory } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const WS_BASE = API_BASE.replace(/\/api\/v1\/?$/, '') || 'http://localhost:8000';
const WS_URL = (WS_BASE.startsWith('https') ? 'wss:' : 'ws:') + WS_BASE.slice(WS_BASE.indexOf('://'));

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  competition: 'Competition updates',
  forum: 'Forum replies',
  strategy: 'Strategy comments',
  system: 'System',
};

const CATEGORY_ICONS: Record<NotificationCategory, typeof Trophy> = {
  competition: Trophy,
  forum: MessageSquare,
  strategy: Code2,
  system: Megaphone,
};

function formatNotificationTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function NotificationItem({
  n,
  onMarkRead,
  onClose,
}: {
  n: NotificationResponse;
  onMarkRead: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <Link
      href={n.link}
      onClick={() => {
        if (!n.read_at) onMarkRead(n.id);
        onClose();
      }}
      className={`block px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 ${
        !n.read_at ? 'bg-emerald-50/50' : ''
      }`}
    >
      <p className="text-sm text-gray-900 line-clamp-2">{n.message}</p>
      <p className="text-xs text-gray-500 mt-1">
        {n.actor_username ? `${n.actor_username} · ` : ''}
        {formatNotificationTime(n.created_at)}
      </p>
    </Link>
  );
}

export default function NotificationBell() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const [grouped, setGrouped] = useState<GroupedNotifications | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<NotificationCategory | 'all'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUnreadCount = () => {
    api.getUnreadNotificationCount().then(setUnreadCount).catch(() => {});
  };

  const fetchNotifications = () => {
    setLoading(true);
    api
      .getNotifications({ limit: 20, group_by: 'category' })
      .then((data) => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setGrouped(data as GroupedNotifications);
        } else {
          // Fallback: convert flat list to grouped
          const flat = data as NotificationResponse[];
          const g: GroupedNotifications = {
            competition: [],
            forum: [],
            strategy: [],
            system: [],
          };
          for (const n of flat) {
            const cat = (n.category || 'system') as NotificationCategory;
            if (g[cat]) g[cat].push(n);
            else g.system.push(n);
          }
          setGrouped(g);
        }
      })
      .catch(() => {
        setGrouped({ competition: [], forum: [], strategy: [], system: [] });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUnreadCount();
  }, []);

  // Real-time WebSocket for notifications
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    let delay = 1000;
    const maxDelay = 30000;

    const connect = () => {
      try {
        const ws = new WebSocket(`${WS_URL}/ws/notifications`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(`Bearer ${accessToken}`);
        };

        ws.onmessage = (event) => {
          if (event.data === 'pong') return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'notification' && data.id != null) {
              const id = Number(data.id);
              if (Number.isNaN(id)) return;
              const n: NotificationResponse = {
                id,
                type: data.notification_type || data.type,
                category: data.category || 'system',
                message: data.message ?? '',
                link: data.link ?? '/',
                actor_username: data.actor_username || '',
                read_at: null,
                created_at: data.created_at ?? new Date().toISOString(),
                extra_data: data.extra_data,
              };
              setGrouped((prev) => {
                const next = { ...(prev || { competition: [], forum: [], strategy: [], system: [] }) };
                const cat = (n.category || 'system') as NotificationCategory;
                const list = next[cat] || next.system;
                const exists = list.some((x) => x.id === n.id);
                if (exists) return prev ?? next;
                if (next[cat]) next[cat] = [n, ...next[cat]];
                else next.system = [n, ...(next.system || [])];
                setUnreadCount((c) => c + 1);
                return next;
              });
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
            delay = Math.min(delay * 1.5, maxDelay);
          }, delay);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    if (open) {
      fetchNotifications();
      fetchUnreadCount();
    } else {
      setExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: number) => {
    const prevGrouped = grouped;
    setGrouped((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const cat of Object.keys(next) as NotificationCategory[]) {
        next[cat] = next[cat].map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        );
      }
      return next;
    });
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markNotificationRead(id);
    } catch {
      if (prevGrouped) setGrouped(prevGrouped);
      setUnreadCount((c) => c + 1);
    }
  };

  const markAllRead = async () => {
    const prevGrouped = grouped;
    setGrouped((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const ts = new Date().toISOString();
      for (const cat of Object.keys(next) as NotificationCategory[]) {
        next[cat] = next[cat].map((n) => ({ ...n, read_at: ts }));
      }
      return next;
    });
    const prevCount = unreadCount;
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      if (prevGrouped) setGrouped(prevGrouped);
      setUnreadCount(prevCount);
    }
  };

  const clearAll = async () => {
    const prevGrouped = grouped;
    const prevCount = unreadCount;
    setGrouped({ competition: [], forum: [], strategy: [], system: [] });
    setUnreadCount(0);
    try {
      await api.clearAllNotifications();
    } catch {
      if (prevGrouped) setGrouped(prevGrouped);
      setUnreadCount(prevCount);
    }
  };

  const totalCount = grouped
    ? (Object.values(grouped) as NotificationResponse[][]).reduce((a, arr) => a + arr.length, 0)
    : 0;

  const categoriesToShow: NotificationCategory[] = ['competition', 'forum', 'strategy', 'system'];
  const filteredGroups = grouped
    ? categoriesToShow
        .map((cat) => ({ category: cat, items: grouped[cat] || [] }))
        .filter(
          ({ category, items }) =>
            filter === 'all' ? items.length > 0 : category === filter && items.length > 0
        )
    : [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
        title="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden z-50 transition-all ${
            expanded ? 'w-96 max-h-[480px]' : 'w-80 max-h-96'
          }`}
        >
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
            <span className="font-semibold text-gray-900">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-sm text-emerald-600 hover:text-emerald-700"
                >
                  Mark all read
                </button>
              )}
              {totalCount > 0 && (
                <button onClick={clearAll} className="text-sm text-gray-500 hover:text-red-600">
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          {totalCount > 0 && (
            <div className="flex border-b border-gray-100 overflow-x-auto">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-2 text-xs font-medium shrink-0 ${
                  filter === 'all' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500'
                }`}
              >
                All
              </button>
              {categoriesToShow.map((cat) => {
                const count = (grouped?.[cat]?.length ?? 0);
                if (count === 0) return null;
                const Icon = CATEGORY_ICONS[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setFilter(cat)}
                    className={`px-3 py-2 text-xs font-medium shrink-0 flex items-center gap-1 ${
                      filter === cat ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500'
                    }`}
                    title={CATEGORY_LABELS[cat]}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cat.slice(0, 4)}
                  </button>
                );
              })}
            </div>
          )}

          <div
            className={`overflow-y-auto overscroll-contain ${
              expanded ? 'max-h-[300px]' : 'max-h-60'
            }`}
          >
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No notifications</div>
            ) : (
              filteredGroups.map(({ category, items }) => {
                const Icon = CATEGORY_ICONS[category];
                return (
                  <div key={category} className="border-b border-gray-100 last:border-0">
                    <div className="px-4 py-2 bg-gray-50 flex items-center gap-2 text-xs font-medium text-gray-600 sticky top-0">
                      <Icon className="h-3.5 w-3.5" />
                      {CATEGORY_LABELS[category]}
                    </div>
                    {items.map((n) => (
                      <NotificationItem
                        key={n.id}
                        n={n}
                        onMarkRead={markAsRead}
                        onClose={() => setOpen(false)}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="w-full px-4 py-2.5 text-center text-sm text-emerald-600 hover:bg-gray-50 border-t border-gray-200 font-medium"
            >
              {expanded ? 'Show less' : 'View all'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
