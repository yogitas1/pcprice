'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { butterbase, getSession } from '@/lib/butterbase';
import {
  ComposedChart, Line, Area, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

function fmtUSD(n: number | null | undefined) {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function days90() {
  return Array.from({ length: 90 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (89 - i));
    return d.toISOString().slice(0, 10);
  });
}

const DEMAND_LABELS = [
  { threshold: 0.70, label: 'High Demand 🔥', color: 'text-emerald-400' },
  { threshold: 0.40, label: 'Normal Market', color: 'text-zinc-400' },
  { threshold: 0,    label: 'Slow Market',   color: 'text-orange-400' },
];

function demandLabel(rate: number) {
  return DEMAND_LABELS.find(l => rate >= l.threshold) ?? DEMAND_LABELS[2];
}

function confidenceLabel(score: number) {
  if (score >= 0.70) return { label: 'High', color: 'text-emerald-400' };
  if (score >= 0.40) return { label: 'Medium', color: 'text-yellow-400' };
  return { label: 'Low', color: 'text-red-400' };
}

function sentimentLabel(multiplier: number) {
  if (multiplier >= 1.10) return { label: 'Trending ↑', color: 'text-emerald-400' };
  if (multiplier <= 0.90) return { label: 'Cooling ↓', color: 'text-orange-400' };
  return { label: 'Stable', color: 'text-zinc-400' };
}

function StatCard({ label, value, sub, subColor, tooltip }: {
  label: string; value: React.ReactNode; sub?: string; subColor?: string; tooltip?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-1" title={tooltip}>
      <p className="text-xs text-zinc-500 font-medium">{label}</p>
      <div className="text-2xl font-bold text-white leading-tight">{value}</div>
      {sub && <p className={`text-xs font-medium ${subColor ?? 'text-zinc-500'}`}>{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs space-y-1 shadow-xl">
      <p className="text-zinc-400">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <p key={p.dataKey} style={{ color: p.color ?? '#a1a1aa' }}>
          {p.name}: {fmtUSD(p.value)}
        </p>
      ))}
    </div>
  );
};

type Props = { params: { id: string } };

export default function CatalogPage({ params }: Props) {
  const catalogId = params.id;
  const router = useRouter();

  const [catalog, setCatalog] = useState<any>(null);
  const [valuations, setValuations] = useState<any[]>([]);
  const [latestVal, setLatestVal] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [sentiment, setSentiment] = useState<any>(null);
  const [listingBand, setListingBand] = useState<{ min: number; max: number } | null>(null);
  const [myVerifiedItemId, setMyVerifiedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    const session = getSession();
    const userId = session?.user?.id ?? null;

    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();

    const [catalogRes, valRes, compsRes, listingsRes, eventsRes, sentRes, myItemRes] = await Promise.all([
      (butterbase as any).from('catalog_items').select('*').eq('id', catalogId).maybeSingle(),
      (butterbase as any).from('item_valuations').select('*').eq('catalog_id', catalogId).gte('captured_at', cutoff).order('captured_at', { ascending: true }),
      (butterbase as any).from('market_comps').select('price, sold_at, created_at, confidence_score').eq('catalog_id', catalogId).eq('is_sold', true).gte('created_at', cutoff).order('created_at', { ascending: true }),
      (butterbase as any).from('listings').select('current_price').eq('catalog_id', catalogId).eq('status', 'active'),
      (butterbase as any).from('events').select('*').eq('catalog_id', catalogId).order('event_date', { ascending: true }),
      (butterbase as any).from('sentiment_signals').select('*').eq('catalog_id', catalogId).order('captured_at', { ascending: false }).limit(1),
      userId
        ? (butterbase as any).from('items').select('id').eq('catalog_id', catalogId).eq('scan_status', 'verified').eq('user_id', userId).limit(1)
        : Promise.resolve({ data: [] }),
    ]);

    const cat = catalogRes.data;
    const vals: any[] = valRes.data ?? [];
    const comps: any[] = compsRes.data ?? [];
    const activeListings: any[] = listingsRes.data ?? [];
    const evtList: any[] = eventsRes.data ?? [];
    const sent = sentRes.data?.[0] ?? null;
    const myItem = (myItemRes as any).data?.[0] ?? null;

    setCatalog(cat);
    setValuations(vals);
    setLatestVal(vals[vals.length - 1] ?? null);
    setEvents(evtList);
    setSentiment(sent);
    setMyVerifiedItemId(myItem?.id ?? null);

    if (activeListings.length > 0) {
      const prices = activeListings.map((l: any) => parseFloat(l.current_price));
      setListingBand({ min: Math.min(...prices), max: Math.max(...prices) });
    }

    // Build 90-day chart data
    const dates = days90();
    const compsByDate = new Map<string, number[]>();
    for (const c of comps) {
      const d = (c.sold_at ?? c.created_at).slice(0, 10);
      if (!compsByDate.has(d)) compsByDate.set(d, []);
      compsByDate.get(d)!.push(parseFloat(c.price));
    }
    const valsByDate = new Map<string, number>();
    for (const v of vals) {
      valsByDate.set(v.captured_at.slice(0, 10), parseFloat(v.fair_value));
    }

    const band = activeListings.length > 0
      ? { min: Math.min(...activeListings.map((l: any) => parseFloat(l.current_price))), max: Math.max(...activeListings.map((l: any) => parseFloat(l.current_price))) }
      : null;

    const built = dates.map(date => {
      const dayComps = compsByDate.get(date);
      const avgComp = dayComps ? dayComps.reduce((a, b) => a + b, 0) / dayComps.length : null;
      return {
        date,
        fairValue: valsByDate.get(date) ?? null,
        soldComp: avgComp,
        listingMin: band?.min ?? null,
        listingSpread: band ? Math.max(0, band.max - band.min) : null,
      };
    });

    setChartData(built);
    setLoading(false);
  }, [catalogId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Real-time: refresh when new valuation is written
  useEffect(() => {
    const token = getSession()?.accessToken;
    if (!token || !catalogId) return;
    const ws = new WebSocket(`wss://api.butterbase.ai/v1/app_w2wmfcnqn2j2/realtime?token=${encodeURIComponent(token)}`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', table: 'item_valuations', filter: { catalog_id: catalogId } }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'change' && msg.op === 'INSERT') {
          const v = msg.record;
          setValuations(prev => [...prev, v]);
          setLatestVal(v);
        }
      } catch {}
    };
    return () => { ws.close(); };
  }, [catalogId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="h-10 w-64 bg-zinc-800 rounded-lg animate-pulse" />
          <div className="grid grid-cols-5 gap-4">{[1,2,3,4,5].map(i => <div key={i} className="h-24 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>
          <div className="h-80 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Catalog item not found.</p>
      </div>
    );
  }

  const fairValue = latestVal ? parseFloat(latestVal.fair_value) : null;
  const str = latestVal ? parseFloat(latestVal.sell_through_rate ?? '0') : 0;
  const momentum = latestVal ? parseFloat(latestVal.momentum ?? '0') : 0;
  const confidence = latestVal ? parseFloat(latestVal.confidence_score ?? '0') : 0;
  const sentMult = sentiment ? parseFloat(sentiment.trend_multiplier ?? '1') : 1;

  const demand = demandLabel(str);
  const conf = confidenceLabel(confidence);
  const sent = sentimentLabel(sentMult);

  const momPct = momentum * 100;
  const momColor = momPct > 0 ? 'text-emerald-400' : momPct < 0 ? 'text-red-400' : 'text-zinc-400';
  const momLabel = momPct > 0 ? `+${momPct.toFixed(1)}%` : `${momPct.toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto p-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-zinc-600 mb-6">
          <Link href="/dashboard/market" className="hover:text-zinc-300 transition-colors">Market</Link>
          <span>/</span>
          <span className="text-zinc-400">{catalog.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start gap-5 mb-8">
          {catalog.reference_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalog.reference_image_url} alt={catalog.name}
              className="w-16 h-22 rounded-lg border border-zinc-700 object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white">{catalog.name}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {[catalog.group_name, catalog.album, catalog.version].filter(Boolean).join(' · ')}
            </p>
            {catalog.rarity_tier && (
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-violet-900/30 border border-violet-800 text-violet-300">
                {catalog.rarity_tier}
              </span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {myVerifiedItemId && (
              <Link href={`/dashboard/inventory/${myVerifiedItemId}/list`}
                className="rounded-md bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition-colors">
                List This Item
              </Link>
            )}
            <Link href={`/dashboard/buy-orders/new?catalog=${catalogId}`}
              className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors">
              Create Buy Order
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="sm:col-span-1 rounded-xl bg-zinc-900 border border-violet-800/50 p-4 space-y-1">
            <p className="text-xs text-zinc-500 font-medium">Fair Value</p>
            <p className="text-3xl font-bold text-violet-300 leading-tight">{fmtUSD(fairValue)}</p>
            {latestVal && <p className="text-xs text-zinc-600">Updated {new Date(latestVal.captured_at).toLocaleDateString()}</p>}
          </div>
          <StatCard label="Sell-Through Rate" value={str > 0 ? `${(str * 100).toFixed(0)}%` : '—'}
            sub={demand.label} subColor={demand.color} />
          <StatCard label="14-Day Momentum" value={<span className={momColor}>{momPct !== 0 ? momLabel : '—'}</span>} />
          <StatCard
            label="Data Confidence" value={<span className={conf.color}>{conf.label}</span>}
            tooltip={latestVal ? `Based on recent market sales. Confidence: ${(confidence * 100).toFixed(0)}%.` : 'No data yet'}
          />
          <StatCard label="Sentiment Signal" value={<span className={sent.color}>{sent.label}</span>}
            sub={sentiment?.entity_name ?? undefined} />
        </div>

        {/* Chart */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-400">Price History — 90 Days</h2>
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-violet-500 inline-block" />Fair value</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Sold comps</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-violet-500/20 inline-block rounded" />Active listings</span>
            </div>
          </div>
          {chartData.every(d => d.fairValue == null) ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-zinc-600 text-sm">No pricing data yet for this item.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false}
                  interval={14} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${v}`} width={50} />
                <Tooltip content={<CustomTooltip />} />

                {/* Listing price band */}
                <Area type="monotone" dataKey="listingMin" name="Listing min" fill="transparent" stroke="none" stackId="band" legendType="none" />
                <Area type="monotone" dataKey="listingSpread" name="Listing range" fill="rgba(124,58,237,0.12)"
                  stroke="rgba(124,58,237,0.3)" strokeWidth={1} stackId="band" legendType="none" />

                {/* Fair value line */}
                <Line type="monotone" dataKey="fairValue" name="Fair value" stroke="#7c3aed"
                  strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, fill: '#7c3aed' }} />

                {/* Sold comps scatter */}
                <Scatter dataKey="soldComp" name="Sold comp" fill="#f59e0b" shape={(p: any) => (
                  <circle cx={p.cx} cy={p.cy} r={4} fill="#f59e0b" fillOpacity={0.8} />
                )} />

                {/* Event reference lines */}
                {events.map(e => (
                  <ReferenceLine key={e.id} x={e.event_date} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ value: e.event_type.replace(/_/g, ' '), fill: '#ef4444', fontSize: 9, position: 'insideTopLeft' }} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Active listings band info */}
        {listingBand && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-3.5 flex items-center gap-6">
            <div className="text-xs text-zinc-500">Active listing range</div>
            <div className="text-sm font-semibold text-white">{fmtUSD(listingBand.min)} — {fmtUSD(listingBand.max)}</div>
            {fairValue && <div className={`text-xs font-medium ${listingBand.min <= fairValue ? 'text-emerald-400' : 'text-orange-400'}`}>
              Floor is {listingBand.min <= fairValue ? 'at or below' : 'above'} fair value
            </div>}
          </div>
        )}

        {/* Upcoming events */}
        {events.length > 0 && (
          <div className="mt-5 rounded-xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">Upcoming sentiment events</h3>
            <div className="space-y-2">
              {events.filter(e => new Date(e.event_date) >= new Date()).map(e => (
                <div key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="text-red-400 font-mono text-xs">{e.event_date}</span>
                  <span className="text-white">{e.entity_name}</span>
                  <span className="text-zinc-500 text-xs">{e.event_type.replace(/_/g, ' ')}</span>
                  <span className="ml-auto text-emerald-400 text-xs font-medium">+{(parseFloat(e.multiplier_boost) * 100).toFixed(0)}% demand</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
