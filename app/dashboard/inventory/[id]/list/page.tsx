'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { butterbase } from '@/lib/butterbase';
import type { Item, CatalogItem } from '@/lib/types';

type Step = 'loading' | 'gate_error' | 'form' | 'price_select' | 'submitting' | 'success';

interface Valuation {
  fair_value: number;
  quick_sale_price: number;
  hold_price: number;
  confidence_score: number;
}

const GRADE_LABEL: Record<number, string> = {
  5: 'Mint', 4: 'Near Mint', 3: 'Excellent', 2: 'Good', 1: 'Fair'
};

const fmt = (n: number) => `$${n.toFixed(2)}`;

export default function ListItemPage() {
  const { id: itemId } = useParams<{ id: string }>();
  const router = useRouter();

  const [step, setStep]           = useState<Step>('loading');
  const [item, setItem]           = useState<Item & { catalog?: CatalogItem } | null>(null);
  const [error, setError]         = useState('');
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [newListingId, setNewListingId] = useState('');

  // Form state
  const [floorPrice,   setFloorPrice]   = useState('');
  const [sellByDate,   setSellByDate]   = useState('');
  const [shippingFrom, setShippingFrom] = useState('');
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [calculating,  setCalculating]  = useState(false);

  // Load item + enforce verified gate
  useEffect(() => {
    butterbase
      .from<Item & { catalog?: CatalogItem }>('items')
      .select('*')
      .eq('id', itemId)
      .single()
      .then(({ data, error: e }) => {
        if (e || !data) { setError('Item not found'); setStep('gate_error'); return; }
        if (data.scan_status !== 'verified') {
          setError(`This item cannot be listed — it must be verified first (current status: ${data.scan_status.replace(/_/g, ' ')}).`);
          setStep('gate_error');
          return;
        }
        setItem(data);
        setStep('form');
      });
  }, [itemId]);

  const getToken = useCallback(async () => {
    const { data } = await butterbase.auth.refreshSession();
    return data?.access_token ?? '';
  }, []);

  // Step 1 submit → call calculate-fair-value → Step 2
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!floorPrice || !sellByDate || !shippingFrom) {
      setError('All fields are required'); return;
    }
    const floor = parseFloat(floorPrice);
    if (isNaN(floor) || floor <= 0) { setError('Enter a valid floor price'); return; }
    if (new Date(sellByDate) <= new Date()) { setError('Sell-by date must be in the future'); return; }

    setError('');
    setCalculating(true);
    try {
      const token = await getToken();
      const res = await fetch(
        'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/calculate-fair-value',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ catalog_id: item!.catalog_id, condition_grade: item!.condition_grade ?? 3 })
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Try response first, then query DB
      let val: Valuation | null = null;
      if (data.fair_value) {
        val = { fair_value: data.fair_value, quick_sale_price: data.quick_sale_price, hold_price: data.hold_price, confidence_score: data.confidence_score ?? 0.5 };
      } else {
        const { data: vals } = await butterbase
          .from<Valuation>('item_valuations')
          .select('fair_value,quick_sale_price,hold_price,confidence_score')
          .eq('catalog_id', item!.catalog_id!)
          .order('captured_at', { ascending: false })
          .limit(1);
        val = vals?.[0] ?? null;
      }

      if (!val) throw new Error('Could not calculate fair value. Try refreshing market data first.');
      setValuation(val);
      setSelectedPrice(val.fair_value); // default to fair value
      setStep('price_select');
    } catch (e: any) {
      setError(e.message ?? 'Failed to calculate prices');
    } finally {
      setCalculating(false);
    }
  }

  // Step 2 submit → create-listing
  async function handleListingSubmit() {
    if (!selectedPrice) { setError('Select a price'); return; }
    const floor = parseFloat(floorPrice);
    if (selectedPrice < floor) {
      setError(`Starting price ($${selectedPrice.toFixed(2)}) cannot be below your floor ($${floor.toFixed(2)})`);
      return;
    }

    setStep('submitting');
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(
        'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/create-listing',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            item_id: itemId,
            floor_price: floor,
            current_price: selectedPrice,
            sell_by_date: new Date(sellByDate).toISOString(),
            shipping_from: shippingFrom
          })
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewListingId(data.listing.id);
      setStep('success');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create listing');
      setStep('price_select');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const catalog = item?.catalog;
  const catalogName = (item as any)?.catalog_name ?? catalog?.name ?? 'Unknown item';
  const gradeLabel = item?.condition_grade != null ? GRADE_LABEL[item.condition_grade] : '';

  if (step === 'loading') {
    return (
      <div className="p-8 max-w-lg">
        <div className="h-6 w-40 bg-zinc-800 rounded animate-pulse mb-6" />
        <div className="h-4 w-64 bg-zinc-800 rounded animate-pulse mb-2" />
        <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  if (step === 'gate_error') {
    return (
      <div className="p-8 max-w-lg">
        <Link href="/dashboard/inventory" className="text-sm text-zinc-500 hover:text-zinc-300 mb-6 block">← Inventory</Link>
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-6">
          <p className="text-red-300 font-semibold mb-1">Cannot create listing</p>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
        <Link href="/dashboard/inventory" className="mt-4 inline-block text-sm text-zinc-400 hover:text-zinc-200">
          Return to inventory →
        </Link>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="p-8 max-w-lg">
        <div className="rounded-xl bg-green-900/20 border border-green-800 p-8 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-white font-bold text-xl mb-2">Listing created</h2>
          <p className="text-zinc-400 text-sm mb-1">{catalogName}</p>
          <p className="text-zinc-400 text-sm mb-6">
            Listed at {fmt(selectedPrice!)} · Floor {fmt(parseFloat(floorPrice))}
          </p>
          <p className="text-green-400 text-sm mb-6">
            The pricing agent will monitor this listing and reprice toward your floor as the sell-by date approaches.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href={`/listings/${newListingId}`}
              className="rounded-md bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              View listing →
            </Link>
            <Link
              href="/dashboard/inventory"
              className="rounded-md bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors"
            >
              Back to inventory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-lg">
      <Link href="/dashboard/inventory" className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 block">
        ← Inventory
      </Link>

      {/* Item header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Create listing</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {catalogName}
          {gradeLabel && <span className="ml-2 text-violet-400 font-medium">{gradeLabel}</span>}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 mb-5">
          {error}
        </div>
      )}

      {/* ── Step 1: Form ────────────────────────────────────────────────────── */}
      {(step === 'form' || step === 'price_select') && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 mb-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Listing parameters
          </h2>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Price floor
                <span className="text-zinc-500 font-normal ml-1">— agent never goes below this</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={floorPrice}
                  onChange={e => setFloorPrice(e.target.value)}
                  placeholder="0.00"
                  disabled={step === 'price_select'}
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 pl-7 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Sell-by date
                <span className="text-zinc-500 font-normal ml-1">— listing expires if not sold by then</span>
              </label>
              <input
                type="date"
                value={sellByDate}
                onChange={e => setSellByDate(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                disabled={step === 'price_select'}
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Shipping from
                <span className="text-zinc-500 font-normal ml-1">— city, state (shown to buyers)</span>
              </label>
              <input
                type="text"
                value={shippingFrom}
                onChange={e => setShippingFrom(e.target.value)}
                placeholder="Los Angeles, CA"
                disabled={step === 'price_select'}
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 disabled:opacity-50"
              />
            </div>

            {step === 'form' && (
              <button
                type="submit"
                disabled={calculating}
                className="w-full rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                {calculating ? 'Calculating prices…' : 'Get price suggestions →'}
              </button>
            )}

            {step === 'price_select' && (
              <button
                type="submit"
                disabled={calculating}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                {calculating ? 'Recalculating…' : 'Recalculate'}
              </button>
            )}
          </form>
        </div>
      )}

      {/* ── Step 2: Price selection ──────────────────────────────────────────── */}
      {step === 'price_select' && valuation && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Choose your starting price
          </h2>
          <p className="text-xs text-zinc-600 mb-5">
            Confidence: {Math.round(valuation.confidence_score * 100)}% · Based on recent eBay comps
          </p>

          <div className="space-y-3 mb-6">
            <PriceOption
              label="Quick Sale"
              price={valuation.quick_sale_price}
              description="Below market — prioritises speed over price"
              selected={selectedPrice === valuation.quick_sale_price}
              disabled={valuation.quick_sale_price < parseFloat(floorPrice)}
              floorViolation={valuation.quick_sale_price < parseFloat(floorPrice)}
              onSelect={() => setSelectedPrice(valuation.quick_sale_price)}
            />
            <PriceOption
              label="Fair Value"
              badge="Recommended"
              price={valuation.fair_value}
              description="Market rate — best balance of speed and return"
              selected={selectedPrice === valuation.fair_value}
              disabled={valuation.fair_value < parseFloat(floorPrice)}
              floorViolation={valuation.fair_value < parseFloat(floorPrice)}
              onSelect={() => setSelectedPrice(valuation.fair_value)}
            />
            <PriceOption
              label="Hold Price"
              price={valuation.hold_price}
              description="Above market — for rare or appreciating items"
              selected={selectedPrice === valuation.hold_price}
              disabled={valuation.hold_price < parseFloat(floorPrice)}
              floorViolation={valuation.hold_price < parseFloat(floorPrice)}
              onSelect={() => setSelectedPrice(valuation.hold_price)}
            />
          </div>

          {selectedPrice !== null && (
            <div className="rounded-lg bg-zinc-800/60 px-4 py-3 mb-4 text-sm">
              <span className="text-zinc-400">Starting price: </span>
              <span className="text-white font-semibold">{fmt(selectedPrice)}</span>
              <span className="text-zinc-500 ml-2">· Floor: {fmt(parseFloat(floorPrice))}</span>
            </div>
          )}

          <button
            onClick={handleListingSubmit}
            disabled={selectedPrice === null || step === 'submitting'}
            className="w-full rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {step === 'submitting' ? 'Creating listing…' : selectedPrice ? `List at ${fmt(selectedPrice)} →` : 'Select a price'}
          </button>
        </div>
      )}
    </div>
  );
}

function PriceOption({
  label, badge, price, description, selected, disabled, floorViolation, onSelect
}: {
  label: string; badge?: string; price: number; description: string;
  selected: boolean; disabled: boolean; floorViolation: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={!disabled ? onSelect : undefined}
      className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
        disabled
          ? 'border-zinc-800 opacity-40 cursor-not-allowed'
          : selected
          ? 'border-violet-600 bg-violet-900/20'
          : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/40 cursor-pointer'
      }`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${selected ? 'text-violet-300' : 'text-white'}`}>{label}</span>
          {badge && (
            <span className="text-xs bg-violet-700/40 text-violet-300 px-1.5 py-0.5 rounded">{badge}</span>
          )}
        </div>
        <span className={`text-lg font-bold ${selected ? 'text-violet-300' : 'text-white'}`}>
          ${price.toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-zinc-500">{description}</p>
      {floorViolation && (
        <p className="text-xs text-red-400 mt-1">Below your floor price — lower your floor to use this option</p>
      )}
    </button>
  );
}
