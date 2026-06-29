'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

type ConnectStatus = 'loading' | 'not_connected' | 'pending' | 'connected';

async function getToken(): Promise<string | null> {
  const session = await butterbase.auth.getSession();
  return (session as any).data?.session?.access_token ?? null;
}

function PayoutsContent() {
  const searchParams = useSearchParams();
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
      <h1 className="text-2xl font-bold text-white mb-1">Payout Settings</h1>
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
