'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { butterbase, getSession } from '@/lib/butterbase';
import PhotoUploader, { type UploadedPhoto } from '@/components/PhotoUploader';
import { RARITY_COLORS, RARITY_LABELS } from '@/lib/rarity';
import type { CatalogItem } from '@/lib/types';

type Step = 'upload' | 'match' | 'submitting' | 'done';

interface MatchResult {
  catalog_match: string;
  group: string;
  album: string;
  card_name: string;
  confidence: number;
  notes: string;
}


export default function NewInventoryPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Fetch catalog for manual selection
  useEffect(() => {
    butterbase.from<CatalogItem>('catalog_items')
      .select('*')
      .order('group_name', { ascending: true })
      .then(({ data }) => { if (data) setCatalogItems(data); });
  }, []);

  async function runCatalogMatch() {
    if (photos.length < 3) return;
    setMatching(true);
    setError('');
    try {
      const token = getSession()?.accessToken ?? '';

      const res = await fetch(
        'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/catalog-match',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ photo_urls: photos.map((p) => p.url) }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setMatchResult(result);

      // Auto-select best catalog match by fuzzy name search
      const needle = `${result.group} ${result.album} ${result.card_name}`.toLowerCase();
      const best = catalogItems.find((c) =>
        `${c.group_name} ${c.album} ${c.name}`.toLowerCase().includes(result.group?.toLowerCase() ?? '')
      );
      if (best) setSelectedCatalogId(best.id);
      setStep('match');
    } catch (err: any) {
      setError(err.message ?? 'Catalog match failed');
    } finally {
      setMatching(false);
    }
  }

  async function submitItem() {
    if (!selectedCatalogId) { setError('Please select a catalog card'); return; }
    setStep('submitting');
    setError('');
    try {
      const token = await getToken();

      // Create the item row
      const { data: item, error: itemErr } = await butterbase
        .from('items')
        .insert({
          catalog_id: selectedCatalogId,
          photos: photos.map((p) => p.url),
          scan_status: 'pending_scan',
        });
      if (itemErr) throw new Error(itemErr.message);

      const itemId = (item as any)?.[0]?.id ?? (item as any)?.id;
      if (!itemId) throw new Error('Item creation failed');

      // Fire-and-forget quality scan
      fetch('https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/quality-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: itemId }),
      });

      setStep('done');
      setTimeout(() => router.push('/dashboard/inventory'), 1500);
    } catch (err: any) {
      setError(err.message ?? 'Submission failed');
      setStep('match');
    }
  }

  function getToken(): string {
    return getSession()?.accessToken ?? '';
  }

  const filteredCatalog = catalogItems.filter((c) => {
    const q = search.toLowerCase();
    return `${c.group_name} ${c.album} ${c.name} ${c.version ?? ''}`.toLowerCase().includes(q);
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="text-5xl">✅</div>
          <p className="text-white font-semibold">Item submitted — scanning now</p>
          <p className="text-zinc-400 text-sm">Redirecting to inventory…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 block">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-white">Add a card to inventory</h1>
        <p className="text-zinc-400 text-sm mt-1">Upload at least 3 photos to begin the quality scan.</p>
      </div>

      {/* Step 1: Upload */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          1 · Photos
        </h2>
        <PhotoUploader photos={photos} onChange={setPhotos} />

        {photos.length >= 3 && step === 'upload' && (
          <button
            onClick={runCatalogMatch}
            disabled={matching}
            className="mt-5 w-full rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {matching ? 'Identifying card…' : 'Identify this card →'}
          </button>
        )}
      </section>

      {/* Step 2: Catalog match */}
      {(step === 'match' || step === 'submitting') && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            2 · Confirm catalog match
          </h2>

          {matchResult && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-4 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-white font-semibold">{matchResult.catalog_match}</p>
                  {matchResult.notes && <p className="text-zinc-400 text-sm mt-1">{matchResult.notes}</p>}
                </div>
                <span className={`text-sm font-medium ${matchResult.confidence >= 0.8 ? 'text-green-400' : matchResult.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {Math.round(matchResult.confidence * 100)}% match
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-zinc-500 mb-2">
            {matchResult ? 'Confirm the match below or select a different card:' : 'Select the catalog card:'}
          </p>
          <input
            type="text"
            placeholder="Search by group, album, name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 mb-2"
          />
          <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-700 divide-y divide-zinc-800">
            {filteredCatalog.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCatalogId(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors ${
                  selectedCatalogId === c.id ? 'bg-violet-600/20 border-l-2 border-violet-500' : ''
                }`}
              >
                {c.reference_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.reference_image_url} alt={c.name} className="w-8 h-11 object-cover rounded shrink-0 bg-zinc-800" />
                ) : (
                  <div className="w-8 h-11 rounded bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600 text-xs">?</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{c.group_name} · {c.album}{c.version ? ` · ${c.version}` : ''}</p>
                </div>
                <span className={`text-xs font-medium shrink-0 ${RARITY_COLORS[c.rarity_tier ?? ''] ?? 'text-zinc-400'}`}>
                  {RARITY_LABELS[c.rarity_tier ?? ''] ?? c.rarity_tier}
                </span>
              </button>
            ))}
          </div>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          <button
            onClick={submitItem}
            disabled={!selectedCatalogId || step === 'submitting'}
            className="mt-5 w-full rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {step === 'submitting' ? 'Submitting…' : 'Confirm & start scan →'}
          </button>
        </section>
      )}

      {error && step === 'upload' && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}
