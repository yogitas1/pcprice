'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { butterbase, getSession } from '@/lib/butterbase';
import type { BuyOrder, CatalogItem, MatchLog, ListingSnapshot } from '@/lib/types';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

const GRADE_LABELS: Record<number, string> = { 1: 'Fair', 2: 'Good', 3: 'Excellent', 4: 'Near Mint', 5: 'Mint' };

const TIER_META: Record<string, { label: string; color: string }> = {
  new:          { label: 'New',          color: 'bg-zinc-700/40 text-zinc-400 border-zinc-600' },
  verified:     { label: 'Verified',     color: 'bg-blue-900/30 text-blue-300 border-blue-800' },
  trusted:      { label: 'Trusted',      color: 'bg-violet-900/30 text-violet-300 border-violet-800' },
  power_seller: { label: 'Power Seller', color: 'bg-amber-900/30 text-amber-300 border-amber-800' },
};

function Countdown({ expiresAt, label }: { expiresAt: string; label?: string }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const urgent = secs < 3600;
  return (
    <span className={`font-mono tabular-nums ${urgent ? 'text-orange-400 font-semibold' : 'text-zinc-400'}`}>
      {label && <span className="font-sans font-normal mr-1">{label}</span>}
      {h}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s
    </span>
  );
}

function EscrowCountdown({ autoReleaseAt }: { autoReleaseAt: string }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(autoReleaseAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const days = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), sec = secs % 60;
  return (
    <span className="font-mono tabular-nums text-yellow-400 text-sm">
      {days > 0 ? `${days}d ` : ''}{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}

function MatchCard({ match, onApprove, onDecline }: {
  match: MatchLog; onApprove: (id: string) => Promise<void>; onDecline: (id: string) => Promise<void>;
}) {
  const snap = match.listing_snapshot as ListingSnapshot | null;
  const [actioning, setActioning] = useState<'approve' | 'decline' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!snap) return null;
  const priceDiffPct = snap.fair_value ? ((snap.current_price - snap.fair_value) / snap.fair_value) * 100 : null;
  const tierMeta = TIER_META[snap.seller_tier] ?? TIER_META.new;

  const handleApprove = async () => {
    setActioning('approve');
    try { await onApprove(match.id); setResult({ ok: true, msg: 'Approved — purchase queued.' }); }
    catch (e: any) { setResult({ ok: false, msg: e?.message ?? 'Listing may no longer be available.' }); }
    finally { setActioning(null); }
  };

  const handleDecline = async () => {
    setActioning('decline');
    try { await onDecline(match.id); setResult({ ok: true, msg: 'Declined. Agent will continue searching.' }); }
    catch { setResult({ ok: false, msg: 'Could not decline. Please try again.' }); }
    finally { setActioning(null); }
  };

  if (result) {
    return (
      <div className={`rounded-xl border px-5 py-4 text-sm ${result.ok ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-red-900/20 border-red-800 text-red-400'}`}>
        {result.msg}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-zinc-900 border border-amber-700/60 overflow-hidden">
      <div className="bg-amber-900/10 border-b border-amber-800/40 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-amber-400">Match found — approve to buy</span>
        {match.expires_at && <Countdown expiresAt={match.expires_at} label="Expires in" />}
      </div>
      <div className="flex gap-4 p-4">
        <div className="shrink-0 w-16 rounded-md overflow-hidden bg-zinc-800" style={{ height: 88 }}>
          {snap.photos[0]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={snap.photos[0]} alt="Item" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-2xl">🃏</div>}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-white font-medium text-sm">{snap.catalog_name}</p>
            <p className="text-zinc-500 text-xs">{[snap.group_name, snap.album, snap.version].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs rounded px-2 py-0.5 bg-violet-900/30 border border-violet-800 text-violet-300">
              Grade {snap.condition_grade}/5 — {GRADE_LABELS[snap.condition_grade] ?? ''}
            </span>
            <span className={`text-xs rounded px-2 py-0.5 border ${tierMeta.color}`}>{tierMeta.label}</span>
            {snap.shipping_from && <span className="text-xs text-zinc-500">Ships from {snap.shipping_from}</span>}
          </div>
          {snap.scan_defects.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {snap.scan_defects.map(d => <span key={d} className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">{d}</span>)}
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold">${snap.current_price.toFixed(2)}</span>
            {priceDiffPct !== null && (
              <span className={`text-xs font-medium ${priceDiffPct <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceDiffPct > 0 ? '+' : ''}{priceDiffPct.toFixed(1)}% vs fair value (${snap.fair_value!.toFixed(2)})
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 flex gap-3">
        <button onClick={handleApprove} disabled={!!actioning}
          className="flex-1 py-2 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
          {actioning === 'approve' ? 'Approving…' : '✓ Approve — Buy Now'}
        </button>
        <button onClick={handleDecline} disabled={!!actioning}
          className="flex-1 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-medium border border-zinc-700 transition-colors">
          {actioning === 'decline' ? 'Declining…' : '✕ Decline'}
        </button>
      </div>
    </div>
  );
}

function OrderCard({ order, catalogName }: { order: BuyOrder; catalogName: string }) {
  const daysActive = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 86400000);
  const statusMeta =
    order.status === 'active' ? { label: 'Searching…', color: 'bg-green-900/30 text-green-300 border-green-800' } :
    order.status === 'filled'  ? { label: 'Filled',     color: 'bg-zinc-700/40 text-zinc-400 border-zinc-600' } :
    order.status === 'reauth_failed' ? { label: 'Payment issue', color: 'bg-red-900/30 text-red-300 border-red-800' } :
    { label: order.status, color: 'bg-zinc-700/40 text-zinc-400 border-zinc-600' };

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-white font-medium text-sm truncate">{catalogName}</p>
          <p className="text-zinc-500 text-xs mt-0.5">{daysActive === 0 ? 'Placed today' : `${daysActive}d active`}</p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${statusMeta.color}`}>{statusMeta.label}</span>
      </div>
      {order.status === 'reauth_failed' && (
        <p className="text-xs text-red-400">Payment re-authorization failed. Update your payment method to reactivate.</p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div><span className="text-zinc-500">Max price</span><span className="ml-2 text-zinc-300 font-medium">${Number(order.max_price).toFixed(2)}</span></div>
        <div><span className="text-zinc-500">Min cond.</span><span className="ml-2 text-zinc-300">{order.min_condition_grade}/5 — {GRADE_LABELS[order.min_condition_grade] ?? ''}</span></div>
        <div><span className="text-zinc-500">Mode</span><span className="ml-2 text-zinc-300">{order.execution_mode === 'auto_buy' ? 'Auto-buy' : 'Ask me first'}</span></div>
        <div><span className="text-zinc-500">Min tier</span><span className="ml-2 text-zinc-300">{TIER_META[order.min_seller_tier]?.label ?? order.min_seller_tier}</span></div>
        {order.spend_cap_mode === 'global' && order.spend_cap_amount && (
          <div className="col-span-2"><span className="text-zinc-500">Daily cap</span><span className="ml-2 text-zinc-300">${Number(order.spend_cap_amount).toFixed(2)}</span></div>
        )}
      </div>
    </div>
  );
}

type Notif = { id: string; type: 'match' | 'delivered' | 'payout' | 'dispute' | 'reauth'; text: string; timestamp: Date; autoReleaseAt?: string };

export default function BuyOrdersPage() {
  const [orders, setOrders] = useState<BuyOrder[]>([]);
  const [catalogMap, setCatalogMap] = useState<Record<string, CatalogItem>>({});
  const [pendingMatches, setPendingMatches] = useState<MatchLog[]>([]);
  const [deliveredTxns, setDeliveredTxns] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const addNotif = (n: Omit<Notif, 'id'>) => {
    setNotifications(prev => [{ ...n, id: Date.now().toString() }, ...prev.slice(0, 19)]);
  };

  const fetchData = useCallback(async () => {
    const session = getSession();
    tokenRef.current = session?.accessToken ?? null;
    userIdRef.current = session?.user?.id ?? null;

    const { data: rawOrders } = await butterbase
      .from<BuyOrder>('buy_orders').select('*').in('status', ['active', 'filled', 'reauth_failed']).order('created_at', { ascending: false });
    const orderList = rawOrders ?? [];
    setOrders(orderList);

    const catalogIds = [...new Set(orderList.map(o => o.catalog_id).filter(Boolean))];
    if (catalogIds.length > 0) {
      const { data: cats } = await butterbase.from<CatalogItem>('catalog_items').select('id, name, group_name, album, version, reference_image_url').in('id', catalogIds);
      const map: Record<string, CatalogItem> = {};
      for (const c of cats ?? []) map[c.id] = c;
      setCatalogMap(map);
    }

    const orderIds = orderList.map(o => o.id);
    if (orderIds.length > 0) {
      const { data: matches } = await butterbase.from<MatchLog>('match_log').select('*').in('buy_order_id', orderIds).eq('outcome', 'pending_approval');
      setPendingMatches((matches ?? []).filter(m => !m.expires_at || new Date(m.expires_at) > new Date()));
    }

    // Delivered items awaiting confirmation
    if (userIdRef.current) {
      const { data: txns } = await (butterbase as any)
        .from('transactions').select('*, listings(item_id, catalog_id)').eq('buyer_id', userIdRef.current).eq('escrow_status', 'awaiting_confirmation');
      setDeliveredTxns(txns ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const addNotifRef = useRef(addNotif);
  useEffect(() => { addNotifRef.current = addNotif; }, [addNotif]);

  // Real-time: new matches (run once — ref keeps handler current without re-creating WS)
  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    const timer = setTimeout(() => {
      if (closed) return;
      const token = tokenRef.current;
      if (!token) return;
      ws = new WebSocket(`wss://api.butterbase.ai/v1/app_w2wmfcnqn2j2/realtime?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { if (!closed) ws!.send(JSON.stringify({ type: 'subscribe', table: 'match_log' })); };
      ws.onmessage = (e) => {
        if (closed) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'change' && msg.op === 'INSERT') {
            const m = msg.record;
            if (m.outcome === 'pending_approval') {
              setPendingMatches(prev => [...prev, m]);
              addNotifRef.current({ type: 'match', text: 'New match found — review to approve.', timestamp: new Date() });
            }
          }
        } catch {}
      };
    }, 0);
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time: transaction status changes
  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    const timer = setTimeout(() => {
      if (closed) return;
      const token = tokenRef.current;
      if (!token) return;
      ws = new WebSocket(`wss://api.butterbase.ai/v1/app_w2wmfcnqn2j2/realtime?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { if (!closed) ws!.send(JSON.stringify({ type: 'subscribe', table: 'transactions' })); };
      ws.onmessage = (e) => {
        if (closed) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'change' && msg.op === 'UPDATE') {
            const t = msg.record;
            if (t.buyer_id !== userIdRef.current) return;
            if (t.escrow_status === 'awaiting_confirmation') {
              setDeliveredTxns(prev => {
                const exists = prev.find((x: any) => x.id === t.id);
                return exists ? prev : [...prev, t];
              });
              addNotifRef.current({ type: 'delivered', text: 'Your item arrived — 3 days to confirm or dispute.', timestamp: new Date(), autoReleaseAt: t.auto_release_at });
            }
            if (t.escrow_status === 'released' || t.escrow_status === 'auto_released') {
              setDeliveredTxns(prev => prev.filter((x: any) => x.id !== t.id));
              addNotifRef.current({ type: 'payout', text: 'Escrow released — payment sent to seller.', timestamp: new Date() });
            }
          }
        } catch {}
      };
    }, 0);
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = useCallback(async (matchId: string) => {
    const res = await fetch(`${BB_BASE}/approve-match`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({ match_log_id: matchId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Approval failed');
    setPendingMatches(prev => prev.filter(m => m.id !== matchId));
  }, []);

  const handleDecline = useCallback(async (matchId: string) => {
    const res = await fetch(`${BB_BASE}/decline-match`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({ match_log_id: matchId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Decline failed');
    setPendingMatches(prev => prev.filter(m => m.id !== matchId));
  }, []);

  const notifIcon: Record<Notif['type'], string> = { match: '🔔', delivered: '📦', payout: '💸', dispute: '⚠️', reauth: '🔐' };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Buy Orders</h1>
          <p className="text-zinc-400 text-sm mt-1">{orders.filter(o => o.status === 'active').length} active order{orders.filter(o => o.status === 'active').length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/dashboard/buy-orders/new" className="rounded-md bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition-colors">
          + New order
        </Link>
      </div>

      {loading && <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>}

      {!loading && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3 space-y-8">
            {/* Delivered — awaiting confirmation */}
            {deliveredTxns.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />
                  Delivered — Confirm or Dispute
                </h2>
                <div className="space-y-3">
                  {deliveredTxns.map(txn => (
                    <div key={txn.id} className="rounded-xl bg-zinc-900 border border-yellow-800/60 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white font-medium text-sm">Transaction ${Number(txn.sale_price).toFixed(2)}</p>
                        <div className="text-xs text-zinc-500">
                          Auto-releases in{' '}
                          {txn.auto_release_at ? <EscrowCountdown autoReleaseAt={txn.auto_release_at} /> : '—'}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/dashboard/transactions/${txn.id}/confirm`}
                          className="flex-1 text-center rounded-md bg-emerald-700 hover:bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors">
                          Confirm receipt
                        </Link>
                        <Link href={`/dashboard/transactions/${txn.id}/dispute`}
                          className="flex-1 text-center rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors">
                          Report issue
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending approval */}
            {pendingMatches.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                  Pending Approval — {pendingMatches.length} match{pendingMatches.length !== 1 ? 'es' : ''} waiting
                </h2>
                <div className="space-y-4">
                  {pendingMatches.map(match => <MatchCard key={match.id} match={match} onApprove={handleApprove} onDecline={handleDecline} />)}
                </div>
              </div>
            )}

            {/* All orders */}
            {orders.length > 0 ? (
              <div>
                {(pendingMatches.length > 0 || deliveredTxns.length > 0) && <h2 className="text-sm font-semibold text-zinc-500 mb-3">All Orders</h2>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {orders.map(order => <OrderCard key={order.id} order={order} catalogName={catalogMap[order.catalog_id]?.name ?? '—'} />)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="text-5xl mb-4">🛒</div>
                <h2 className="text-white font-semibold text-lg mb-1">No active buy orders</h2>
                <p className="text-zinc-400 text-sm mb-6 max-w-xs">Set your criteria once and the agent finds verified matches automatically.</p>
                <Link href="/dashboard/buy-orders/new" className="rounded-md bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm font-semibold text-white">
                  Place your first buy order
                </Link>
              </div>
            )}
          </div>

          {/* Notification feed */}
          <div className="xl:col-span-1">
            <h2 className="text-sm font-semibold text-zinc-500 mb-3">Activity</h2>
            {notifications.length === 0 ? (
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 text-center">
                <p className="text-zinc-600 text-xs">Real-time updates will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map(n => (
                  <div key={n.id} className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0 mt-0.5">{notifIcon[n.type]}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-300 leading-relaxed">{n.text}</p>
                        {n.autoReleaseAt && (
                          <p className="text-xs text-zinc-600 mt-1">Releases in <EscrowCountdown autoReleaseAt={n.autoReleaseAt} /></p>
                        )}
                        <p className="text-xs text-zinc-600 mt-1">{n.timestamp.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
