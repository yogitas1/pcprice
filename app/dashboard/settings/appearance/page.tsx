'use client';

import { useTheme } from '@/components/ThemeProvider';

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-8 max-w-md">
      <h1 className="text-2xl font-bold text-white mb-1">Appearance</h1>
      <p className="text-zinc-400 text-sm mb-8">Choose how PCPrice looks to you.</p>

      <div className="space-y-3">
        {([
          { value: 'dark',  label: 'Dark',  desc: 'Dark backgrounds — easier on the eyes at night.' },
          { value: 'light', label: 'Light', desc: 'Light backgrounds — better in bright environments.' },
        ] as const).map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
              theme === value
                ? 'border-violet-600 bg-violet-600/10'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
            }`}
          >
            <div className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-lg ${
              value === 'dark' ? 'bg-zinc-950 border border-zinc-700' : 'bg-white border border-zinc-300'
            }`}>
              {value === 'dark' ? '🌙' : '☀️'}
            </div>
            <div>
              <p className={`font-medium text-sm ${theme === value ? 'text-violet-300' : 'text-white'}`}>{label}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{desc}</p>
            </div>
            {theme === value && (
              <span className="ml-auto text-violet-400 text-sm shrink-0">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
