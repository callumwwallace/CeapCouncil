'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { NotificationResponse } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const WS_BASE = API_BASE.replace(/\/api\/v1\/?$/, '') || 'http://localhost:8000';
const WS_URL = (WS_BASE.startsWith('https') ? 'wss:' : 'ws:') + WS_BASE.slice(WS_BASE.indexOf('://'));

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

export default function NotificationBell() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUnreadCount = () => {
    api.getUnreadNotificationCount().then(setUnreadCount).catch(() => {});
  };

  const fetchNotifications = () => {
    setLoading(true);
    api.getNotifications({ limit: 15 }).then(setNotifications).catch(() => {}).finally(() => setLoading(false));
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
            if (data.type === 'notification') {
              setUnreadCount((c) => c + 1);
              setNotifications((prev) => [
                {
                  id: data.id,
                  type: data.type,
                  message: data.message,
                  link: data.link,
                  actor_username: data.actor_username,
                  read_at: null,
                  created_at: data.created_at,
                },
                ...prev,
              ]);
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
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
    setUnreadCount(0);
  };

  const clearAll = async () => {
    await api.clearAllNotifications();
    setNotifications([]);
    setUnreadCount(0);
  };

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
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div
            className={`overflow-y-auto overscroll-contain ${
              expanded ? 'max-h-[340px]' : 'max-h-60'
            }`}
          >
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No notifications</div>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => {
                    if (!n.read_at) markAsRead(n.id);
                    setOpen(false);
                  }}
                  className={`block px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 ${
                    !n.read_at ? 'bg-emerald-50/50' : ''
                  }`}
                >
                  <p className="text-sm text-gray-900 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {n.actor_username} · {formatNotificationTime(n.created_at)}
                  </p>
                </Link>
              ))
            )}
          </div>
          {notifications.length > 0 && (
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
