import Link from 'next/link';

const SETTINGS_SECTIONS = [
  {
    href: '/dashboard/settings/appearance',
    icon: '🎨',
    title: 'Appearance',
    description: 'Switch between dark and light mode.',
  },
  {
    href: '/dashboard/settings/payouts',
    icon: '💳',
    title: 'Payout Settings',
    description: 'Connect your bank account via Stripe to receive payouts when items sell.',
  },
  {
    href: '/dashboard/settings/reputation',
    icon: '⭐',
    title: 'Seller Reputation',
    description: 'Link external accounts (eBay) to boost your credibility score and seller tier.',
  },
];

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      <p className="text-zinc-400 text-sm mb-8">Manage your account preferences.</p>

      <div className="space-y-3 max-w-md">
        {SETTINGS_SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-start gap-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 p-4 transition-colors group"
          >
            <span className="text-2xl shrink-0">{s.icon}</span>
            <div>
              <p className="text-white font-medium text-sm group-hover:text-violet-300 transition-colors">{s.title}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{s.description}</p>
            </div>
            <span className="ml-auto text-zinc-600 group-hover:text-zinc-400 text-sm transition-colors shrink-0">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
