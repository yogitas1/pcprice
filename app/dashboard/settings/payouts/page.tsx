'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { butterbase, getSession } from '@/lib/butterbase';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

type ConnectStatus = 'loading' | 'not_connected' | 'pending' | 'connected';

function getToken(): string | null {
  return getSession()?.accessToken ?? null;
}

function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-700 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base">Payment & Payout Terms</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-4 text-sm text-zinc-400 leading-relaxed">
          <section>
            <p className="text-zinc-200 font-medium mb-1">Platform Fee</p>
            <p>PCPrice charges an 8% platform fee on every completed sale. This fee is deducted from the sale price before payout to the seller. There are no listing fees or monthly charges.</p>
          </section>
          <section>
            <p className="text-zinc-200 font-medium mb-1">Stripe Connect</p>
            <p>Seller payouts are processed via Stripe Connect. You must complete Stripe's identity verification (KYC) before receiving any payout. PCPrice never stores your banking credentials or identity documents — all KYC is handled directly by Stripe.</p>
          </section>
          <section>
            <p className="text-zinc-200 font-medium mb-1">Escrow & Release</p>
            <p>Funds are held in escrow from the moment a sale completes until delivery is confirmed. Buyers have 3 days after confirmed delivery to confirm receipt or file a dispute. If no action is taken, escrow is automatically released to the seller after 3 days. PCPrice is not responsible for packages lost or damaged in transit.</p>
          </section>
          <section>
            <p className="text-zinc-200 font-medium mb-1">Payout Timing</p>
            <p>Once escrow is released, Stripe sends your payout within 1–2 business days, subject to your Stripe Connect account's standard payout schedule. Stripe may place a hold on new accounts for the first 7 days.</p>
          </section>
          <section>
            <p className="text-zinc-200 font-medium mb-1">Pre-authorized Holds (Buy Orders)</p>
            <p>When placing a buy order, your card is pre-authorized but not charged. The hold expires and is cancelled if no matching item is found within your order window. You will only be charged when a verified match is executed and confirmed by the agent.</p>
          </section>
          <section>
            <p className="text-zinc-200 font-medium mb-1">Disputes & Refunds</p>
            <p>If you receive an item that materially differs from its listed condition or is not delivered, you may file a dispute within the 3-day confirmation window. PCPrice reviews disputes and may issue full or partial refunds at its discretion. Chargebacks filed with your card issuer outside this process may result in account suspension.</p>
          </section>
          <section>
            <p className="text-zinc-200 font-medium mb-1">Off-Platform Payments</p>
            <p>All transactions must be completed through PCPrice. Any off-platform payment requests from other users must be reported immediately. PCPrice will never ask you to send payment outside the platform.</p>
          </section>
          <section>
            <p className="text-zinc-200 font-medium mb-1">Spend Caps</p>
            <p>Spend caps set on buy orders are hard limits. The agent will never exceed your configured cap regardless of match availability. Caps reset or roll over according to the mode you selected (global or per-tier).</p>
          </section>
          <p className="text-zinc-600 text-xs pt-2 border-t border-zinc-800">
            Last updated June 2026. By using PCPrice payments you agree to these terms and Stripe's <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">Connected Account Agreement</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

function PayoutsContent() {
  const searchParams = useSearchParams();
  const [showTerms, setShowTerms] = useState(false);
  const [status, setStatus] = useState<ConnectStatus>('loading');
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setStatus('loading');
    const token = await getToken();
    const res = await fetch(`${BB_BASE}/stripe-connect-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    if (!res.ok) { setStatus('not_connected'); return; }
    const data = await res.json();
    setStripeAccountId(data.stripe_account_id ?? null);
    if (data.charges_enabled) setStatus('connected');
    else if (data.details_submitted) setStatus('pending');
    else setStatus('not_connected');
  };

  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('setup')]);

  const handleConnect = async () => {
    setStarting(true);
    setError(null);
    const token = await getToken();
    const res = await fetch(`${BB_BASE}/stripe-connect-onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    const data = await res.json();
    if (data.already_onboarded) {
      setStatus('connected');
      setStripeAccountId(data.stripe_account_id);
      setStarting(false);
      return;
    }
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error ?? 'Failed to start onboarding. Please try again.');
      setStarting(false);
    }
  };

  return (
    <div className="p-8 max-w-xl">
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Payout Settings</h1>
        <button
          onClick={() => setShowTerms(true)}
          className="text-xs text-zinc-500 hover:text-violet-400 underline transition-colors mt-1"
        >
          Terms &amp; Conditions
        </button>
      </div>
      <p className="text-zinc-400 text-sm mb-8">
        Connect your bank account to receive payouts when your items sell.
      </p>

      {status === 'loading' && (
        <div className="h-40 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
      )}

      {status === 'connected' && (
        <div className="rounded-xl bg-green-900/20 border border-green-800 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-900/50 border border-green-700 flex items-center justify-center text-green-400 font-bold">✓</div>
            <div>
              <p className="text-green-300 font-semibold">Payouts connected</p>
              <p className="text-green-600 text-xs mt-0.5">Bank account linked and ready to receive payouts.</p>
            </div>
          </div>
          {stripeAccountId && (
            <p className="text-xs text-zinc-600 font-mono">Account ID: {stripeAccountId}</p>
          )}
          <p className="text-xs text-zinc-500 leading-relaxed">
            Payouts are sent within 1–2 business days after a buyer confirms delivery or the 3-day auto-release window closes.
            PCPrice retains an 8% platform fee.
          </p>
          <button
            onClick={handleConnect}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors"
          >
            Re-link or update bank account →
          </button>
        </div>
      )}

      {status === 'pending' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-yellow-900/20 border border-yellow-800 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-yellow-900/50 border border-yellow-700 flex items-center justify-center text-yellow-400 text-sm">⏳</div>
              <div>
                <p className="text-yellow-300 font-semibold">Verification in progress</p>
                <p className="text-yellow-600 text-xs mt-0.5">Stripe is reviewing your information (1–2 business days).</p>
              </div>
            </div>
            <button
              onClick={handleConnect}
              disabled={starting}
              className="text-xs text-yellow-400 hover:text-yellow-300 underline transition-colors disabled:opacity-50"
            >
              {starting ? 'Redirecting…' : 'Continue onboarding if incomplete →'}
            </button>
          </div>
          <div className="rounded-xl bg-amber-900/20 border border-amber-800 px-4 py-3 text-xs text-amber-400">
            ⚠️ Payouts are held until verification completes. Your listings remain visible.
          </div>
        </div>
      )}

      {status === 'not_connected' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <h2 className="text-white font-semibold text-base mb-2">Connect your bank account</h2>
            <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
              PCPrice uses Stripe to handle payouts. You'll be redirected to Stripe's secure hosted portal to verify your identity and link your bank account.
            </p>
            <div className="space-y-1.5 text-xs text-zinc-500 mb-5">
              <p>✓ Stripe-hosted KYC — PCPrice never sees your identity documents</p>
              <p>✓ Bank-level encryption and fraud protection</p>
              <p>✓ Direct deposit within 1–2 business days of release</p>
              <p>✓ 8% platform fee deducted before payout</p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/20 border border-red-800 px-3 py-2 text-sm text-red-400 mb-4">
                {error}
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={starting}
              className="flex items-center gap-2 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              {starting ? (
                'Redirecting to Stripe…'
              ) : (
                <>
                  <span>Connect with Stripe</span>
                  <span className="text-violet-300">→</span>
                </>
              )}
            </button>
          </div>

          <div className="rounded-xl bg-red-900/20 border border-red-800 px-4 py-3 text-xs text-red-400">
            ⚠️ You cannot receive payouts until this is complete. Sale proceeds will be held until your account is connected.
          </div>
        </div>
      )}
    </div>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={<div className="p-8"><div className="h-40 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" /></div>}>
      <PayoutsContent />
    </Suspense>
  );
}
