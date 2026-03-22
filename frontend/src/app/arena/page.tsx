'use client';

import Link from 'next/link';
import { Construction, ArrowLeft } from 'lucide-react';

export default function ArenaPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-600 mb-6">
          <Construction className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Arena</h1>
        <p className="text-amber-600 font-medium mb-1 flex items-center justify-center gap-2">
          <Construction className="h-4 w-4" />
          In development
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Arena will be your paper trading hub — deploy strategies with live data, monitor P&L, positions, and order flow in real time. Coming soon.
        </p>
        <Link
          href="/playground"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Playground
        </Link>
      </div>
    </div>
  );
}
