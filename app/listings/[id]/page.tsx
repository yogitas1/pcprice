'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { butterbase } from '@/lib/butterbase';
import type { Listing, ListingPriceHistory, SellerProfile } from '@/lib/types';

interface FullListing extends Listing {
  // joined
  catalog_name?: string;
  group_name?: string;
  album?: string;
  version?: string;
  condition_grade?: number;
  scan_defects?: string[];
  authenticity_score?: number;
  photos?: string[];
  item_user_id?: string;
}

interface Valuation {
  fair_value: number;
  quick_sale_price: number;
  hold_price: number;
  confidence_score: number;
}

const GRADE_LABEL: Record<number, string> = {
  5: 'Mint', 4: 'Near Mint', 3: 'Excellent', 2: 'Good', 1: 'Fair'
};
const TIER_META: Record<string, { label: string; color: string }> = {
  new:          { label: 'New',         color: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
  verified:     { label: 'Verified',    color: 'text-blue-400 bg-blue-900/20 border-blue-800' },
  trusted:      { label: 'Trusted',     color: 'text-green-400 bg-green-900/20 border-green-800' },
  power_seller: { label: 'Power Seller',color: 'text-violet-400 bg-violet-900/20 border-violet-800' },
};
const STATUS_BANNER: Record<string, { label: string; color: string }> = {
  sold:          { label: 'Sold', color: 'bg-green-900/20 border-green-800 text-green-400' },
  expired:       { label: 'Expired — no longer available', color: 'bg-zinc-800 border-zinc-700 text-zinc-400' },
  cancelled:     { label: 'Cancelled', color: 'bg-zinc-800 border-zinc-700 text-zinc-400' },
  floor_reached: { label: 'Price floor reached — pending seller action', color: 'bg-yellow-900/20 border-yellow-800 text-yellow-400' },
  paused:        { label: 'Paused by seller', color: 'bg-zinc-800 border-zinc-700 text-zinc-400' },
};

const fmt  = (n: number) => `$${parseFloat(String(n)).toFixed(2)}`;
const fmtD = (ts: string) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function ListingDetailPage() {
  const { id: listingId } = useParams<{ id: string }>();

  const [listing,  setListing]  = useState<FullListing | null>(null);
  const [valuation, setVal]     = useState<Valuation | null>(null);
  const [history,  setHistory]  = useState<ListingPriceHistory[]>([]);
  const [seller,   setSeller]   = useState<SellerProfile | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // Offer state
  const [currentUserId, setCurrentUserId] = useState('');
  const [offerOpen,  setOfferOpen]  = useState(false);
  const [offerAmt,   setOfferAmt]   = useState('');
  const [offerRes,   setOfferRes]   = useState<{ outcome: string; message: string; counter_offer?: number } | null>(null);
  const [offerSending, setOfferSending] = useState(false);
  const [offerErr, setOfferErr]    = useState('');

  // Selected photo
  const [photoIdx, setPhotoIdx] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      // Fetch listing with item + catalog joined
      const { data: listRow } = await butterbase
        .from<FullListing>('listings')
        .select('*')
        .eq('id', listingId)
        .single();
      if (!listRow) { setError('Listing not found'); setLoading(false); return; }
      setListing(listRow);

      // Parallel fetches
      const [
        { data: itemRows },
        { data: histRows },
        { data: { user: currentUser } = { user: null } }
      ] = await Promise.all([
        butterbase.from<any>('items').select('*').eq('id', listRow.item_id).single(),
        butterbase.from<ListingPriceHistory>('listing_price_history')
          .select('*').eq('listing_id', listingId).order('changed_at', { ascending: true }),
        butterbase.auth.getUser()
      ]);

      if (itemRows) {
        setListing(prev => prev ? {
          ...prev,
          condition_grade: itemRows.condition_grade,
          scan_defects: itemRows.scan_defects,
          authenticity_score: itemRows.authenticity_score,
          photos: itemRows.photos,
          item_user_id: itemRows.user_id
        } : prev);

        // Fetch catalog + valuation + seller profile in parallel
        const [
          { data: catRow },
          { data: valRows },
          { data: sellerProfileRows },
          { data: sellerProfileName }
        ] = await Promise.all([
          itemRows.catalog_id
            ? butterbase.from<any>('catalog_items').select('*').eq('id', itemRows.catalog_id).single()
            : Promise.resolve({ data: null }),
          itemRows.catalog_id
            ? butterbase.from<Valuation>('item_valuations').select('*')
                .eq('catalog_id', itemRows.catalog_id)
                .order('captured_at', { ascending: false }).limit(1)
            : Promise.resolve({ data: [] }),
          butterbase.from<SellerProfile>('seller_profiles').select('*').eq('user_id', listRow.seller_id).limit(1),
          butterbase.from<any>('user_profiles').select('display_name').eq('user_id', listRow.seller_id).single()
        ]);

        if (catRow) {
          setListing(prev => prev ? {
            ...prev,
            catalog_name: catRow.name,
            group_name: catRow.group_name,
            album: catRow.album,
            version: catRow.version
          } : prev);
        }
        if (valRows?.[0]) setVal(valRows[0]);
        if (sellerProfileRows?.[0]) setSeller(sellerProfileRows[0]);
        setSellerName(sellerProfileName?.display_name ?? 'Seller');
      }

      setHistory(histRows ?? []);
      setCurrentUserId(currentUser?.id ?? '');
    } catch (e: any) {
      setError(e.message ?? 'Failed to load listing');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleOffer(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(offerAmt);
    if (isNaN(amount) || amount <= 0) { setOfferErr('Enter a valid offer amount'); return; }
    setOfferSending(true);
    setOfferErr('');
    try {
      const { data: sd } = await butterbase.auth.refreshSession();
      const token = sd?.access_token ?? '';
      const res = await fetch('https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/handle-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listing_id: listingId, offer_amount: amount })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOfferRes(data);
    } catch (e: any) {
      setOfferErr(e.message ?? 'Failed to submit offer');
    } finally {
      setOfferSending(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const photos    = listing?.photos ?? [];
  const isOwner   = listing?.seller_id === currentUserId;
  const isActive  = listing?.status === 'active';
  const curPrice  = listing ? parseFloat(String(listing.current_price)) : 0;
  const fv        = valuation ? parseFloat(String(valuation.fair_value)) : null;
  const pctVsFv   = fv && fv > 0 ? ((curPrice - fv) / fv) * 100 : null;
  const grade     = listing?.condition_grade;
  const tierMeta  = seller ? (TIER_META[seller.tier] ?? TIER_META.new) : null;
  const banner    = listing ? STATUS_BANNER[listing.status] : null;
  const chartData = history.map(h => ({
    date: fmtD(h.changed_at),
    price: parseFloat(String(h.new_price)),
    reason: h.reason
  }));

  // ── Tooltip ─────────────────────────────────────────────────────────────
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
        <p className="text-zinc-400 mb-0.5">{label}</p>
        <p className="text-white font-semibold">{fmt(payload[0].value)}</p>
        <p className="text-zinc-500">{payload[0].payload.reason?.replace(/_/g, ' ')}</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 max-w-4xl mx-auto">
        <div className="h-6 w-32 bg-zinc-800 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-[3/4] bg-zinc-900 rounded-xl animate-pulse" />
          <div className="space-y-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-zinc-900 rounded animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white font-semibold text-lg mb-2">{error || 'Listing not found'}</p>
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200 text-sm">← Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <Link href="/dashboard/market" className="text-sm text-zinc-500 hover:text-zinc-300 mb-6 block">
          ← Market
        </Link>

        {/* Status banner */}
        {banner && (
          <div className={`rounded-lg border px-4 py-3 text-sm mb-6 ${banner.color}`}>
            {banner.label}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          {/* ── Photos ────────────────────────────────────────────────────── */}
          <div>
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-3">
              {photos.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[photoIdx]} alt="Item" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-5xl">🃏</div>
              )}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`Photo ${i + 1}`}
                    onClick={() => setPhotoIdx(i)}
                    className={`h-14 w-auto rounded border cursor-pointer object-cover shrink-0 transition-all ${
                      photoIdx === i ? 'border-violet-500' : 'border-zinc-700 opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Details ───────────────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Title */}
            <div>
              <h1 className="text-2xl font-bold text-white leading-tight">
                {listing.catalog_name ?? 'Collectible'}
              </h1>
              <p className="text-zinc-400 text-sm mt-1">
                {[listing.group_name, listing.album, listing.version].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Price block */}
            <div>
              <div className="text-4xl font-bold text-white mb-1">{fmt(curPrice)}</div>
              {pctVsFv !== null && (
                <div className={`text-sm font-medium ${pctVsFv < 0 ? 'text-green-400' : pctVsFv > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                  {pctVsFv < 0
                    ? `${Math.abs(pctVsFv).toFixed(1)}% below fair value`
                    : pctVsFv > 0
                    ? `${pctVsFv.toFixed(1)}% above fair value`
                    : 'At fair value'}
                  <span className="text-zinc-600 font-normal ml-1">· fair value {fmt(fv!)}</span>
                </div>
              )}
            </div>

            {/* Condition */}
            {grade != null && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Verified condition</span>
                  <span className="text-sm font-semibold text-white">
                    {GRADE_LABEL[grade] ?? grade} ({grade}/5)
                  </span>
                </div>
                {(listing.scan_defects ?? []).length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Defects noted during scan:</p>
                    <div className="flex flex-wrap gap-1">
                      {listing.scan_defects!.map(d => (
                        <span key={d} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 rounded px-1.5 py-0.5">
                          {d.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Authenticity */}
            {listing.authenticity_score != null && (
              <div className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">Authenticity confidence</span>
                  <div className="group relative">
                    <span className="text-zinc-600 cursor-help text-xs border border-zinc-700 rounded-full w-4 h-4 flex items-center justify-center">?</span>
                    <div className="absolute left-5 top-0 z-10 w-56 bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-400 hidden group-hover:block">
                      AI-verified: visual match to official reference, print quality, holo pattern, border precision, color accuracy.
                    </div>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${
                  listing.authenticity_score >= 0.85 ? 'text-green-400'
                  : listing.authenticity_score >= 0.70 ? 'text-yellow-400'
                  : 'text-red-400'
                }`}>
                  {Math.round(listing.authenticity_score * 100)}%
                </span>
              </div>
            )}

            {/* Seller + shipping */}
            <div className="flex items-center justify-between rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3">
              <div>
                <p className="text-sm text-white font-medium">{sellerName}</p>
                {listing.shipping_from && (
                  <p className="text-xs text-zinc-500 mt-0.5">Ships from {listing.shipping_from}</p>
                )}
              </div>
              {tierMeta && (
                <span className={`text-xs font-medium px-2 py-1 rounded-full border ${tierMeta.color}`}>
                  {tierMeta.label}
                </span>
              )}
            </div>

            {/* Sell-by date */}
            {listing.sell_by_date && isActive && (
              <p className="text-xs text-zinc-600">
                Listed until {new Date(listing.sell_by_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}

            {/* ── Offer section ──────────────────────────────────────────── */}
            {!isOwner && isActive && (
              <div>
                {!offerRes ? (
                  offerOpen ? (
                    <form onSubmit={handleOffer} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                      <p className="text-sm font-medium text-zinc-300">Make an offer</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={offerAmt}
                          onChange={e => setOfferAmt(e.target.value)}
                          placeholder={`${(curPrice * 0.9).toFixed(2)}`}
                          className="w-full rounded-md bg-zinc-800 border border-zinc-700 pl-7 pr-3 py-2 text-sm text-white placeholder:text-zinc-600"
                        />
                      </div>
                      {offerErr && <p className="text-xs text-red-400">{offerErr}</p>}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={offerSending}
                          className="flex-1 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white transition-colors"
                        >
                          {offerSending ? 'Sending…' : 'Send offer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOfferOpen(false)}
                          className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setOfferAmt(String(curPrice)); setOfferOpen(true); }}
                        className="flex-1 rounded-md bg-violet-600 hover:bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                      >
                        Buy at {fmt(curPrice)}
                      </button>
                      <button
                        onClick={() => setOfferOpen(true)}
                        className="flex-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors"
                      >
                        Make offer
                      </button>
                    </div>
                  )
                ) : (
                  <div className={`rounded-xl border p-4 ${
                    offerRes.outcome === 'accepted'              ? 'bg-green-900/20 border-green-800'
                    : offerRes.outcome === 'countered'          ? 'bg-yellow-900/20 border-yellow-800'
                    : 'bg-zinc-900 border-zinc-700'
                  }`}>
                    <p className="text-sm font-medium text-white mb-1">
                      {offerRes.outcome === 'accepted'   ? '✓ Offer accepted'
                       : offerRes.outcome === 'countered' ? '↔ Counter offer'
                       : '📬 Sent to seller'}
                    </p>
                    <p className="text-sm text-zinc-400">{offerRes.message}</p>
                    {offerRes.counter_offer && (
                      <p className="text-lg font-bold text-yellow-300 mt-2">{fmt(offerRes.counter_offer)}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {isOwner && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-4 py-3 text-sm text-zinc-400">
                This is your listing. Manage it from your <Link href="/dashboard/inventory" className="text-violet-400 hover:text-violet-300">inventory</Link>.
              </div>
            )}
          </div>
        </div>

        {/* ── Listing copy ──────────────────────────────────────────────────── */}
        {listing.listing_copy && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 mb-6">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">About this item</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">{listing.listing_copy}</p>
          </div>
        )}

        {/* ── Price history chart ───────────────────────────────────────────── */}
        {chartData.length > 1 && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Price history</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={v => `$${v}`}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  dataKey="price"
                  name="Price"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#7c3aed', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#a78bfa' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
