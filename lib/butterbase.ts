import { createClient } from '@butterbase/sdk';

const appId = process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID!;
const apiUrl = process.env.NEXT_PUBLIC_BUTTERBASE_URL!;

export const butterbase = createClient({ appId, apiUrl });
