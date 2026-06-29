'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { butterbase } from '@/lib/butterbase';
import type { CatalogItem } from '@/lib/types';

interface Valuation {
  catalog_id: string;
  fair_value: number;
  quick_sale_price: number;
  hold_price: number;
  sell_through_rate: number;
  momentum: number;
  sentiment_multiplier: number;
  confidence_score: number;
  captured_at: string;
}

interface ChartPoint {
  date: number;
  fairValue?: number;
  quickSale?: number;
  holdPrice?: number;
  activeMin?: number;
  activeMax?: number;
  soldPrice?: number;
}

const CONF_LABEL: Record<string, string> = { '0.9': 'High', '0.6': 'Medium', '0.3': 'Low' };

const fmt  = (n: number) => `$${n.toFixed(2)}`;
const fmtD = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function roundToDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export default function CatalogMarketPage() {
  const { catalogId } = useParams<{ catalogId: string }>();
  const [catalog,   setCatalog]   = useState<CatalogItem | null>(null);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = useCallback(async () => {
    try {
      // Catalog item
      const { data: cat } = await butterbase
        .from<CatalogItem>('catalog_items').select('*').eq('id', catalogId).single();
      if (cat) setCatalog(cat);

      // Latest valuation
      const { data: vals } = await butterbase
        .from<Valuation>('item_valuations').select('*')
        .eq('catalog_id', catalogId)
        .order('captured_at', { ascending: false }).limit(1);
      setValuation(vals?.[0] ?? null);

      // Historical valuations — last 90 days
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: history } = await butterbase
        .from<Valuation>('item_valuations')
        .select('fair_value, quick_sale_price, hold_price, captured_at')
        .eq('catalog_id', catalogId).gte('captured_at', since)
        .order('captured_at', { ascending: true });

      // Sold comps — last 90 days
      const { data: soldComps } = await butterbase
        .from<{ price: number; sold_at: string }>('market_comps')
        .select('price, sold_at')
        .eq('catalog_id', catalogId).eq('is_sold', true)
        .gte('sold_at', since).order('sold_at', { ascending: true });

      // Active comps — current snapshot
      const { data: activeComps } = await butterbase
        .from<{ price: number; listed_at: string; created_at: string }>('market_comps')
        .select('price, listed_at, created_at')
        .eq('catalog_id', catalogId).eq('is_sold', false);

      // ── Build chart dataset ─────────────────────────────────────────────────
      const byDate = new Map<number, ChartPoint>();
      const add = (d: number, patch: Partial<ChartPoint>) =>
        byDate.set(d, { ...(byDate.get(d) ?? { date: d }), ...patch });

      // Trend line (valuations)
      for (const v of history ?? []) {
        const d = roundToDay(new Date(v.captured_at).getTime());
        add(d, { fairValue: v.fair_value, quickSale: v.quick_sale_price, holdPrice: v.hold_price });
      }

      // Active listing range (min/max per day)
      for (const c of activeComps ?? []) {
        const d = roundToDay(new Date(c.listed_at ?? c.created_at).getTime());
        const p = parseFloat(String(c.price));
        const ex = byDate.get(d);
        add(d, {
          activeMin: Math.min(ex?.activeMin ?? Infinity, p),
          activeMax: Math.max(ex?.activeMax ?? 0,       p),
        });
      }

      // Sold comp dots (individual data points — may share a date)
      const soldPoints: ChartPoint[] = (soldComps ?? []).map(c => ({
        date: new Date(c.sold_at).getTime(),
        soldPrice: parseFloat(String(c.price)),
      }));

      const trendPoints = Array.from(byDate.values()).sort((a, b) => a.date - b.date);
      setChartData([...trendPoints, ...soldPoints].sort((a, b) => a.date - b.date));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load market data');
    } finally {
      setLoading(false);
    }
  }, [catalogId]);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, 30_000);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  async function handleRefresh() {
    if (!catalog) return;
    setRefreshing(true);
    setError('');
    try {
      const { data: sd } = await butterbase.auth.refreshSession();
      const token = sd?.access_token ?? '';
      const base  = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';
      const hdr   = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // Parallel: fetch comps + sentiment
      await Promise.all([
        fetch(`${base}/fetch-market-data`, {
          method: 'POST', headers: hdr,
          body: JSON.stringify({ catalog_id: catalogId, catalog_item_name: catalog.name }),
        }),
        fetch(`${base}/fetch-sentiment`, {
          method: 'POST', headers: hdr,
          body: JSON.stringify({ entity_name: catalog.group_name, catalog_id: catalogId }),
        }),
      ]);

      // Then recalculate (depends on fresh comps)
      await fetch(`${base}/calculate-fair-value`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ catalog_id: catalogId, condition_grade: 5 }),
      });

      await fetchData();
    } catch (e: any) {
      setError(e.message ?? 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const confLabel = valuation
    ? CONF_LABEL[String(valuation.confidence_score)] ?? 'Low'
    : '—';
  const confColor = !valuation ? 'text-zinc-500'
    : valuation.confidence_score >= 0.7 ? 'text-green-400'
    : valuation.confidence_score >= 0.5 ? 'text-yellow-400'
    : 'text-zinc-500';
  const strColor = !valuation ? 'text-white'
    : valuation.sell_through_rate > 0.7 ? 'text-green-400'
    : valuation.sell_through_rate < 0.3 ? 'text-red-400'
    : 'text-white';
  const momColor = !valuation ? 'text-white'
    : valuation.momentum > 1.05 ? 'text-green-400'
    : valuation.momentum < 0.95 ? 'text-red-400'
    : 'text-white';

  // ── Custom tooltip ─────────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs space-y-0.5 shadow-xl">
        <p className="text-zinc-400 mb-1 font-medium">{fmtD(label)}</p>
        {payload.map((entry: any) =>
          entry.value != null ? (
            <div key={entry.name} className="flex items-center gap-2">
              <span style={{ color: entry.color }}>■</span>
              <span className="text-zinc-400">{entry.name}:</span>
              <span className="text-white font-semibold">{fmt(entry.value)}</span>
            </div>
          ) : null
        )}
      </div>
    );
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="h-5 w-32 bg-zinc-800 rounded animate-pulse mb-6" />
        <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-80 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link href="/dashboard/market" className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 block">
        ← Market
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-7 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{catalog?.name ?? '—'}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {[catalog?.group_name, catalog?.album, catalog?.version].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors shrink-0"
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh data'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Fair Value"
          value={valuation ? fmt(valuation.fair_value) : '—'}
          sub={
            valuation
              ? `${fmt(valuation.quick_sale_price)} – ${fmt(valuation.hold_price)}`
              : 'quick · hold'
          }
        />
        <StatCard
          label="Sell-Through Rate"
          value={valuation ? `${Math.round(valuation.sell_through_rate * 100)}%` : '—'}
          sub={
            valuation?.sell_through_rate > 0.7 ? 'High demand'
            : valuation?.sell_through_rate < 0.3 ? 'Low demand'
            : '14-day window'
          }
          valueColor={strColor}
        />
        <StatCard
          label="14-Day Momentum"
          value={valuation ? `${valuation.momentum.toFixed(2)}×` : '—'}
          sub={
            valuation?.momentum > 1.05 ? 'Price rising'
            : valuation?.momentum < 0.95 ? 'Price falling'
            : 'Stable'
          }
          valueColor={momColor}
        />
        <StatCard
          label="Confidence"
          value={confLabel}
          sub={valuation ? `${Math.round(valuation.confidence_score * 100)}% · from comps` : 'no data'}
          valueColor={confColor}
        />
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      {chartData.length > 0 ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              90-Day Price Chart
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
              <LegendItem color="#7c3aed" solid label="Fair value" />
              <LegendItem color="#7c3aed" dashed label="Quick / Hold" />
              <LegendItem color="#a78bfa" dot label="Sold comp" />
              <LegendItem color="#52525b" dashed label="Active range" />
            </div>
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={fmtD}
                stroke="#3f3f46"
                tick={{ fill: '#71717a', fontSize: 11 }}
                tickLine={false}
                minTickGap={60}
              />
              <YAxis
                tickFormatter={v => `$${v}`}
                stroke="#3f3f46"
                tick={{ fill: '#71717a', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Active listing range (back layer) */}
              <Line dataKey="activeMax" name="Active High" stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls />
              <Line dataKey="activeMin" name="Active Low"  stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls />

              {/* Fair value band */}
              <Line dataKey="holdPrice"  name="Hold Price" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="5 3" dot={false} connectNulls opacity={0.6} />
              <Line dataKey="quickSale"  name="Quick Sale" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="5 3" dot={false} connectNulls opacity={0.6} />

              {/* Main fair value line */}
              <Line dataKey="fairValue"  name="Fair Value" stroke="#7c3aed" strokeWidth={2.5} dot={false} connectNulls />

              {/* Sold comp dots — no connecting line, only dots */}
              <Line
                dataKey="soldPrice"
                name="Sold comp"
                stroke="transparent"
                strokeWidth={0}
                dot={{ r: 4, fill: '#a78bfa', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#ddd6fe', strokeWidth: 0 }}
                connectNulls={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-white font-semibold mb-1">No price data yet</p>
          <p className="text-zinc-500 text-sm mb-5">
            Fetch eBay comps to populate the chart and calculate fair value.
          </p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-colors"
          >
            {refreshing ? 'Fetching…' : 'Fetch market data →'}
          </button>
        </div>
      )}

      {/* Sentiment note */}
      {valuation?.sentiment_multiplier != null && (
        <p className="text-xs text-zinc-600 mt-4">
          Sentiment multiplier: {valuation.sentiment_multiplier.toFixed(2)}× · Updates every 24h from Reddit r/kpop
        </p>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor = 'text-white' }: {
  label: string; value: string; sub: string; valueColor?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold mb-0.5 ${valueColor}`}>{value}</p>
      <p className="text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

function LegendItem({ color, solid, dashed, dot, label }: {
  color: string; label: string; solid?: boolean; dashed?: boolean; dot?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {dot ? (
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span
          className="inline-block w-4 h-0"
          style={{
            borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
            opacity: dashed ? 0.6 : 1,
          }}
        />
      )}
      {label}
    </span>
  );
}
