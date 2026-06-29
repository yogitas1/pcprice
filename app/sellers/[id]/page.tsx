'use client';

import { useState, useEffect } from 'react';
import { butterbase } from '@/lib/butterbase';

const TIER_META: Record<string, { label: string; color: string; bg: string; border: string; fill: string }> = {
  new: { label: 'New', color: 'text-zinc-400', bg: 'bg-zinc-800', border: 'border-zinc-700', fill: 'bg-zinc-400' },
  verified: { label: 'Verified', color: 'text-blue-400', bg: 'bg-blue-900/30', border: 'border-blue-800', fill: 'bg-blue-400' },
  trusted: { label: 'Trusted', color: 'text-violet-400', bg: 'bg-violet-900/30', border: 'border-violet-800', fill: 'bg-violet-400' },
  power_seller: { label: 'Power Seller', color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-800', fill: 'bg-amber-400' },
};

function ScoreBar({ score, tier }: { score: number; tier: string }) {
  const meta = TIER_META[tier] ?? TIER_META.new;
  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${meta.fill}`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
        <div className="absolute top-0 bottom-0 border-l border-zinc-700/70" style={{ left: '31%' }} />
        <div className="absolute top-0 bottom-0 border-l border-zinc-700/70" style={{ left: '56%' }} />
        <div className="absolute top-0 bottom-0 border-l border-zinc-700/70" style={{ left: '80%' }} />
      </div>
      <div className="flex text-xs text-zinc-700">
        <span style={{ width: '32%' }}>New</span>
        <span style={{ width: '25%' }}>Verified</span>
        <span style={{ width: '24%' }}>Trusted</span>
        <span className="flex-1 text-right">Power Seller</span>
      </div>
    </div>
  );
}

function formatMemberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

type Props = { params: { id: string } };

export default function SellerProfilePage({ params }: Props) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const [spRes, upRes] = await Promise.all([
        (butterbase as any)
          .from('seller_profiles')
          .select('score, tier, sales_count, external_accounts, created_at')
          .eq('user_id', params.id)
          .maybeSingle(),
        (butterbase as any)
          .from('user_profiles')
          .select('display_name, avatar_url, created_at')
          .eq('user_id', params.id)
          .maybeSingle(),
      ]);
      if (!upRes.data && !spRes.data) {
        setNotFound(true);
      } else {
        setSellerProfile(spRes.data);
        setUserProfile(upRes.data);
      }
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="h-20 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
          <div className="h-40 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 text-lg font-semibold mb-2">Seller not found</p>
          <p className="text-zinc-600 text-sm">This profile may not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const tier = sellerProfile?.tier ?? 'new';
  const score = parseFloat(sellerProfile?.score ?? '0');
  const meta = TIER_META[tier] ?? TIER_META.new;
  const salesCount = sellerProfile?.sales_count ?? 0;
  const memberSince = userProfile?.created_at ? formatMemberSince(userProfile.created_at) : null;
  const displayName = userProfile?.display_name ?? 'PCPrice Seller';
  const ebayLinked = sellerProfile?.external_accounts?.ebay;

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-400 shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{displayName}</h1>
              {memberSince && (
                <p className="text-zinc-500 text-sm mt-0.5">Member since {memberSince}</p>
              )}
            </div>
            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${meta.bg} ${meta.border} ${meta.color}`}>
              {meta.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5 text-center">
            <div className="rounded-lg bg-zinc-800 p-3">
              <p className="text-xl font-bold text-white">{salesCount}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Completed sales</p>
            </div>
            <div className="rounded-lg bg-zinc-800 p-3">
              <p className="text-sm font-semibold text-white mt-0.5">{meta.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Seller tier</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-zinc-500 font-medium mb-2">Reputation</p>
            <ScoreBar score={score} tier={tier} />
          </div>
        </div>

        {/* Linked platforms */}
        {ebayLinked && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">Verified external accounts</h2>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-[#e53238] flex items-center justify-center text-white text-xs font-bold shrink-0">e</div>
              <div>
                <p className="text-white text-sm font-medium">eBay — @{ebayLinked.username}</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {ebayLinked.feedback_score} feedback &middot; {Number(ebayLinked.positive_pct).toFixed(1)}% positive
                  {ebayLinked.member_since && ` · member since ${new Date(ebayLinked.member_since).getFullYear()}`}
                </p>
              </div>
              <span className="ml-auto text-xs text-green-400 font-medium">✓ Verified</span>
            </div>
          </div>
        )}

        {/* Trust & safety */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-400 mb-2">Trust & Safety</h2>
          <p className="text-xs text-zinc-600 leading-relaxed">
            All sellers on PCPrice have passed identity verification. Items are graded and authenticated
            before listing. Transactions are held in escrow until delivery is confirmed.
          </p>
        </div>
      </div>
    </div>
  );
}
