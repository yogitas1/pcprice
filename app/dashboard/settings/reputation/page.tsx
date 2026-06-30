'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { butterbase, getSession } from '@/lib/butterbase';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

const TIER_META: Record<string, { label: string; color: string; bg: string; border: string; fill: string }> = {
  new: { label: 'New', color: 'text-zinc-400', bg: 'bg-zinc-800', border: 'border-zinc-700', fill: 'bg-zinc-400' },
  verified: { label: 'Verified', color: 'text-blue-400', bg: 'bg-blue-900/30', border: 'border-blue-800', fill: 'bg-blue-400' },
  trusted: { label: 'Trusted', color: 'text-violet-400', bg: 'bg-violet-900/30', border: 'border-violet-800', fill: 'bg-violet-400' },
  power_seller: { label: 'Power Seller', color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-800', fill: 'bg-amber-400' },
};

function getToken(): string | null {
  return getSession()?.accessToken ?? null;
}

function ScoreBar({ score, tier }: { score: number; tier: string }) {
  const meta = TIER_META[tier] ?? TIER_META.new;
  return (
    <div className="space-y-1.5">
      <div className="relative h-3 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${meta.fill}`}
             style={{ width: `${Math.max(2, score)}%` }} />
        <div className="absolute top-0 bottom-0 border-l border-zinc-600/50" style={{ left: '31%' }} />
        <div className="absolute top-0 bottom-0 border-l border-zinc-600/50" style={{ left: '56%' }} />
        <div className="absolute top-0 bottom-0 border-l border-zinc-600/50" style={{ left: '80%' }} />
      </div>
      <div className="flex text-xs text-zinc-600">
        <span style={{ width: '32%' }}>New</span>
        <span style={{ width: '25%' }}>Verified</span>
        <span style={{ width: '24%' }}>Trusted</span>
        <span className="flex-1 text-right">Power Seller</span>
      </div>
    </div>
  );
}

export default function ReputationPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [ebayInput, setEbayInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchProfile = async () => {
    const session = getSession();
    const userId = session?.user?.id ?? null;
    if (!userId) { setLoading(false); return; }
    const { data } = await (butterbase as any)
      .from('seller_profiles')
      .select('score, tier, sales_count, external_accounts')
      .eq('user_id', userId)
      .maybeSingle();
    setProfile(data);
    setLoading(false);
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleLinkEbay = async () => {
    const trimmed = ebayInput.trim();
    if (!trimmed) return;
    setLinking(true);
    setLinkResult(null);
    const token = await getToken();
    try {
      const res = await fetch(`${BB_BASE}/import-ebay-reputation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ebay_username: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const pts = data.score_added > 0 ? ` +${data.score_added} pts added.` : '';
        setLinkResult({
          success: true,
          message: `Linked @${data.ebay_username} — ${data.feedback_score} feedback, ${Number(data.positive_pct).toFixed(1)}% positive.${pts}`,
        });
        await fetchProfile();
        setEbayInput('');
      } else {
        setLinkResult({ success: false, message: data.error ?? 'Failed to link account.' });
      }
    } catch {
      setLinkResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setLinking(false);
    }
  };

  const tier = profile?.tier ?? 'new';
  const score = parseFloat(profile?.score ?? '0');
  const meta = TIER_META[tier] ?? TIER_META.new;
  const ebayLinked = profile?.external_accounts?.ebay;

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-6">
        <Link href="/dashboard/settings" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Settings
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-1">Seller Reputation</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Link external accounts to boost your starting credibility score.
      </p>

      {/* Current standing */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 mb-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-400">Current tier</p>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        {loading ? (
          <div className="h-3 bg-zinc-800 rounded-full animate-pulse" />
        ) : (
          <ScoreBar score={score} tier={tier} />
        )}
        <p className="text-xs text-zinc-600">
          Your raw score is private — buyers only see your tier badge.
        </p>
      </div>

      {/* Link external accounts */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-5">
        <div>
          <h2 className="text-white font-semibold text-sm mb-1.5">Link external accounts</h2>
          <p className="text-zinc-500 text-xs leading-relaxed">
            External reputation contributes up to 30% of your starting score (max 8 pts).
            Linking a strong eBay account adds points but can never grant Verified tier outright.
          </p>
        </div>

        {/* eBay section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#e53238] flex items-center justify-center text-white text-[10px] font-bold shrink-0">e</div>
            <span className="text-sm font-medium text-white">eBay</span>
            {ebayLinked && (
              <span className="ml-auto text-xs text-green-400 font-medium">
                ✓ @{ebayLinked.username} &middot; {ebayLinked.feedback_score} feedback
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={ebayInput}
              onChange={(e) => setEbayInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !linking && handleLinkEbay()}
              placeholder={ebayLinked ? `Update (@${ebayLinked.username})` : 'eBay username'}
              className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 placeholder-zinc-600 focus:outline-none focus:border-violet-600 transition-colors"
            />
            <button
              onClick={handleLinkEbay}
              disabled={linking || !ebayInput.trim()}
              className="rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap"
            >
              {linking ? 'Linking…' : ebayLinked ? 'Update' : 'Link account'}
            </button>
          </div>

          {linkResult && (
            <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
              linkResult.success
                ? 'bg-green-900/20 border border-green-800 text-green-400'
                : 'bg-red-900/20 border border-red-800 text-red-400'
            }`}>
              {linkResult.message}
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-700 border-t border-zinc-800 pt-4">
          More platform integrations (COMC, Whatnot, StockX) coming soon.
        </p>
      </div>
    </div>
  );
}
