'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { butterbase, getSession } from '@/lib/butterbase';

type BuyerTxn = {
  id: string;
  sale_price: number;
  escrow_status: string;
  created_at: string;
};

type EscrowTxn = {
  id: string;
  sale_price: number;
  application_fee: number;
  escrow_status: string;
  auto_release_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

type ReleasedTxn = {
  id: string;
  sale_price: number;
  application_fee: number;
  escrow_status: string;
  confirmed_at: string | null;
  created_at: string;
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EscrowCard({ txn }: { txn: EscrowTxn }) {
  const payout = txn.sale_price - txn.application_fee;
  const autoRelease = txn.auto_release_at ? new Date(txn.auto_release_at) : null;
  const now = Date.now();
  const msLeft = autoRelease ? autoRelease.getTime() - now : null;
  const daysLeft = msLeft != null ? Math.max(0, Math.ceil(msLeft / 86400000)) : null;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-white font-medium truncate">
          Sale #{txn.id.slice(0, 8)}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {txn.escrow_status === 'awaiting_confirmation'
            ? daysLeft != null
              ? `Auto-releases in ${daysLeft}d — confirm receipt to release now`
              : 'Awaiting buyer confirmation'
            : 'Held in escrow — awaiting delivery'}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-white font-semibold">{fmt(payout)}</p>
        <p className="text-xs text-zinc-500">after 8% fee</p>
      </div>
    </div>
  );
}

function ReleasedCard({ txn }: { txn: ReleasedTxn }) {
  const payout = txn.sale_price - txn.application_fee;
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-white font-medium truncate">
          Sale #{txn.id.slice(0, 8)}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {txn.escrow_status === 'auto_released' ? 'Auto-released' : 'Confirmed'} · {fmtDate(txn.confirmed_at ?? txn.created_at)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-emerald-400 font-semibold">{fmt(payout)}</p>
        <p className="text-xs text-zinc-500">paid out</p>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const router = useRouter();
  const [escrow, setEscrow] = useState<EscrowTxn[]>([]);
  const [released, setReleased] = useState<ReleasedTxn[]>([]);
  const [buyerTxns, setBuyerTxns] = useState<BuyerTxn[]>([]);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const session = getSession();
    const userId = session?.user?.id ?? null;
    if (!userId) return; // Wait for session — redirect handled by mount effect

    const [escrowRes, releasedRes, profileRes, buyerRes] = await Promise.all([
      butterbase
        .from('transactions')
        .select('id, sale_price, application_fee, escrow_status, auto_release_at, confirmed_at, created_at')
        .eq('seller_id', userId)
        .in('escrow_status', ['held', 'awaiting_confirmation'])
        .order('created_at', { ascending: false }),
      butterbase
        .from('transactions')
        .select('id, sale_price, application_fee, escrow_status, confirmed_at, created_at')
        .eq('seller_id', userId)
        .in('escrow_status', ['released', 'auto_released'])
        .order('created_at', { ascending: false })
        .limit(20),
      butterbase
        .from('seller_profiles')
        .select('stripe_account_id')
        .eq('user_id', userId)
        .limit(1),
      butterbase
        .from('transactions')
        .select('id, sale_price, escrow_status, created_at')
        .eq('buyer_id', userId)
        .in('escrow_status', ['held', 'awaiting_confirmation', 'released', 'auto_released']),
    ]);

    setEscrow((escrowRes.data as EscrowTxn[]) ?? []);
    setReleased((releasedRes.data as ReleasedTxn[]) ?? []);
    setBuyerTxns((buyerRes.data as BuyerTxn[]) ?? []);
    const profile = (profileRes.data as any[])?.[0];
    setStripeConnected(!!profile?.stripe_account_id);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    // Try immediately — works when navigating within the app (session in memory)
    if (getSession()?.user?.id) { fetchAll(); return; }
    // On page refresh the session loads async from localStorage; wait for it
    const { unsubscribe } = butterbase.onAuthStateChange(() => { fetchAll(); });
    // Hard redirect after 5 s if cookie is also missing (not logged in)
    const timeout = setTimeout(() => {
      if (!getSession()?.user?.id) router.push('/login');
    }, 5000);
    return () => { unsubscribe(); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingAmount = escrow.reduce((s, t) => s + t.sale_price - t.application_fee, 0);
  const lifetimeAmount = released.reduce((s, t) => s + t.sale_price - t.application_fee, 0);
  const buyerPendingAmount = buyerTxns.filter(t => ['held', 'awaiting_confirmation'].includes(t.escrow_status)).reduce((s, t) => s + t.sale_price, 0);
  const buyerLifetimeAmount = buyerTxns.filter(t => ['released', 'auto_released'].includes(t.escrow_status)).reduce((s, t) => s + t.sale_price, 0);

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Wallet</h1>

      {/* Stripe connect banner */}
      {stripeConnected === false && (
        <div className="rounded-xl bg-amber-900/20 border border-amber-800 px-5 py-4 flex items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-amber-300 font-semibold text-sm">Payouts not connected</p>
            <p className="text-amber-600 text-xs mt-0.5">Link your bank account to receive payouts when items sell.</p>
          </div>
          <Link href="/dashboard/settings/payouts"
            className="shrink-0 rounded-md bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors">
            Connect →
          </Link>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4">
          <p className="text-zinc-400 text-xs mb-1">In escrow</p>
          <p className="text-white text-2xl font-bold">{fmt(pendingAmount)}</p>
          <p className="text-zinc-500 text-xs mt-1">{escrow.length} active sale{escrow.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4">
          <p className="text-zinc-400 text-xs mb-1">Lifetime paid out</p>
          <p className="text-emerald-400 text-2xl font-bold">{fmt(lifetimeAmount)}</p>
          <p className="text-zinc-500 text-xs mt-1">{released.length} completed sale{released.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Buyer totals */}
      {buyerTxns.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Buying activity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4">
              <p className="text-zinc-400 text-xs mb-1">In-escrow purchases</p>
              <p className="text-white text-xl font-bold">{fmt(buyerPendingAmount)}</p>
              <p className="text-zinc-500 text-xs mt-1">funds held until delivery confirmed</p>
            </div>
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4">
              <p className="text-zinc-400 text-xs mb-1">Lifetime spent</p>
              <p className="text-white text-xl font-bold">{fmt(buyerLifetimeAmount)}</p>
              <p className="text-zinc-500 text-xs mt-1">{buyerTxns.filter(t => ['released', 'auto_released'].includes(t.escrow_status)).length} completed purchase{buyerTxns.filter(t => ['released', 'auto_released'].includes(t.escrow_status)).length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </section>
      )}

      {/* Escrow section */}
      {escrow.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Pending escrow</h2>
          <div className="space-y-3">
            {escrow.map(t => <EscrowCard key={t.id} txn={t} />)}
          </div>
        </section>
      )}

      {/* Released payouts */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Payout history</h2>
        {released.length === 0 ? (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-8 text-center text-zinc-500 text-sm">
            No payouts yet — payouts are sent once buyers confirm delivery.
          </div>
        ) : (
          <div className="space-y-3">
            {released.map(t => <ReleasedCard key={t.id} txn={t} />)}
          </div>
        )}
      </section>
    </div>
  );
}
