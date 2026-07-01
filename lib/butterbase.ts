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
//
// On page refresh the sessionManager is empty (in-memory only). Fall back to
// reading the bb_access_token cookie set by the auth callback, decoding the JWT
// to reconstruct the minimal session object, and injecting it back into the SDK
// so subsequent .from() queries are authenticated.
export function getSession() {
  const inMemory = (butterbase as any).sessionManager?.getSession();
  if (inMemory?.accessToken) return inMemory;

  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(/(?:^|;\s*)bb_access_token=([^;]+)/);
    if (!match) return null;
    const token = decodeURIComponent(match[1]);
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub ?? payload.user_id ?? '';
    if (!userId) return null;
    const user = { id: userId, email: payload.email ?? '' };

    // Inject into SDK sessionManager so .from() queries attach the auth header
    (butterbase as any).sessionManager?.setSessionFromLoginResponse?.(
      { access_token: token, refresh_token: '', expires_in: 3600, user },
      'SESSION_RESTORED',
    );
    return { accessToken: token, user };
  } catch { return null; }
}

export function getAuthToken(): string | null {
  return getSession()?.accessToken ?? null;
}
