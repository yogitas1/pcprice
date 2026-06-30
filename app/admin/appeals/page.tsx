'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { butterbase, getSession } from '@/lib/butterbase';

const BB_BASE = 'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn';

const REPORT_TYPE_LABELS: Record<string, string> = {
  counterfeit: 'Counterfeit item',
  non_delivery: 'Non-delivery',
  misrepresentation: 'Misrepresentation',
  scam: 'Scam / fraud',
};

function getToken(): string | null {
  return getSession()?.accessToken ?? null;
}

type AppealRow = {
  id: string;
  seller_id: string;
  description: string;
  evidence_urls: string[] | null;
  status: string;
  report_id: string;
  report: {
    id: string;
    reporter_id: string;
    reported_user_id: string;
    report_type: string;
    description: string;
    evidence_urls: string[] | null;
    created_at: string;
  };
  seller_name: string;
  reporter_name: string;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-900/30 border-yellow-800 text-yellow-400',
    pending_more_info: 'bg-blue-900/30 border-blue-800 text-blue-400',
    approved: 'bg-green-900/30 border-green-800 text-green-400',
    denied: 'bg-red-900/30 border-red-800 text-red-400',
  };
  const labels: Record<string, string> = {
    pending: 'Pending',
    pending_more_info: 'More info requested',
    approved: 'Approved',
    denied: 'Denied',
  };
  const cls = styles[status] ?? 'bg-zinc-800 border-zinc-700 text-zinc-400';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

function AppealCard({ appeal, onAction }: { appeal: AppealRow; onAction: () => void }) {
  const [action, setAction] = useState<'approve' | 'deny' | 'request_more_info' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!action) return;
    setSubmitting(true);
    setError(null);
    const token = await getToken();
    try {
      const res = await fetch(`${BB_BASE}/admin-review-appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appeal_id: appeal.id, action, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action failed');
        setSubmitting(false);
        return;
      }
      onAction();
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  const isPending = appeal.status === 'pending' || appeal.status === 'pending_more_info';

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-white">
            Appeal by <span className="text-violet-300">{appeal.seller_name}</span>
          </p>
          <StatusBadge status={appeal.status} />
        </div>
        <p className="text-xs text-zinc-600 font-mono">{appeal.id.slice(0, 8)}</p>
      </div>

      {/* Side-by-side report + appeal */}
      <div className="grid grid-cols-2 divide-x divide-zinc-800">
        {/* Report */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">Report</span>
            <span className="text-xs text-zinc-600">
              by {appeal.reporter_name} · {new Date(appeal.report.created_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-1">Type</p>
            <p className="text-sm text-white">{REPORT_TYPE_LABELS[appeal.report.report_type] ?? appeal.report.report_type}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-1">Description</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{appeal.report.description}</p>
          </div>
          {appeal.report.evidence_urls?.length ? (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-1">Evidence</p>
              <div className="flex flex-wrap gap-2">
                {appeal.report.evidence_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-violet-400 hover:text-violet-300 underline">
                    File {i + 1}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Appeal */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Appeal</span>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-1">Seller's response</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{appeal.description}</p>
          </div>
          {appeal.evidence_urls?.length ? (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-1">Evidence</p>
              <div className="flex flex-wrap gap-2">
                {appeal.evidence_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-violet-400 hover:text-violet-300 underline">
                    File {i + 1}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Admin actions */}
      {isPending && (
        <div className="px-5 py-4 border-t border-zinc-800 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setAction(action === 'approve' ? null : 'approve')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                action === 'approve'
                  ? 'bg-green-600 text-white'
                  : 'bg-zinc-800 text-green-400 hover:bg-green-900/30 border border-zinc-700 hover:border-green-800'
              }`}
            >
              Approve
            </button>
            <button
              onClick={() => setAction(action === 'deny' ? null : 'deny')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                action === 'deny'
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-800 text-red-400 hover:bg-red-900/30 border border-zinc-700 hover:border-red-800'
              }`}
            >
              Deny
            </button>
            <button
              onClick={() => setAction(action === 'request_more_info' ? null : 'request_more_info')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                action === 'request_more_info'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-blue-400 hover:bg-blue-900/30 border border-zinc-700 hover:border-blue-800'
              }`}
            >
              Request info
            </button>
          </div>

          {action && (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  action === 'approve'
                    ? 'Optional note to include in approval email…'
                    : action === 'deny'
                    ? 'Reason for denial (included in email)…'
                    : 'Specify what additional information is needed…'
                }
                rows={2}
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 placeholder-zinc-600 focus:outline-none focus:border-violet-600 resize-none"
              />
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting || (action === 'request_more_info' && !reason.trim())}
                className="w-full rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors"
              >
                {submitting
                  ? 'Submitting…'
                  : action === 'approve'
                  ? 'Confirm approval'
                  : action === 'deny'
                  ? 'Confirm denial'
                  : 'Send request'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminAppealsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const fetchData = useCallback(async () => {
    // Admin check
    const session = getSession();
    const userId = session?.user?.id ?? null;
    if (!userId) { router.push('/login'); return; }

    const adminCheck = await (butterbase as any)
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!adminCheck.data) {
      setForbidden(true);
      setLoading(false);
      return;
    }

    // Fetch appeals with reports
    const query = (butterbase as any)
      .from('appeals')
      .select('*, reports(*)')
      .order('id', { ascending: false });

    if (filter === 'pending') {
      query.in('status', ['pending', 'pending_more_info']);
    }

    const { data: rawAppeals } = await query;
    if (!rawAppeals?.length) { setAppeals([]); setLoading(false); return; }

    // Collect all relevant user ids
    const userIds = new Set<string>();
    rawAppeals.forEach((a: any) => {
      userIds.add(a.seller_id);
      if (a.reports?.reporter_id) userIds.add(a.reports.reporter_id);
    });

    const { data: profiles } = await (butterbase as any)
      .from('user_profiles')
      .select('user_id, display_name')
      .in('user_id', Array.from(userIds));

    const nameMap: Record<string, string> = {};
    (profiles ?? []).forEach((p: any) => { nameMap[p.user_id] = p.display_name ?? 'Unknown'; });

    setAppeals(rawAppeals.map((a: any) => ({
      ...a,
      report: a.reports,
      seller_name: nameMap[a.seller_id] ?? 'Unknown',
      reporter_name: nameMap[a.reports?.reporter_id] ?? 'Unknown',
    })));
    setLoading(false);
  }, [filter, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse mb-6" />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <p className="text-zinc-500 text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Appeals Queue</h1>
          <p className="text-zinc-400 text-sm">Review seller appeals against trust & safety reports.</p>
        </div>
        <div className="flex gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 p-1">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setLoading(true); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {f === 'pending' ? 'Pending' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {appeals.length === 0 ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center">
          <p className="text-zinc-400 font-medium mb-1">
            {filter === 'pending' ? 'No pending appeals' : 'No appeals yet'}
          </p>
          <p className="text-zinc-600 text-sm">
            {filter === 'pending' ? 'All caught up.' : 'Appeals will appear here when sellers respond to reports.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {appeals.map((appeal) => (
            <AppealCard
              key={appeal.id}
              appeal={appeal}
              onAction={() => { setLoading(true); fetchData(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
