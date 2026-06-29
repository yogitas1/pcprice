import { createClient } from '@butterbase/sdk';

const apiUrl = process.env.NEXT_PUBLIC_BUTTERBASE_URL!;
// App ID is the last path segment of the URL (e.g. app_w2wmfcnqn2j2).
// Avoids needing a separate NEXT_PUBLIC_BUTTERBASE_APP_ID env var.
const appId =
  process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID ??
  apiUrl?.split('/').filter(Boolean).pop() ??
  '';

export const butterbase = createClient({ appId, apiUrl });
