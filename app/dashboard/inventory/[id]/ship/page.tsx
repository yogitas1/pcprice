'use client';

import { useState, useEffect, useCallback } from 'react';
import { butterbase } from '@/lib/butterbase';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

const GRADE_LABELS: Record<number, string> = {
  1: 'Fair', 2: 'Good', 3: 'Excellent', 4: 'Near Mint', 5: 'Mint',
};

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Other'];

async function getToken(): Promise<string | null> {
  const session = await butterbase.auth.getSession();
  return (session as any).data?.session?.access_token ?? null;
}

interface Rate {
  id: string;
  carrier: string;
  service: string;
  rate: number;
  delivery_days: number | null;
  est_delivery_date: string | null;
}

interface Transaction {
  id: string;
  sale_price: number;
  ship_by_deadline: string | null;
  tracking_number: string | null;
  carrier: string | null;
  label_url: string | null;
  tracker_id: string | null;
  easypost_shipment_id: string | null;
  buyer_name: string | null;
  buyer_city: string | null;
  buyer_state: string | null;
  catalog_name: string | null;
  condition_grade: number | null;
  photos: string[] | null;
}

// Mandatory disclaimer — identical in both label and self-ship paths per spec
function ShippingDisclaimer() {
  return (
    <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-4 py-3 space-y-1.5">
      <p className="text-amber-400 text-sm font-semibold flex items-center gap-2">
        <span>⚠️</span> Shipping responsibility
      </p>
      <p className="text-amber-300/80 text-xs leading-relaxed">
        PCPrice does not cover lost, damaged, delayed, or misdelivered packages. Once the carrier accepts your shipment,
        PCPrice bears no liability. Add carrier insurance below to protect this shipment — we strongly recommend it for any item valued over $25.
      </p>
    </div>
  );
}

type ShipStep =
  | 'loading'
  | 'not_found'
  | 'already_shipped'
  | 'choose_method'
  | 'loading_rates'
  | 'select_rate'
  | 'buying_label'
  | 'label_done'
  | 'self_ship'
  | 'registering'
  | 'tracking_done';

export default function ShipPage({ params }: { params: { id: string } }) {
  const itemId = params.id;

  const [step, setStep] = useState<ShipStep>('loading');
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [carrierInput, setCarrierInput] = useState('USPS');
  const [error, setError] = useState<string | null>(null);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [trackingResult, setTrackingResult] = useState<string | null>(null);

  const loadTransaction = useCallback(async () => {
    const token = await getToken();
    // Fetch transaction via butterbase client (seller sees their own transactions via RLS)
    const { data: txList } = await butterbase
      .from<any>('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!txList) { setStep('not_found'); return; }

    // Find the transaction for this item (join via listing)
    // We need the listing's item_id — query listings for this item
    const { data: listingData } = await butterbase
      .from<any>('listings')
      .select('id')
      .eq('item_id', itemId)
      .limit(5);

    const listingIds = (listingData ?? []).map((l: any) => l.id);
    if (!listingIds.length) { setStep('not_found'); return; }

    const tx = txList.find((t: any) => listingIds.includes(t.listing_id));
    if (!tx) { setStep('not_found'); return; }

    // Load buyer info + catalog info via separate queries
    const [buyerRes, listingFullRes] = await Promise.all([
      butterbase.from<any>('user_profiles').select('display_name, shipping_address').eq('user_id', tx.buyer_id).limit(1),
      butterbase.from<any>('listings').select('item_id').eq('id', tx.listing_id).limit(1)
    ]);
    const buyer = buyerRes.data?.[0];
    const addr = buyer?.shipping_address;

    // Get catalog name via item → catalog_items
    const { data: itemData } = await butterbase
      .from<any>('items')
      .select('catalog_id, condition_grade, photos')
      .eq('id', itemId)
      .limit(1);
    const item = itemData?.[0];

    let catalogName = null;
    if (item?.catalog_id) {
      const { data: catData } = await butterbase
        .from<any>('catalog_items')
        .select('name')
        .eq('id', item.catalog_id)
        .limit(1);
      catalogName = catData?.[0]?.name ?? null;
    }

    setTransaction({
      id: tx.id,
      sale_price: parseFloat(tx.sale_price),
      ship_by_deadline: tx.ship_by_deadline ?? null,
      tracking_number: tx.tracking_number ?? null,
      carrier: tx.carrier ?? null,
      label_url: tx.label_url ?? null,
      tracker_id: tx.tracker_id ?? null,
      easypost_shipment_id: tx.easypost_shipment_id ?? null,
      buyer_name: buyer?.display_name ?? null,
      buyer_city: addr?.city ?? null,
      buyer_state: addr?.state ?? null,
      catalog_name: catalogName,
      condition_grade: item?.condition_grade ?? null,
      photos: item?.photos ?? null,
    });

    if (tx.tracking_number) {
      setStep('already_shipped');
    } else {
      setStep('choose_method');
    }
  }, [itemId]);

  useEffect(() => { loadTransaction(); }, [loadTransaction]);

  const handleLoadRates = async () => {
    if (!transaction) return;
    setStep('loading_rates');
    setError(null);
    const token = await getToken();
    const res = await fetch(`${BB_BASE}/get-shipping-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transaction_id: transaction.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to load rates.');
      setStep('choose_method');
      return;
    }
    setRates(data.rates ?? []);
    setStep('select_rate');
  };

  const handleBuyLabel = async () => {
    if (!transaction || !selectedRateId) return;
    setStep('buying_label');
    setError(null);
    const token = await getToken();
    const res = await fetch(`${BB_BASE}/buy-label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transaction_id: transaction.id, rate_id: selectedRateId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to purchase label.');
      setStep('select_rate');
      return;
    }
    setLabelUrl(data.label_url);
    setTrackingResult(data.tracking_number);
    setStep('label_done');
  };

  const handleRegisterTracking = async () => {
    if (!transaction || !trackingInput.trim()) return;
    setStep('registering');
    setError(null);
    const token = await getToken();
    const res = await fetch(`${BB_BASE}/register-tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transaction_id: transaction.id, tracking_number: trackingInput.trim(), carrier: carrierInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to register tracking.');
      setStep('self_ship');
      return;
    }
    setTrackingResult(trackingInput.trim());
    setStep('tracking_done');
  };

  const selectedRate = rates.find((r) => r.id === selectedRateId);

  // --- Loading ---
  if (step === 'loading') {
    return (
      <div className="p-8">
        <div className="h-64 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
      </div>
    );
  }

  // --- Not found ---
  if (step === 'not_found') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-2">Ship order</h1>
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-8 text-center">
          <p className="text-zinc-400 text-sm">No pending shipment found for this item.</p>
          <p className="text-zinc-600 text-xs mt-1">The item may not have sold yet, or was already shipped.</p>
        </div>
      </div>
    );
  }

  const tx = transaction!;
  const shipByStr = tx.ship_by_deadline
    ? new Date(tx.ship_by_deadline).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : null;

  const isOverdue = tx.ship_by_deadline && new Date(tx.ship_by_deadline) < new Date();

  return (
    <div className="p-8 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Ship order</h1>
        <p className="text-zinc-400 text-sm mt-1">Complete this step to release your payout.</p>
      </div>

      {/* Order summary */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Order summary</h2>
        <div className="flex gap-4">
          {tx.photos?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tx.photos[0]} alt="" className="w-14 h-20 object-cover rounded-md shrink-0" />
          )}
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-white font-medium text-sm">{tx.catalog_name ?? 'Item'}</p>
            {tx.condition_grade && (
              <p className="text-zinc-400 text-xs">Grade {tx.condition_grade}/5 — {GRADE_LABELS[tx.condition_grade] ?? ''}</p>
            )}
            <p className="text-zinc-400 text-xs">
              Sale price: <span className="text-white font-medium">${tx.sale_price.toFixed(2)}</span>
            </p>
            {(tx.buyer_city || tx.buyer_name) && (
              <p className="text-zinc-400 text-xs">
                Buyer: {[tx.buyer_name, tx.buyer_city && tx.buyer_state && `${tx.buyer_city}, ${tx.buyer_state}`].filter(Boolean).join(' — ')}
              </p>
            )}
          </div>
        </div>
        {shipByStr && (
          <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
            isOverdue
              ? 'bg-red-900/30 border border-red-800 text-red-400'
              : 'bg-violet-900/20 border border-violet-800 text-violet-300'
          }`}>
            {isOverdue ? '⚠️ Overdue — ' : '📅 Ship by: '}{shipByStr}
          </div>
        )}
      </div>

      {/* Already shipped */}
      {step === 'already_shipped' && (
        <div className="rounded-xl bg-green-900/20 border border-green-800 p-5 space-y-3">
          <p className="text-green-300 font-semibold">✓ Shipment registered</p>
          <div className="text-sm text-zinc-400 space-y-1">
            {tx.tracking_number && (
              <p>Tracking: <span className="text-white font-mono">{tx.tracking_number}</span></p>
            )}
            {tx.carrier && <p>Carrier: <span className="text-zinc-300">{tx.carrier}</span></p>}
          </div>
          {tx.label_url && (
            <a
              href={tx.label_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-3 py-1.5 transition-colors"
            >
              Download label →
            </a>
          )}
          <p className="text-xs text-zinc-500">
            The buyer will be notified when tracking shows delivered. Payout releases 3 days after confirmed delivery.
          </p>
        </div>
      )}

      {/* Choose method */}
      {step === 'choose_method' && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Choose shipping method</h2>
          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-2 text-sm text-red-400 mb-3">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleLoadRates}
              className="rounded-xl bg-zinc-900 border border-zinc-700 hover:border-violet-700 p-4 text-left transition-colors group"
            >
              <div className="text-2xl mb-2">📦</div>
              <p className="text-white font-medium text-sm group-hover:text-violet-300 transition-colors">Buy prepaid label</p>
              <p className="text-zinc-500 text-xs mt-1">Get USPS, UPS, or FedEx rates. Print and drop off — we register tracking automatically.</p>
            </button>
            <button
              onClick={() => setStep('self_ship')}
              className="rounded-xl bg-zinc-900 border border-zinc-700 hover:border-violet-700 p-4 text-left transition-colors group"
            >
              <div className="text-2xl mb-2">✏️</div>
              <p className="text-white font-medium text-sm group-hover:text-violet-300 transition-colors">Self-ship</p>
              <p className="text-zinc-500 text-xs mt-1">Use your own carrier and label. Enter a tracking number to register updates.</p>
            </button>
          </div>
        </div>
      )}

      {/* Loading rates */}
      {step === 'loading_rates' && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-8 text-center">
          <div className="text-2xl mb-2 animate-pulse">📦</div>
          <p className="text-zinc-400 text-sm">Fetching shipping rates…</p>
        </div>
      )}

      {/* Rate selection */}
      {step === 'select_rate' && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Select a rate</h2>
          {rates.length === 0 ? (
            <p className="text-zinc-500 text-sm">No rates available. Please enter the buyer's address in their account settings.</p>
          ) : (
            <div className="space-y-2">
              {rates.map((rate) => (
                <button
                  key={rate.id}
                  onClick={() => setSelectedRateId(rate.id)}
                  className={`w-full rounded-lg border px-4 py-3 flex items-center justify-between text-left transition-colors ${
                    selectedRateId === rate.id
                      ? 'bg-violet-900/30 border-violet-700'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div>
                    <p className="text-white text-sm font-medium">{rate.carrier} {rate.service}</p>
                    <p className="text-zinc-500 text-xs">
                      {rate.delivery_days ? `${rate.delivery_days} day${rate.delivery_days !== 1 ? 's' : ''}` : 'Estimated delivery varies'}
                      {rate.est_delivery_date ? ` · by ${new Date(rate.est_delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    </p>
                  </div>
                  <span className="text-white font-semibold">${rate.rate.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          {selectedRateId && (
            <div className="space-y-4">
              <ShippingDisclaimer />
              <button
                onClick={handleBuyLabel}
                className="w-full rounded-md bg-violet-600 hover:bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                Buy label — ${selectedRate?.rate.toFixed(2)}
              </button>
              <button
                onClick={() => { setSelectedRateId(null); setStep('choose_method'); }}
                className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      )}

      {/* Buying label spinner */}
      {step === 'buying_label' && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-8 text-center">
          <div className="text-2xl mb-2 animate-pulse">💳</div>
          <p className="text-zinc-400 text-sm">Purchasing label…</p>
        </div>
      )}

      {/* Label purchased */}
      {step === 'label_done' && (
        <div className="rounded-xl bg-green-900/20 border border-green-800 p-5 space-y-3">
          <p className="text-green-300 font-semibold text-base">✓ Label purchased</p>
          {trackingResult && (
            <p className="text-sm text-zinc-400">
              Tracking: <span className="text-white font-mono">{trackingResult}</span>
            </p>
          )}
          {labelUrl && (
            <a
              href={labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-violet-700/30 hover:bg-violet-700/50 border border-violet-700 text-violet-300 px-4 py-2 text-sm font-medium transition-colors"
            >
              Download & print label →
            </a>
          )}
          <p className="text-xs text-zinc-500 leading-relaxed">
            Drop off at any {selectedRate?.carrier ?? 'carrier'} location. Tracking updates automatically — the buyer will be notified on delivery.
            Your payout releases 3 days after confirmed delivery.
          </p>
        </div>
      )}

      {/* Self-ship form */}
      {step === 'self_ship' && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Enter tracking details</h2>
          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-2 text-sm text-red-400">{error}</div>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">Tracking number</label>
              <input
                type="text"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="e.g. 9400111899223397987318"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-violet-600 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-300 mb-1.5">Carrier</label>
              <select
                value={carrierInput}
                onChange={(e) => setCarrierInput(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 text-white px-3 py-2.5 text-sm focus:outline-none focus:border-violet-600 transition-colors"
              >
                {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Mandatory disclaimer — identical to label path per spec */}
          <ShippingDisclaimer />

          <div className="flex gap-3">
            <button
              onClick={handleRegisterTracking}
              disabled={!trackingInput.trim()}
              className="flex-1 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              Register tracking
            </button>
            <button
              onClick={() => { setStep('choose_method'); setError(null); }}
              className="px-4 py-2.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-sm transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Registering spinner */}
      {step === 'registering' && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-8 text-center">
          <p className="text-zinc-400 text-sm animate-pulse">Registering tracking…</p>
        </div>
      )}

      {/* Tracking registered */}
      {step === 'tracking_done' && (
        <div className="rounded-xl bg-green-900/20 border border-green-800 p-5 space-y-2">
          <p className="text-green-300 font-semibold">✓ Tracking registered</p>
          {trackingResult && (
            <p className="text-sm text-zinc-400">
              {carrierInput} tracking: <span className="text-white font-mono">{trackingResult}</span>
            </p>
          )}
          <p className="text-xs text-zinc-500 leading-relaxed">
            We'll monitor this shipment and notify the buyer on delivery. Your payout releases 3 days after confirmed delivery.
          </p>
        </div>
      )}
    </div>
  );
}
