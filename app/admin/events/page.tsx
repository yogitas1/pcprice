'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { butterbase, getSession } from '@/lib/butterbase';
import Link from 'next/link';

const EVENT_TYPES = ['comeback', 'set_release', 'tournament', 'anniversary', 'movie_release', 'other'];
const EVENT_TYPE_LABELS: Record<string, string> = {
  comeback: 'Comeback', set_release: 'Set Release', tournament: 'Tournament',
  anniversary: 'Anniversary', movie_release: 'Movie Release', other: 'Other',
};

type EventRow = {
  id: string;
  catalog_id: string | null;
  entity_name: string;
  event_type: string;
  event_date: string;
  multiplier_boost: number;
  notes: string | null;
  catalog_name?: string;
};

const EMPTY_FORM = {
  catalog_id: '', catalog_name: '', entity_name: '', event_type: 'set_release',
  event_date: '', multiplier_boost: 0.10, notes: '',
};

function getToken() {
  return getSession()?.accessToken ?? null;
}

function EventForm({
  initial, onSave, onCancel, isSaving,
}: {
  initial: typeof EMPTY_FORM; onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void; isSaving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [catalogSearch, setCatalogSearch] = useState(initial.catalog_name);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const timerRef = useRef<any>(null);

  const searchCatalog = (q: string) => {
    setCatalogSearch(q);
    setForm(f => ({ ...f, catalog_id: '', catalog_name: q }));
    clearTimeout(timerRef.current);
    if (!q.trim()) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      const { data } = await (butterbase as any)
        .from('catalog_items').select('id, name, group_name').ilike('name', `%${q}%`).limit(6);
      setSuggestions(data ?? []);
    }, 300);
  };

  const selectCatalog = (item: any) => {
    setForm(f => ({ ...f, catalog_id: item.id, catalog_name: item.name }));
    setCatalogSearch(item.name);
    setSuggestions([]);
  };

  return (
    <div className="space-y-4 p-5 bg-zinc-900 border border-zinc-700 rounded-xl">
      <div className="grid grid-cols-2 gap-4">
        {/* Catalog typeahead */}
        <div className="relative col-span-2">
          <label className="text-xs text-zinc-400 mb-1 block">Catalog item (optional — leave blank for general events)</label>
          <input
            value={catalogSearch}
            onChange={e => searchCatalog(e.target.value)}
            placeholder="Search catalog…"
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden shadow-xl">
              {suggestions.map(s => (
                <button key={s.id} onClick={() => selectCatalog(s)}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-800 transition-colors">
                  {s.name} <span className="text-zinc-500 text-xs">· {s.group_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Entity name</label>
          <input value={form.entity_name} onChange={e => setForm(f => ({ ...f, entity_name: e.target.value }))}
            placeholder="e.g. BTS, Pokémon Scarlet" required
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 placeholder-zinc-600 focus:outline-none focus:border-violet-600" />
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Event type</label>
          <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-600">
            {EVENT_TYPES.map(t => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Event date</label>
          <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} required
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-600" />
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1 block">
            Multiplier boost: <span className="text-violet-400 font-medium">+{(form.multiplier_boost * 100).toFixed(0)}%</span>
          </label>
          <input type="range" min="0.05" max="0.20" step="0.01" value={form.multiplier_boost}
            onChange={e => setForm(f => ({ ...f, multiplier_boost: parseFloat(e.target.value) }))}
            className="w-full accent-violet-600" />
          <div className="flex justify-between text-xs text-zinc-600 mt-0.5"><span>+5%</span><span>+20%</span></div>
        </div>

        <div className="col-span-2">
          <label className="text-xs text-zinc-400 mb-1 block">Notes (optional)</label>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Context for the sentiment engine…"
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 placeholder-zinc-600 focus:outline-none focus:border-violet-600" />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)} disabled={isSaving || !form.entity_name || !form.event_date}
          className="rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors">
          {isSaving ? 'Saving…' : 'Save event'}
        </button>
        <button onClick={onCancel} className="rounded-md bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    const session = getSession();
    const userId = session?.user?.id ?? null;
    if (!userId) { router.push('/login'); return; }
    const adminCheck = await (butterbase as any).from('admin_users').select('id').eq('user_id', userId).maybeSingle();
    if (!adminCheck.data) { setForbidden(true); setLoading(false); return; }

    const { data } = await (butterbase as any).from('events').select('*, catalog_items(name)').order('event_date', { ascending: true });
    setEvents((data ?? []).map((e: any) => ({ ...e, catalog_name: e.catalog_items?.name ?? null })));
    setLoading(false);
  }, [router]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleSave = async (form: typeof EMPTY_FORM, existingId?: string) => {
    setSaving(true);
    setError(null);
    const payload = {
      catalog_id: form.catalog_id || null,
      entity_name: form.entity_name,
      event_type: form.event_type,
      event_date: form.event_date,
      multiplier_boost: form.multiplier_boost,
      notes: form.notes || null,
    };
    try {
      if (existingId) {
        await (butterbase as any).from('events').update(payload).eq('id', existingId);
      } else {
        await (butterbase as any).from('events').insert(payload);
      }
      setShowAdd(false);
      setEditId(null);
      await loadEvents();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event? This will affect the sentiment engine.')) return;
    await (butterbase as any).from('events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  if (forbidden) {
    return <div className="p-8 text-zinc-500 text-sm">You don't have access to this page.</div>;
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-4">
        <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← Admin dashboard</Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Sentiment Events</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Upcoming events that boost demand signals for specific items.</p>
        </div>
        <button onClick={() => { setShowAdd(true); setEditId(null); }}
          className="rounded-md bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition-colors">
          + Add event
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 text-sm">{error}</div>}

      {showAdd && (
        <div className="mb-6">
          <EventForm initial={EMPTY_FORM} onSave={(form) => handleSave(form)} onCancel={() => setShowAdd(false)} isSaving={saving} />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>
      ) : events.length === 0 && !showAdd ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center">
          <p className="text-zinc-400 font-medium mb-1">No events seeded yet</p>
          <p className="text-zinc-600 text-sm">Add upcoming releases, comebacks, and tournaments to boost demand signals.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <div key={event.id}>
              {editId === event.id ? (
                <EventForm
                  initial={{ catalog_id: event.catalog_id ?? '', catalog_name: event.catalog_name ?? '', entity_name: event.entity_name, event_type: event.event_type, event_date: event.event_date, multiplier_boost: parseFloat(String(event.multiplier_boost)), notes: event.notes ?? '' }}
                  onSave={(form) => handleSave(form, event.id)}
                  onCancel={() => setEditId(null)}
                  isSaving={saving}
                />
              ) : (
                <div className="flex items-center gap-4 rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{event.entity_name}</span>
                      <span className="text-xs text-zinc-500">{EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}</span>
                      {event.catalog_name && <span className="text-xs text-violet-400">· {event.catalog_name}</span>}
                    </div>
                    {event.notes && <p className="text-xs text-zinc-600 mt-0.5 truncate">{event.notes}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-white font-mono">{event.event_date}</p>
                    <p className="text-xs text-emerald-400">+{(parseFloat(String(event.multiplier_boost)) * 100).toFixed(0)}%</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setEditId(event.id)}
                      className="rounded px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">Edit</button>
                    <button onClick={() => handleDelete(event.id)}
                      className="rounded px-2.5 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 transition-colors">Del</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
