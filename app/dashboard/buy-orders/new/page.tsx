'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, CardElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { butterbase, getSession } from '@/lib/butterbase';
import { GRADE_LABELS, GRADE_FRACTION } from '@/lib/grades';
import type { CatalogItem } from '@/lib/types';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

const TIER_OPTIONS: { value: string; label: string; score: string; desc: string }[] = [
  {
    value: 'new',
    label: 'Any Seller',
    score: '0–30',
    desc: 'Sellers with no verified track record. Widest selection, lowest barrier to entry.',
  },
  {
    value: 'verified',
    label: 'Verified+',
    score: '31–55',
    desc: 'Completed identity verification with a positive selling history.',
  },
  {
    value: 'trusted',
    label: 'Trusted+',
    score: '56–79',
    desc: 'Established sellers — zero disputes, consistent positive reviews.',
  },
  {
    value: 'power_seller',
    label: 'Power Seller Only',
    score: '80–100',
    desc: 'Top 10% of sellers. High-volume, near-perfect track record.',
  },
];

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#f4f4f5',
      fontSize: '14px',
      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
      '::placeholder': { color: '#52525b' },
      iconColor: '#7c3aed',
    },
    invalid: { color: '#f87171' },
  },
};

type TierKey = 'new' | 'verified' | 'trusted' | 'power_seller';
type SpendCapMode = '' | 'global' | 'per_tier';
type FormStep = 'form' | 'submitting' | 'success' | 'error';

function BuyOrderForm() {
  const stripe = useStripe();
  const elements = useElements();

  // Catalog search
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Order criteria
  const [maxPrice, setMaxPrice] = useState('');
  const [minGrade, setMinGrade] = useState(3);
  const [minTier, setMinTier] = useState('new');
  const [executionMode, setExecutionMode] = useState<'auto_buy' | 'approve_to_buy'>('approve_to_buy');

  // Spend cap
  const [spendCapMode, setSpendCapMode] = useState<SpendCapMode>('');
  const [globalCapAmount, setGlobalCapAmount] = useState('');
  const [tierCaps, setTierCaps] = useState<Record<TierKey, string>>({
    new: '', verified: '', trusted: '', power_seller: '',
  });

  // UI state
  const [step, setStep] = useState<FormStep>('form');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Debounced catalog search
  useEffect(() => {
    if (catalogQuery.length < 2) { setCatalogResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await butterbase
        .from<CatalogItem>('catalog_items')
        .select('id, name, group_name, album, version, reference_image_url')
        .ilike('name', `%${catalogQuery}%`)
        .limit(6);
      setCatalogResults(data ?? []);
      setShowDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [catalogQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedCatalog) {
      setErrorMsg('Please select an item from the catalog.');
      return;
    }
    const parsedMax = parseFloat(maxPrice);
    if (!maxPrice || isNaN(parsedMax) || parsedMax <= 0) {
      setErrorMsg('Please enter a valid max price.');
      return;
    }
    if (spendCapMode === 'global' && !(parseFloat(globalCapAmount) > 0)) {
      setErrorMsg('Please enter a global spend cap amount.');
      return;
    }
    if (!stripe || !elements) {
      setErrorMsg('Stripe is not ready yet. Please wait a moment.');
      return;
    }
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMsg('Card element not found.');
      return;
    }

    setStep('submitting');

    // Build spend cap payload
    const spendCapPayload: Record<string, unknown> = {
      spend_cap_mode: spendCapMode || null,
    };
    if (spendCapMode === 'global') {
      spendCapPayload.spend_cap_amount = parseFloat(globalCapAmount);
    } else if (spendCapMode === 'per_tier') {
      const tiers: Record<string, number> = {};
      for (const [k, v] of Object.entries(tierCaps)) {
        if (v && parseFloat(v) > 0) tiers[k] = parseFloat(v);
      }
      if (Object.keys(tiers).length > 0) {
        spendCapPayload.spend_cap_tiers = tiers;
      }
    }

    // 1. Create buy order — backend returns Stripe client_secret
    const token = getSession()?.accessToken ?? null;

    let clientSecret: string | null = null;
    try {
      const createRes = await fetch(`${BB_BASE}/create-buy-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          catalog_id: selectedCatalog.id,
          max_price: parsedMax,
          min_condition_grade: minGrade,
          min_seller_tier: minTier,
          execution_mode: executionMode,
          ...spendCapPayload,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setStep('error');
        setErrorMsg(createData.error ?? 'Failed to create buy order.');
        return;
      }
      clientSecret = createData.client_secret;
    } catch {
      setStep('error');
      setErrorMsg('Network error creating buy order. Please try again.');
      return;
    }

    // 2. Pre-authorize card (manual capture — hold only, not charged)
    if (clientSecret) {
      const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (stripeError) {
        setStep('error');
        setErrorMsg(stripeError.message ?? 'Card authorization failed.');
        return;
      }
    }

    setStep('success');
  };

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-white font-semibold text-xl mb-2">Buy order placed</h2>
        <p className="text-zinc-400 text-sm mb-6 max-w-sm">
          The agent is now searching for a verified match. You'll get a notification when one is found.
        </p>
        <Link
          href="/dashboard/buy-orders"
          className="rounded-md bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          View my orders →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-xl">

      {/* Section 1 — What are you looking for */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
          What are you looking for?
        </h2>
        <div className="relative">
          {selectedCatalog ? (
            <div className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-violet-700 px-4 py-3">
              {selectedCatalog.reference_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedCatalog.reference_image_url}
                  alt=""
                  className="w-10 h-14 object-cover rounded shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{selectedCatalog.name}</p>
                <p className="text-zinc-500 text-xs">
                  {[selectedCatalog.group_name, selectedCatalog.album].filter(Boolean).join(' · ')}
                </p>
                {selectedCatalog.version && (
                  <p className="text-zinc-600 text-xs">{selectedCatalog.version}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCatalog(null); setCatalogQuery(''); }}
                className="text-zinc-500 hover:text-zinc-200 text-sm transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={catalogQuery}
                onChange={(e) => { setCatalogQuery(e.target.value); setShowDropdown(true); }}
                onFocus={() => catalogResults.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Search catalog — e.g. Jisoo, Pikachu, LeBron James…"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 px-4 py-3 text-sm focus:outline-none focus:border-violet-600 transition-colors"
              />
              {showDropdown && catalogResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shadow-2xl">
                  {catalogResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setSelectedCatalog(c);
                        setCatalogQuery('');
                        setShowDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-700 text-left transition-colors"
                    >
                      {c.reference_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.reference_image_url} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-11 rounded bg-zinc-700 shrink-0 flex items-center justify-center text-zinc-600 text-xs">
                          🃏
                        </div>
                      )}
                      <div>
                        <p className="text-white text-sm">{c.name}</p>
                        <p className="text-zinc-500 text-xs">
                          {[c.group_name, c.album, c.version].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {catalogQuery.length >= 2 && catalogResults.length === 0 && (
                <p className="absolute mt-1 text-xs text-zinc-600 px-1">No results. Try a different name.</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Section 2 — Order criteria */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Your criteria</h2>
        <div className="space-y-4">
          {/* Max price */}
          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">Max price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 select-none">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 text-white pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-violet-600 transition-colors"
              />
            </div>
            <p className="text-xs text-zinc-600 mt-1">Agent only buys at or below this price.</p>
          </div>

          {/* Minimum condition */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-zinc-300">Minimum condition</label>
              <span className="text-sm font-medium text-violet-400">
                {GRADE_FRACTION[minGrade]}/5 · {GRADE_LABELS[minGrade]}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={minGrade}
              onChange={(e) => setMinGrade(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1 select-none">
              <span>1/5 Poor</span>
              <span>2/5 Fair</span>
              <span>3/5 Good</span>
              <span>4/5 Excellent</span>
              <span>5/5 Mint</span>
            </div>
          </div>

          {/* Min seller tier */}
          <div>
            <label className="block text-sm text-zinc-300 mb-2">Minimum seller tier</label>
            <div className="space-y-2">
              {TIER_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setMinTier(t.value)}
                  className={`w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors group ${
                    minTier === t.value
                      ? 'border-violet-600 bg-violet-600/10'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    minTier === t.value ? 'border-violet-500 bg-violet-500' : 'border-zinc-600'
                  }`}>
                    {minTier === t.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${minTier === t.value ? 'text-violet-300' : 'text-white'}`}>
                        {t.label}
                      </span>
                      <span className="text-xs text-zinc-600 font-mono">{t.score} pts</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Execution mode */}
          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">When a match is found</label>
            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              {([['approve_to_buy', 'Ask me first'], ['auto_buy', 'Buy automatically']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setExecutionMode(mode)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    executionMode === mode
                      ? 'bg-violet-700 text-white'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-1">
              {executionMode === 'approve_to_buy'
                ? "You'll get 24 hours to approve each match before it executes."
                : 'Agent buys immediately when criteria are met, subject to your spend cap.'}
            </p>
          </div>
        </div>
      </div>

      {/* Section 3 — Spend cap */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
          Spend cap <span className="text-zinc-700 font-normal normal-case">(optional)</span>
        </h2>
        <div className="flex gap-2 mb-3 flex-wrap">
          {([
            ['', 'None'],
            ['global', 'Daily global cap'],
            ['per_tier', 'Per seller tier'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setSpendCapMode(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                spendCapMode === val
                  ? 'bg-violet-700/40 border-violet-700 text-violet-300'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {spendCapMode === 'global' && (
          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">Maximum spend per day</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 select-none">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={globalCapAmount}
                onChange={(e) => setGlobalCapAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 text-white pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-violet-600 transition-colors"
              />
            </div>
          </div>
        )}

        {spendCapMode === 'per_tier' && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 mb-2">Max price per purchase, by seller tier. Leave blank for no cap on that tier.</p>
            {(['new', 'verified', 'trusted', 'power_seller'] as TierKey[]).map((tier) => (
              <div key={tier} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-28 shrink-0">
                  {TIER_OPTIONS.find((t) => t.value === tier)?.label}
                </span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 select-none">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={tierCaps[tier]}
                    onChange={(e) => setTierCaps((prev) => ({ ...prev, [tier]: e.target.value }))}
                    placeholder="No cap"
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-700 text-white pl-7 pr-4 py-2 text-sm focus:outline-none focus:border-violet-600 transition-colors"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 4 — Payment pre-auth */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
          Payment pre-authorization
        </h2>
        <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
          We place a temporary hold of up to{' '}
          <span className="text-zinc-300 font-medium">
            ${parseFloat(maxPrice || '0').toFixed(2)}
          </span>{' '}
          on your card. It is only charged when a purchase completes — never before. The hold expires if no match is found within 7 days and is automatically renewed.
        </p>
        <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-4 py-3.5">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-3 text-sm text-red-400">
          {errorMsg}
          {step === 'error' && (
            <button
              type="button"
              onClick={() => { setStep('form'); setErrorMsg(null); }}
              className="ml-3 underline text-red-300 hover:text-red-200"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={step === 'submitting' || !stripe}
        className="w-full rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition-colors"
      >
        {step === 'submitting' ? 'Placing order…' : 'Place buy order'}
      </button>
    </form>
  );
}

export default function NewBuyOrderPage() {
  if (!stripePublishableKey || !stripePromise) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-2">New buy order</h1>
        <div className="rounded-lg bg-yellow-900/20 border border-yellow-800 px-4 py-3 text-sm text-yellow-400 max-w-xl">
          Stripe is not configured. Set <code className="font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in your environment.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">New buy order</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Set your criteria. The agent finds and executes verified matches automatically.
        </p>
      </div>
      <Elements stripe={stripePromise}>
        <BuyOrderForm />
      </Elements>
    </div>
  );
}
