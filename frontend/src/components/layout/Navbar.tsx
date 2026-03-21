'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { BarChart3, LogOut, ChevronDown, LayoutDashboard, User, Rss, FileText, Shield, Menu, X } from 'lucide-react';
import NotificationBell from './NotificationBell';

const navLinks = [
  { href: '/playground', label: 'Playground' },
  { href: '/competitions', label: 'Competitions' },
  { href: '/community', label: 'Community' },
  { href: '/docs', label: 'Docs' },
  { href: '/blog', label: 'Blog' },
];

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left: logo + desktop nav */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2.5">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">Ceap Council</span>
            </Link>

            <div className="hidden md:flex ml-10 space-x-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  {link.label}
                </Link>
              ))}
              {isAuthenticated && (
                <Link
                  href="/feed"
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Feed
                </Link>
              )}
            </div>
          </div>

          {/* Right: auth + hamburger */}
          <div className="flex items-center space-x-2">
            {isAuthenticated ? (
              <>
                <NotificationBell />
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen((o) => !o)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {user?.username?.charAt(0).toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <span className="hidden sm:inline text-sm font-medium text-gray-700 max-w-[120px] truncate">
                      {user?.username ?? '...'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-1 w-48 py-1 bg-white rounded-lg border border-gray-200 shadow-lg">
                      <Link href="/dashboard" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <LayoutDashboard className="h-4 w-4" /> Account
                      </Link>
                      <Link href={user?.username ? `/profile/${user.username}` : '/profile'} onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <User className="h-4 w-4" /> My Profile
                      </Link>
                      <Link href="/feed" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <Rss className="h-4 w-4" /> My Feed
                      </Link>
                      <div className="border-t border-gray-100 my-1" />
                      <Link href="/terms" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
                        <FileText className="h-4 w-4" /> Terms
                      </Link>
                      <Link href="/privacy" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
                        <Shield className="h-4 w-4" /> Privacy
                      </Link>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { setDropdownOpen(false); logout(); router.push('/'); }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center space-x-2">
                <Link href="/terms" className="text-gray-400 hover:text-gray-600 px-2 py-2 text-xs transition">Terms</Link>
                <Link href="/privacy" className="text-gray-400 hover:text-gray-600 px-2 py-2 text-xs transition">Privacy</Link>
                <Link href="/login" className="text-gray-600 hover:text-gray-900 px-4 py-2 text-sm font-medium transition">Sign In</Link>
                <Link href="/register" className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm">
                  Get Started
                </Link>
              </div>
            )}

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {link.label}
            </Link>
          ))}
          {isAuthenticated && (
            <Link href="/feed" className="block px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Feed
            </Link>
          )}
          {!isAuthenticated && (
            <>
              <div className="border-t border-gray-100 my-2" />
              <Link href="/login" className="block px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                Sign In
              </Link>
              <Link href="/register" className="block px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition text-center">
                Get Started
              </Link>
              <div className="flex gap-4 px-4 pt-1">
                <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600">Terms</Link>
                <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600">Privacy</Link>
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
