'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

const TABS = ['stats', 'queue', 'disputes', 'reports', 'scammer_db'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  stats: 'Platform Stats', queue: 'Review Queue', disputes: 'Disputes',
  reports: 'Reports', scammer_db: 'Scammer DB',
};

async function getToken() {
  const session = await butterbase.auth.getSession();
  return (session as any).data?.session?.access_token ?? null;
}

function StatBlock({ label, value, sub, subColor }: { label: string; value: React.ReactNode; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4 space-y-1">
      <p className="text-xs text-zinc-500 font-medium">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className={`text-xs font-medium ${subColor ?? 'text-zinc-500'}`}>{sub}</p>}
    </div>
  );
}

function PlatformStatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`${BB_BASE}/get-platform-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); setLoading(false); return; }
      setStats(data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-24 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!stats) return null;

  const fmtUSD = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (n: number | null) => n == null ? '—' : `${(Number(n) * 100).toFixed(1)}%`;
  const fmtDays = (n: number | null) => n == null ? '—' : `${Number(n).toFixed(1)}d`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBlock label="All-Time GMV" value={fmtUSD(stats.total_gmv)} />
        <StatBlock label="GMV (30 days)" value={fmtUSD(stats.gmv_30_days)} />
        <StatBlock label="Take-Rate Revenue" value={fmtUSD(stats.take_rate_revenue)} sub="8% on all sales" />
        <StatBlock label="Active Listings" value={stats.active_listings ?? '—'} />
        <StatBlock label="Active Buy Orders" value={stats.active_buy_orders ?? '—'} />
        <StatBlock label="Verification Pass Rate" value={fmtPct(stats.verification_pass_rate)}
          sub={stats.verification_pass_rate > 0.80 ? 'Healthy' : 'Review flags'} subColor={stats.verification_pass_rate > 0.80 ? 'text-emerald-400' : 'text-orange-400'} />
        <StatBlock label="First-Pass Rate" value={fmtPct(stats.first_pass_rate)} />
        <StatBlock label="Avg Days to Sale" value={fmtDays(stats.avg_days_to_sale)} />
      </div>
      {stats.open_disputes > 0 && (
        <div className="rounded-xl bg-red-900/10 border border-red-800/60 px-5 py-4 flex items-center gap-3">
          <span className="text-red-400 text-xl">⚠️</span>
          <p className="text-red-300 text-sm"><span className="font-bold">{stats.open_disputes}</span> open dispute{stats.open_disputes !== 1 ? 's' : ''} requiring attention.</p>
        </div>
      )}
    </div>
  );
}

function ReviewQueueTab() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`${BB_BASE}/admin-review-queue`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setQueue(data?.items ?? []);
      setLoading(false);
    })();
  }, []);

  const doAction = async (itemId: string, action: 'approve' | 'request_photos' | 'reject', note?: string) => {
    const token = await getToken();
    await fetch(`${BB_BASE}/admin-review-action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ item_id: itemId, action, note }),
    });
    setQueue(q => q.filter(i => i.id !== itemId));
  };

  if (loading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-40 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>;

  if (queue.length === 0) return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center">
      <p className="text-zinc-400 font-medium mb-1">Queue empty</p>
      <p className="text-zinc-600 text-sm">No items awaiting manual review.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{queue.length} item{queue.length !== 1 ? 's' : ''} awaiting review</p>
        <Link href="/admin/review" className="text-xs text-violet-400 hover:text-violet-300">Full review page →</Link>
      </div>
      {queue.map((item: any) => (
        <div key={item.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex gap-4">
          <div className="flex gap-3 shrink-0">
            {item.photos?.slice(0, 2).map((url: string, i: number) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt="scan" className="w-16 h-20 rounded-md object-cover bg-zinc-800" />
            ))}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-white font-medium text-sm">{item.catalog_name ?? 'Unknown'}</p>
            <p className="text-zinc-500 text-xs">{item.ai_assessment ?? 'No AI assessment'}</p>
            {item.flags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.flags.map((f: string) => <span key={f} className="text-xs bg-red-900/20 border border-red-900/50 text-red-400 rounded px-1.5 py-0.5">{f}</span>)}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => doAction(item.id, 'approve')}
                className="rounded px-3 py-1.5 text-xs bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-800/50 text-emerald-300 transition-colors">Approve</button>
              <button onClick={() => doAction(item.id, 'request_photos')}
                className="rounded px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors">Request Photos</button>
              <button onClick={() => { const r = prompt('Rejection reason:'); if (r) doAction(item.id, 'reject', r); }}
                className="rounded px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-red-400 transition-colors">Reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DisputesTab() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (butterbase as any)
        .from('disputes').select('*, transactions(id, sale_price, buyer_id, seller_id)').eq('status', 'open').order('created_at', { ascending: false });
      setDisputes(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>;

  if (disputes.length === 0) return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center">
      <p className="text-zinc-400 font-medium mb-1">No open disputes</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">{disputes.length} open dispute{disputes.length !== 1 ? 's' : ''}</p>
      {disputes.map((d: any) => (
        <div key={d.id} className="rounded-xl bg-zinc-900 border border-red-900/40 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-white font-medium text-sm">{d.issue_type}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{d.description?.slice(0, 120)}{(d.description?.length ?? 0) > 120 ? '…' : ''}</p>
              <p className="text-zinc-600 text-xs mt-2">Txn ${parseFloat(d.transactions?.sale_price ?? 0).toFixed(2)} · Buyer {d.buyer_id?.slice(0, 8)} · Seller {d.transactions?.seller_id?.slice(0, 8)}</p>
            </div>
            <p className="text-xs text-zinc-600 shrink-0">{new Date(d.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const REPORT_LABELS: Record<string, string> = {
    counterfeit: 'Counterfeit', non_delivery: 'Non-delivery', misrepresentation: 'Misrepresentation', scam: 'Scam',
  };

  useEffect(() => {
    (async () => {
      const { data } = await (butterbase as any)
        .from('reports').select('*').not('status', 'in', '("dismissed","closed")').order('created_at', { ascending: false });
      if (!data?.length) { setReports([]); setLoading(false); return; }
      // Count reports per reported_user_id to sort by severity
      const countMap = new Map<string, number>();
      for (const r of data) countMap.set(r.reported_user_id, (countMap.get(r.reported_user_id) ?? 0) + 1);
      const sorted = [...data].sort((a, b) => (countMap.get(b.reported_user_id) ?? 0) - (countMap.get(a.reported_user_id) ?? 0));
      setReports(sorted.map((r: any) => ({ ...r, total_against_user: countMap.get(r.reported_user_id) })));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>;
  if (reports.length === 0) return <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center"><p className="text-zinc-400">No open reports.</p></div>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-400">{reports.length} report{reports.length !== 1 ? 's' : ''} (sorted by severity)</p>
      {reports.map((r: any) => (
        <div key={r.id} className="flex items-center gap-4 rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-red-400">{REPORT_LABELS[r.report_type] ?? r.report_type}</span>
              {r.total_against_user > 1 && (
                <span className="text-xs font-bold bg-red-900/40 border border-red-800 text-red-300 rounded-full px-1.5 py-0.5">
                  {r.total_against_user} against this user
                </span>
              )}
            </div>
            <p className="text-zinc-400 text-xs mt-0.5 truncate">{r.description?.slice(0, 100)}</p>
            <p className="text-zinc-600 text-xs mt-0.5">User: {r.reported_user_id?.slice(0, 8)}</p>
          </div>
          <div className="text-xs text-zinc-600 shrink-0">{new Date(r.created_at).toLocaleDateString()}</div>
          <Link href="/admin/appeals" className="text-xs text-violet-400 hover:text-violet-300 shrink-0">Appeals →</Link>
        </div>
      ))}
    </div>
  );
}

function ScammerDBTab() {
  const [scammers, setScammers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (butterbase as any).from('scammer_db').select('*').order('banned_at', { ascending: false });
      setScammers(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = scammers.filter(s =>
    !search || s.email?.includes(search) || JSON.stringify(s.linked_accounts ?? {}).toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email or username…"
          className="flex-1 rounded-md bg-zinc-900 border border-zinc-700 text-white text-sm px-3 py-2 placeholder-zinc-600 focus:outline-none focus:border-violet-600" />
        <span className="text-xs text-zinc-600 shrink-0">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 text-sm">{search ? 'No matches.' : 'No banned accounts.'}</p>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Linked accounts</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Reason</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Banned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.map((s: any) => (
                <tr key={s.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-white font-mono text-xs">{s.email ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {s.linked_accounts ? Object.entries(s.linked_accounts).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-xs truncate">{s.ban_reason ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">{new Date(s.banned_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await butterbase.auth.getSession();
      const userId = (session as any).data?.session?.user?.id;
      if (!userId) { router.push('/login'); return; }
      const { data } = await (butterbase as any).from('admin_users').select('id').eq('user_id', userId).maybeSingle();
      if (!data) { setForbidden(true); }
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <div className="p-8"><div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse" /></div>;
  if (forbidden) return <div className="p-8 text-zinc-500 text-sm">Admin access required.</div>;

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-0.5">PCPrice platform operations</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/events" className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors">
            Sentiment Events →
          </Link>
          <Link href="/admin/appeals" className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors">
            Appeals Queue →
          </Link>
          <Link href="/admin/review" className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors">
            Review Queue →
          </Link>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 rounded-xl bg-zinc-900 border border-zinc-800 p-1 mb-8 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'stats' && <PlatformStatsTab />}
      {activeTab === 'queue' && <ReviewQueueTab />}
      {activeTab === 'disputes' && <DisputesTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'scammer_db' && <ScammerDBTab />}
    </div>
  );
}
