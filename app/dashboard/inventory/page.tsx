'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { butterbase, getSession } from '@/lib/butterbase';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

const SCAN_STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  pending_scan:      { label: 'Scanning…',      color: 'bg-yellow-900/30 text-yellow-300 border-yellow-800', dot: 'bg-yellow-400 animate-pulse' },
  needs_more_photos: { label: 'Needs Photos',   color: 'bg-orange-900/30 text-orange-300 border-orange-800', dot: 'bg-orange-400 animate-pulse' },
  pending_auth:      { label: 'Authenticating', color: 'bg-blue-900/30 text-blue-300 border-blue-800',       dot: 'bg-blue-400 animate-pulse' },
  manual_review:     { label: 'Under Review',   color: 'bg-zinc-700/40 text-zinc-400 border-zinc-600',       dot: 'bg-zinc-500 animate-pulse' },
  verified:          { label: 'Verified',        color: 'bg-emerald-900/30 text-emerald-300 border-emerald-800', dot: 'bg-emerald-400' },
  rejected:          { label: 'Rejected',        color: 'bg-red-900/30 text-red-300 border-red-800',          dot: 'bg-red-400' },
};

const LISTING_STATUS_META: Record<string, { label: string; color: string }> = {
  active:        { label: 'Active',        color: 'bg-emerald-900/30 text-emerald-300 border-emerald-800' },
  paused:        { label: 'Paused',        color: 'bg-zinc-700/40 text-zinc-400 border-zinc-600' },
  floor_reached: { label: 'Floor Reached', color: 'bg-orange-900/30 text-orange-300 border-orange-800' },
  sold:          { label: 'Sold',          color: 'bg-violet-900/30 text-violet-300 border-violet-800' },
  expired:       { label: 'Expired',       color: 'bg-red-900/30 text-red-300 border-red-800' },
  cancelled:     { label: 'Cancelled',     color: 'bg-zinc-700/40 text-zinc-400 border-zinc-600' },
};

const TIER_META: Record<string, { label: string; color: string }> = {
  new:          { label: 'New Seller',   color: 'bg-zinc-700/40 text-zinc-400 border-zinc-600' },
  verified:     { label: 'Verified',     color: 'bg-blue-900/30 text-blue-300 border-blue-800' },
  trusted:      { label: 'Trusted',      color: 'bg-violet-900/30 text-violet-300 border-violet-800' },
  power_seller: { label: 'Power Seller', color: 'bg-amber-900/30 text-amber-300 border-amber-800' },
};

function Sparkline({ data }: { data: { price: number }[] }) {
  if (data.length < 2) return <div className="h-8 w-full" />;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="price" stroke="#7c3aed" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DeadlineBar({ createdAt, sellByDate }: { createdAt: string; sellByDate: string }) {
  const total = new Date(sellByDate).getTime() - new Date(createdAt).getTime();
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const daysLeft = Math.max(0, Math.ceil((new Date(sellByDate).getTime() - Date.now()) / 86400000));
  const urgent = pct > 80;
  return (
    <div className="space-y-1">
      <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${urgent ? 'bg-red-500' : 'bg-violet-600'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-xs ${urgent ? 'text-red-400 font-medium' : 'text-zinc-600'}`}>{daysLeft}d left to sell</p>
    </div>
  );
}

type InlineAction = { type: 'lower_floor' | 'extend_deadline'; value: string } | null;

function ItemCard({ item, listing, sparklineData, offerCount, onAction }: {
  item: any; listing: any | null; sparklineData: { price: number }[];
  offerCount: number; onAction: (action: string, payload: object) => Promise<void>;
}) {
  const [inlineAction, setInlineAction] = useState<InlineAction>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const scanMeta = SCAN_STATUS_META[item.scan_status] ?? SCAN_STATUS_META.pending_scan;
  const listingMeta = listing ? (LISTING_STATUS_META[listing.status] ?? LISTING_STATUS_META.active) : null;
  const priceDiff = listing ? ((parseFloat(listing.current_price) - parseFloat(listing.floor_price)) / parseFloat(listing.floor_price)) * 100 : null;
  const photo = item.photos?.[0];

  const doAction = async (action: string, payload: object) => {
    setActing(true);
    setActionError(null);
    try {
      await onAction(action, payload);
      setInlineAction(null);
    } catch (e: any) {
      setActionError(e.message ?? 'Action failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="flex gap-3 p-4">
        {/* Thumbnail */}
        <div className="shrink-0 w-14 rounded-md overflow-hidden bg-zinc-800" style={{ height: 72 }}>
          {photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photo} alt={item.catalog_name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xl">🃏</div>}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-medium text-sm truncate">{item.catalog_name ?? 'Unknown item'}</p>
              <p className="text-zinc-500 text-xs truncate">{item.catalog_group}</p>
            </div>
            <div className="shrink-0">
              {listingMeta
                ? <span className={`text-xs px-2 py-0.5 rounded-full border ${listingMeta.color}`}>{listingMeta.label}</span>
                : <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${scanMeta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${scanMeta.dot}`} />
                    {scanMeta.label}
                  </span>}
            </div>
          </div>

          {/* Active/paused/floor_reached listing */}
          {listing && (listing.status === 'active' || listing.status === 'paused' || listing.status === 'floor_reached') && (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-white font-semibold">${parseFloat(listing.current_price).toFixed(2)}</span>
                <span className="text-zinc-600 text-xs">floor ${parseFloat(listing.floor_price).toFixed(2)}</span>
                {priceDiff !== null && priceDiff < -0.5 && (
                  <span className="text-violet-400 text-xs">{Math.abs(priceDiff).toFixed(0)}% agent discount</span>
                )}
                {offerCount > 0 && (
                  <span className="text-orange-400 text-xs font-medium">{offerCount} offer{offerCount !== 1 ? 's' : ''}</span>
                )}
              </div>
              <DeadlineBar createdAt={listing.created_at} sellByDate={listing.sell_by_date} />
              <div className="-mx-1">
                <Sparkline data={sparklineData} />
              </div>
            </>
          )}

          {listing?.status === 'sold' && (
            <p className="text-violet-400 text-sm font-medium">Sold for ${parseFloat(listing.current_price).toFixed(2)}</p>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {item.scan_status === 'needs_more_photos' && (
              <Link href={`/dashboard/inventory/${item.id}/resubmit`}
                className="rounded px-2.5 py-1.5 text-xs bg-orange-900/20 border border-orange-800/50 text-orange-300 hover:bg-orange-900/40 transition-colors">
                Add photos →
              </Link>
            )}
            {item.scan_status === 'verified' && !listing && (
              <Link href={`/dashboard/inventory/${item.id}/list`}
                className="rounded px-2.5 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white transition-colors font-medium">
                Create listing →
              </Link>
            )}
            {listing?.status === 'active' && (
              <>
                <button onClick={() => doAction('pause', { listing_id: listing.id })} disabled={acting}
                  className="rounded px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors disabled:opacity-50">
                  Pause
                </button>
                <button onClick={() => setInlineAction({ type: 'lower_floor', value: String(parseFloat(listing.floor_price)) })}
                  className="rounded px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors">
                  Lower Floor
                </button>
                <button onClick={() => setInlineAction({ type: 'extend_deadline', value: listing.sell_by_date.slice(0, 10) })}
                  className="rounded px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors">
                  Extend Deadline
                </button>
                <button onClick={() => { if (confirm('Cancel this listing? The item will return to your inventory.')) doAction('cancel', { listing_id: listing.id }); }}
                  disabled={acting}
                  className="rounded px-2.5 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-red-400 transition-colors disabled:opacity-50">
                  Pull
                </button>
              </>
            )}
            {listing?.status === 'paused' && (
              <>
                <button onClick={() => doAction('resume', { listing_id: listing.id })} disabled={acting}
                  className="rounded px-2.5 py-1.5 text-xs bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-800/50 text-emerald-300 transition-colors disabled:opacity-50">
                  Resume
                </button>
                <button onClick={() => { if (confirm('Cancel this listing?')) doAction('cancel', { listing_id: listing.id }); }}
                  disabled={acting}
                  className="rounded px-2.5 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-red-400 transition-colors disabled:opacity-50">
                  Pull
                </button>
              </>
            )}
            {listing?.status === 'floor_reached' && (
              <button onClick={() => setInlineAction({ type: 'lower_floor', value: String(parseFloat(listing.floor_price)) })}
                className="rounded px-2.5 py-1.5 text-xs bg-orange-900/20 hover:bg-orange-900/40 border border-orange-800/50 text-orange-300 transition-colors">
                Lower Floor to Relist
              </button>
            )}
          </div>

          {/* Inline inputs */}
          {inlineAction?.type === 'lower_floor' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">New floor: $</span>
              <input type="number" step="0.01" min="0" value={inlineAction.value}
                onChange={e => setInlineAction({ type: 'lower_floor', value: e.target.value })}
                className="w-24 rounded bg-zinc-800 border border-zinc-700 text-white text-xs px-2 py-1 focus:outline-none focus:border-violet-600" />
              <button onClick={() => doAction('lower_floor', { listing_id: listing!.id, new_floor: parseFloat(inlineAction.value) })}
                disabled={acting || parseFloat(inlineAction.value) >= parseFloat(listing!.floor_price)}
                className="rounded px-2.5 py-1 text-xs bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors">
                {acting ? '…' : 'Confirm'}
              </button>
              <button onClick={() => setInlineAction(null)} className="text-xs text-zinc-600 hover:text-zinc-400">Cancel</button>
            </div>
          )}

          {inlineAction?.type === 'extend_deadline' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">New date:</span>
              <input type="date" value={inlineAction.value}
                onChange={e => setInlineAction({ type: 'extend_deadline', value: e.target.value })}
                className="rounded bg-zinc-800 border border-zinc-700 text-white text-xs px-2 py-1 focus:outline-none focus:border-violet-600" />
              <button onClick={() => doAction('extend_deadline', { listing_id: listing!.id, new_date: inlineAction.value })}
                disabled={acting || inlineAction.value <= listing!.sell_by_date.slice(0, 10)}
                className="rounded px-2.5 py-1 text-xs bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors">
                {acting ? '…' : 'Confirm'}
              </button>
              <button onClick={() => setInlineAction(null)} className="text-xs text-zinc-600 hover:text-zinc-400">Cancel</button>
            </div>
          )}

          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);

  const [items, setItems] = useState<any[]>([]);
  const [listingMap, setListingMap] = useState<Map<string, any>>(new Map());
  const [sparklineMap, setSparklineMap] = useState<Map<string, { price: number }[]>>(new Map());
  const [offerCountMap, setOfferCountMap] = useState<Map<string, number>>(new Map());
  const [profile, setProfile] = useState<any>(null);
  const [summary, setSummary] = useState({ activeListings: 0, pendingPayout: 0, lifetimeSold: 0 });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const session = getSession();
    tokenRef.current = session?.accessToken ?? null;
    const userId = session?.user?.id ?? null;
    if (!userId) { router.push('/login'); return; }

    const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString();

    const [itemsRes, profileRes, pendingTxnRes, soldCountRes] = await Promise.all([
      (butterbase as any)
        .from('items')
        .select('*, catalog_items(id, name, group_name, album, version, reference_image_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      (butterbase as any).from('seller_profiles').select('score, tier, sales_count').eq('user_id', userId).maybeSingle(),
      (butterbase as any).from('transactions').select('sale_price, application_fee').eq('seller_id', userId).in('escrow_status', ['held', 'awaiting_confirmation']),
      (butterbase as any).from('transactions').select('id', { count: 'exact', head: true }).eq('seller_id', userId).in('escrow_status', ['released', 'auto_released']),
    ]);

    const rawItems = (itemsRes.data ?? []).map((i: any) => ({
      ...i,
      catalog_name: i.catalog_items?.name,
      catalog_group: [i.catalog_items?.group_name, i.catalog_items?.album, i.catalog_items?.version].filter(Boolean).join(' · '),
    }));
    setItems(rawItems);
    setProfile(profileRes.data);

    const pendingPayout = (pendingTxnRes.data ?? []).reduce((sum: number, t: any) => {
      return sum + (parseFloat(t.sale_price) - parseFloat(t.application_fee ?? 0));
    }, 0);

    const itemIds = rawItems.map((i: any) => i.id);
    if (itemIds.length > 0) {
      const { data: listings } = await (butterbase as any)
        .from('listings').select('*').in('item_id', itemIds).order('created_at', { ascending: false });

      const lMap = new Map<string, any>();
      const listingIds: string[] = [];
      for (const l of listings ?? []) {
        if (!lMap.has(l.item_id)) { lMap.set(l.item_id, l); listingIds.push(l.id); }
      }
      setListingMap(lMap);
      setSummary({
        activeListings: (listings ?? []).filter((l: any) => l.status === 'active').length,
        pendingPayout,
        lifetimeSold: soldCountRes.count ?? 0,
      });

      if (listingIds.length > 0) {
        const [histRes, offersRes] = await Promise.all([
          (butterbase as any).from('listing_price_history').select('listing_id, new_price, changed_at')
            .in('listing_id', listingIds).gte('changed_at', cutoff14).order('changed_at', { ascending: true }),
          (butterbase as any).from('listing_offers').select('listing_id').in('listing_id', listingIds).eq('status', 'pending'),
        ]);

        const spMap = new Map<string, { price: number }[]>();
        for (const h of histRes.data ?? []) {
          if (!spMap.has(h.listing_id)) spMap.set(h.listing_id, []);
          spMap.get(h.listing_id)!.push({ price: parseFloat(h.new_price) });
        }
        setSparklineMap(spMap);

        const ocMap = new Map<string, number>();
        for (const o of offersRes.data ?? []) ocMap.set(o.listing_id, (ocMap.get(o.listing_id) ?? 0) + 1);
        setOfferCountMap(ocMap);
      }
    } else {
      setSummary({ activeListings: 0, pendingPayout, lifetimeSold: soldCountRes.count ?? 0 });
    }

    setLoading(false);
  }, [router]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchAllRef = useRef(fetchAll);
  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    const timer = setTimeout(() => {
      if (closed) return;
      const token = getSession()?.accessToken;
      if (!token) return;
      ws = new WebSocket(`wss://api.butterbase.ai/v1/app_w2wmfcnqn2j2/realtime?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { if (!closed) ws!.send(JSON.stringify({ type: 'subscribe', table: 'listings' })); };
      ws.onmessage = (e) => {
        if (closed) return;
        try { if (JSON.parse(e.data).type === 'change') fetchAllRef.current(); } catch {}
      };
    }, 0);
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAction = useCallback(async (action: string, payload: object) => {
    const res = await fetch(`${BB_BASE}/manage-listing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Action failed');
    await fetchAll();
  }, [fetchAll]);

  const tierMeta = TIER_META[profile?.tier ?? 'new'] ?? TIER_META.new;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        <Link href="/dashboard/inventory/new"
          className="rounded-md bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition-colors">
          + Upload item
        </Link>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3.5">
          <p className="text-xs text-zinc-500 mb-1">Active Listings</p>
          <p className="text-2xl font-bold text-white">{loading ? '—' : summary.activeListings}</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3.5">
          <p className="text-xs text-zinc-500 mb-1">Pending Payout</p>
          <p className="text-2xl font-bold text-white">{loading ? '—' : `$${summary.pendingPayout.toFixed(2)}`}</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3.5">
          <p className="text-xs text-zinc-500 mb-1">Lifetime Sold</p>
          <p className="text-2xl font-bold text-white">{loading ? '—' : summary.lifetimeSold}</p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3.5">
          <p className="text-xs text-zinc-500 mb-1">Seller Tier</p>
          {loading ? <div className="h-5 w-20 bg-zinc-800 rounded animate-pulse mt-1" /> : (
            <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${tierMeta.color}`}>{tierMeta.label}</span>
          )}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-44 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">📦</div>
          <h2 className="text-white font-semibold text-lg mb-1">No items yet</h2>
          <p className="text-zinc-400 text-sm mb-6 max-w-xs">Upload your first collectible and the AI will scan and verify it before listing.</p>
          <Link href="/dashboard/inventory/new"
            className="rounded-md bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white">
            Upload your first item
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const listing = listingMap.get(item.id) ?? null;
            const sparkline = listing ? (sparklineMap.get(listing.id) ?? []) : [];
            const offerCount = listing ? (offerCountMap.get(listing.id) ?? 0) : 0;
            return (
              <ItemCard key={item.id} item={item} listing={listing}
                sparklineData={sparkline} offerCount={offerCount} onAction={handleAction} />
            );
          })}
        </div>
      )}
    </div>
  );
}
