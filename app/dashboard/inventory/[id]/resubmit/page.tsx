'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';
import PhotoUploader, { type UploadedPhoto } from '@/components/PhotoUploader';
import type { Item } from '@/lib/types';

interface ItemWithCatalog extends Item {
  catalog_name?: string;
  group_name?: string;
  album?: string;
  version?: string;
}

export default function ResubmitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ItemWithCatalog | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    butterbase
      .from<ItemWithCatalog>('items')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => { if (data) setItem(data); });
  }, [id]);

  const getToken = useCallback(async () => {
    const { data } = await butterbase.auth.refreshSession();
    return data?.access_token ?? '';
  }, []);

  async function submit() {
    if (photos.length < 3) { setError('Upload at least 3 photos'); return; }
    setSubmitting(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(
        'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/resubmit-item',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ item_id: id, photo_urls: photos.map((p) => p.url) }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDone(true);
      setTimeout(() => router.push('/dashboard/inventory'), 2000);
    } catch (e: any) {
      setError(e.message ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="text-5xl">🔄</div>
          <p className="text-white font-semibold">Photos submitted — re-scanning now</p>
          <p className="text-zinc-400 text-sm">Redirecting to inventory…</p>
        </div>
      </div>
    );
  }

  const isRejected = item?.scan_status === 'rejected';
  const limitReached = isRejected && (item?.resubmit_count ?? 0) >= 1;

  return (
    <div className="p-8 max-w-2xl">
      <button
        onClick={() => router.back()}
        className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 block"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-white mb-1">Re-upload photos</h1>
      {item && (
        <p className="text-zinc-400 text-sm mb-6">
          {[item.group_name, item.catalog_name, item.version].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* Context banner */}
      {isRejected && !limitReached && (
        <div className="rounded-lg bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 text-sm mb-6">
          <p className="font-medium mb-1">This card failed authentication</p>
          {(item?.auth_flags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item!.auth_flags!.map((f) => (
                <span key={f} className="text-xs bg-red-900/40 border border-red-700 rounded px-1.5 py-0.5">
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          <p className="text-red-400 text-xs mt-2">
            Upload clearer photos showing the holo pattern, back print, and borders.
            This is your one allowed re-upload for this rejection.
          </p>
        </div>
      )}

      {limitReached && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 px-4 py-3 text-sm mb-6">
          Re-upload limit reached. You may appeal this decision — appeals are coming soon.
        </div>
      )}

      {!limitReached && (
        <>
          <PhotoUploader photos={photos} onChange={setPhotos} maxPhotos={8} />

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          <button
            onClick={submit}
            disabled={photos.length < 3 || submitting}
            className="mt-6 w-full rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit new photos →'}
          </button>
        </>
      )}
    </div>
  );
}
