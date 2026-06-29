'use client';

import { useCallback, useState } from 'react';
import { butterbase } from '@/lib/butterbase';

export interface UploadedPhoto {
  objectId: string;
  url: string;
  preview: string;
  name: string;
}

interface Props {
  photos: UploadedPhoto[];
  onChange: (photos: UploadedPhoto[]) => void;
  maxPhotos?: number;
}

const LABELS = ['Front', 'Back', 'Detail'];

export default function PhotoUploader({ photos, onChange, maxPhotos = 6 }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadFiles = useCallback(async (files: File[]) => {
    const remaining = maxPhotos - photos.length;
    const toUpload = files.slice(0, remaining);
    if (!toUpload.length) return;

    setUploading(true);
    setError('');
    try {
      const results: UploadedPhoto[] = [];
      for (const file of toUpload) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 10 * 1024 * 1024) { setError('Each photo must be under 10 MB'); continue; }

        const { data: uploaded, error: upErr } = await butterbase.storage.upload(file);
        if (upErr || !uploaded) { setError(upErr?.message ?? 'Upload failed'); continue; }

        const { data: urlData } = await butterbase.storage.getDownloadUrl(uploaded.objectId);
        const preview = URL.createObjectURL(file);

        results.push({ objectId: uploaded.objectId, url: urlData?.url ?? '', preview, name: file.name });
      }
      onChange([...photos, ...results]);
    } finally {
      setUploading(false);
    }
  }, [photos, onChange, maxPhotos]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  }, [uploadFiles]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(Array.from(e.target.files));
  };

  const removePhoto = (idx: number) => {
    const next = [...photos];
    URL.revokeObjectURL(next[idx].preview);
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
          dragging ? 'border-violet-500 bg-violet-600/10' : 'border-zinc-700 hover:border-zinc-500'
        }`}
      >
        <span className="text-3xl">📸</span>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-200">
            {uploading ? 'Uploading…' : 'Drop photos here or click to browse'}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Min 3 photos required: front, back, detail shot. Max 10 MB each.
          </p>
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onInputChange}
          disabled={uploading || photos.length >= maxPhotos}
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <div key={p.objectId} className="relative group aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={p.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => removePhoto(i)}
                  className="rounded-full bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-1"
                >
                  Remove
                </button>
              </div>
              <span className="absolute top-1.5 left-1.5 rounded bg-black/70 text-xs text-zinc-300 px-1.5 py-0.5">
                {LABELS[i] ?? `Photo ${i + 1}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < photos.length ? 'bg-violet-500' : 'bg-zinc-700'}`} />
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        {photos.length < 3
          ? `${3 - photos.length} more photo${photos.length === 2 ? '' : 's'} required`
          : `${photos.length} photos uploaded — ready to scan`}
      </p>
    </div>
  );
}
