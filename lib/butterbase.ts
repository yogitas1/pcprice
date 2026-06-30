import { createClient } from '@butterbase/sdk';

const apiUrl =
  process.env.NEXT_PUBLIC_BUTTERBASE_URL ??
  'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2';

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
