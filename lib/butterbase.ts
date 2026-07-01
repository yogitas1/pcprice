import { createClient } from '@butterbase/sdk';

// The Butterbase SDK appends /v1/${appId} to apiUrl internally, so apiUrl must be
// just the origin. Strip any /v1/... path the env var may include (Vercel dashboard
// was set to the full URL with appId, causing double-path 404s).
const _rawUrl = process.env.NEXT_PUBLIC_BUTTERBASE_URL || 'https://api.butterbase.ai';
const apiUrl = (() => {
  try { return new URL(_rawUrl).origin; } catch { return 'https://api.butterbase.ai'; }
})();

const appId =
  process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID ??
  'app_w2wmfcnqn2j2';

export const butterbase = createClient({ appId, apiUrl });

// butterbase.auth.getSession() does not exist on the SDK's public auth object —
// it lives on the internal sessionManager. Expose it as a named export so all
// pages can read the current in-memory session without touching SDK internals.
export function getSession() {
  return (butterbase as any).sessionManager?.getSession() ?? null;
}

export function getAuthToken(): string | null {
  return getSession()?.accessToken ?? null;
}
