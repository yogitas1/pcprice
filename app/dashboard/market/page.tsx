'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { butterbase } from '@/lib/butterbase';
import { RARITY_LABELS, RARITY_COLORS } from '@/lib/rarity';
import type { CatalogItem } from '@/lib/types';

interface CatalogWithValuation extends CatalogItem {
  fair_value?: number;
  confidence_score?: number;
  captured_at?: string;
}

export default function MarketPage() {
  const [items, setItems] = useState<CatalogWithValuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const { data: catalog } = await butterbase
        .from<CatalogItem>('catalog_items')
        .select('*')
        .order('group_name', { ascending: true });

      if (!catalog?.length) { setItems([]); return; }

      // Fetch latest valuation for each catalog_id
      const ids = catalog.map(c => c.id);
      const { data: valuations } = await butterbase
        .from<{ catalog_id: string; fair_value: number; confidence_score: number; captured_at: string }>('item_valuations')
        .select('catalog_id, fair_value, confidence_score, captured_at')
        .in('catalog_id', ids)
        .order('captured_at', { ascending: false });

      const latestByid = new Map<string, { fair_value: number; confidence_score: number; captured_at: string }>();
      for (const v of valuations ?? []) {
        if (!latestByid.has(v.catalog_id)) latestByid.set(v.catalog_id, v);
      }

      setItems(catalog.map(c => ({
        ...c,
        fair_value:       latestByid.get(c.id)?.fair_value,
        confidence_score: latestByid.get(c.id)?.confidence_score,
        captured_at:      latestByid.get(c.id)?.captured_at,
      })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    return `${item.group_name} ${item.name} ${item.album} ${item.version ?? ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Market</h1>
          <p className="text-zinc-400 text-sm mt-1">Live fair values powered by eBay comps + sentiment</p>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by group, album, card name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 mb-6"
      />

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 h-32 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(item => (
            <Link
              key={item.id}
              href={`/dashboard/market/${item.id}`}
              className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 hover:border-violet-700 hover:bg-zinc-800/60 transition-all group"
            >
              <div className="flex items-start gap-3 mb-3">
                {/* Thumbnail */}
                <div className="shrink-0 w-10 rounded overflow-hidden bg-zinc-800" style={{ height: 56 }}>
                  {item.reference_image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={item.reference_image_url} alt={item.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-lg">🃏</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
                      {item.name}
                    </p>
                    {item.rarity_tier && (
                      <span className={`text-xs font-medium shrink-0 ${RARITY_COLORS[item.rarity_tier] ?? 'text-zinc-400'}`}>
                        {RARITY_LABELS[item.rarity_tier] ?? item.rarity_tier}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 truncate mt-0.5">
                    {item.group_name} · {item.album}
                    {item.version ? ` · ${item.version}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between">
                {item.fair_value != null ? (
                  <div>
                    <div className="text-xl font-bold text-white">${item.fair_value.toFixed(2)}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">fair value</div>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600 italic">No data yet</div>
                )}

                {item.confidence_score != null && (
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    item.confidence_score >= 0.7 ? 'bg-green-900/30 text-green-400'
                    : item.confidence_score >= 0.5 ? 'bg-yellow-900/30 text-yellow-400'
                    : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {item.confidence_score >= 0.7 ? 'High' : item.confidence_score >= 0.5 ? 'Med' : 'Low'}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-20 text-zinc-500">No catalog items match your search.</div>
      )}
    </div>
  );
}
