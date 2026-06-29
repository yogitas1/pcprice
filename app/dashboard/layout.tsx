'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';
import { clearAuthCookie } from '@/lib/auth-cookies';

const NAV_ITEMS = [
  { label: 'Inventory',   href: '/dashboard/inventory',  icon: '📦' },
  { label: 'Market',      href: '/dashboard/market',     icon: '📈' },
  { label: 'Buy Orders',  href: '/dashboard/buy-orders', icon: '🛒' },
  { label: 'Wallet',      href: '/dashboard/wallet',     icon: '💳' },
  { label: 'Settings',    href: '/dashboard/settings',   icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await butterbase.auth.signOut();
    clearAuthCookie();
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="px-5 py-5 border-b border-zinc-800">
          <span className="text-lg font-bold tracking-tight text-violet-400">PCPrice</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ label, href, icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-violet-600/20 text-violet-300'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-zinc-800">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <span className="text-base">↩</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
