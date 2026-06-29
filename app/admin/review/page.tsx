'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';

interface QueueItem {
  queue_id: string;
  item_id: string;
  flags: string[];
  ai_assessment: string;
  ai_confidence: number;
  queued_at: string;
  photos: string[];
  condition_grade: number | null;
  catalog_name: string;
  group_name: string;
  album: string;
  version: string | null;
  reference_image_url: string | null;
  seller_email: string | null;
  resubmit_count: number;
}

const CRITICAL_FLAGS = new Set([
  'holo_pattern_mismatch', 'print_quality_fail', 'color_mismatch',
  'counterfeit_suspected', 'border_precision_fail',
]);

const GRADE_LABEL: Record<number, string> = { 5: 'Mint', 4: 'Near Mint', 3: 'Excellent', 2: 'Good', 1: 'Fair' };

export default function AdminReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const getToken = useCallback(async () => {
    const { data } = await butterbase.auth.refreshSession();
    return data?.access_token ?? '';
  }, []);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(
        'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/admin-review-queue',
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) { router.replace('/login'); return; }
      if (res.status === 403) { router.replace('/dashboard'); return; }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(json.items ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [getToken, router]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  async function act(queueId: string, itemId: string, action: 'approve' | 'reject' | 'request_photos') {
    setActing(queueId);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(
        'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/admin-review-action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ queue_id: queueId, item_id: itemId, action }),
        }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems((prev) => prev.filter((i) => i.queue_id !== queueId));
    } catch (e: any) {
      setError(e.message ?? 'Action failed');
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Authentication Review Queue</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {loading ? '…' : `${items.length} item${items.length !== 1 ? 's' : ''} pending review`}
            </p>
          </div>
          <button
            onClick={fetchQueue}
            disabled={loading}
            className="rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-2 text-sm text-zinc-300 transition-colors"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 h-72 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="font-semibold text-lg">Queue is empty</h2>
            <p className="text-zinc-400 text-sm mt-1">No items pending manual review.</p>
          </div>
        )}

        {/* Queue items */}
        {!loading && items.length > 0 && (
          <div className="space-y-6">
            {items.map((item) => (
              <div key={item.queue_id} className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
                {/* Item header */}
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{item.catalog_name ?? 'Unknown card'}</p>
                    <p className="text-zinc-400 text-sm truncate">
                      {[item.group_name, item.album, item.version].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {item.condition_grade != null && (
                      <div className="text-right">
                        <div className="text-xl font-bold text-violet-400">{item.condition_grade}/5</div>
                        <div className="text-xs text-zinc-500">{GRADE_LABEL[item.condition_grade] ?? ''}</div>
                      </div>
                    )}
                    <div className="text-right">
                      <div className="text-xs text-zinc-500 mb-0.5">AI confidence</div>
                      <div className={`text-sm font-semibold ${
                        item.ai_confidence >= 0.7 ? 'text-yellow-400'
                        : item.ai_confidence >= 0.5 ? 'text-orange-400'
                        : 'text-red-400'
                      }`}>
                        {Math.round(item.ai_confidence * 100)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Photo comparison */}
                <div className="grid grid-cols-2 divide-x divide-zinc-800 p-5 gap-5">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      Submitted photos
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {(item.photos ?? []).slice(0, 6).map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={url}
                          alt={`Photo ${i + 1}`}
                          className="h-36 w-auto rounded-md border border-zinc-700 shrink-0 object-cover"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pl-5">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      Official reference
                    </p>
                    {item.reference_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.reference_image_url}
                        alt="Reference"
                        className="h-36 w-auto rounded-md border border-zinc-700 object-cover"
                      />
                    ) : (
                      <div className="h-36 w-24 rounded-md border border-dashed border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs">
                        No reference
                      </div>
                    )}
                  </div>
                </div>

                {/* AI assessment + flags */}
                <div className="px-5 pb-4 space-y-3">
                  {item.ai_assessment && (
                    <p className="text-sm text-zinc-300 italic border-l-2 border-zinc-700 pl-3">
                      {item.ai_assessment}
                    </p>
                  )}
                  {(item.flags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.flags.map((f) => (
                        <span
                          key={f}
                          className={`text-xs rounded px-2 py-0.5 border font-medium ${
                            CRITICAL_FLAGS.has(f)
                              ? 'bg-red-900/30 text-red-300 border-red-800'
                              : 'bg-yellow-900/30 text-yellow-300 border-yellow-800'
                          }`}
                        >
                          {f.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-3">
                  <button
                    onClick={() => act(item.queue_id, item.item_id, 'approve')}
                    disabled={acting === item.queue_id}
                    className="rounded-md bg-green-700 hover:bg-green-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
                  >
                    {acting === item.queue_id ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => act(item.queue_id, item.item_id, 'request_photos')}
                    disabled={acting === item.queue_id || (item.resubmit_count ?? 0) >= 1}
                    title={(item.resubmit_count ?? 0) >= 1 ? 'Already re-uploaded once — must approve or reject' : ''}
                    className="rounded-md bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors"
                  >
                    Request Photos
                  </button>
                  <button
                    onClick={() => act(item.queue_id, item.item_id, 'reject')}
                    disabled={acting === item.queue_id}
                    className="rounded-md bg-red-800 hover:bg-red-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
                  >
                    Reject
                  </button>
                  <span className="ml-auto text-xs text-zinc-500">
                    {item.seller_email ?? 'Unknown seller'}
                    {' · '}
                    {new Date(item.queued_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
