import { createClient } from '@butterbase/sdk';

const apiUrl =
  process.env.NEXT_PUBLIC_BUTTERBASE_URL ??
  'https://api.butterbase.ai/v1/app_w2wmfcnqn2j2';

const appId =
  process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID ??
  'app_w2wmfcnqn2j2';

export const butterbase = createClient({ appId, apiUrl });
