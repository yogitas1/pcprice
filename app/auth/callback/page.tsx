'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';
import { setAuthCookie } from '@/lib/auth-cookies';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let done = false;

    async function handleCallback() {
      // Give the SDK a moment to parse OAuth tokens from the URL hash/params
      await new Promise(r => setTimeout(r, 500));

      const session = await butterbase.auth.getSession();
      const token = (session as any)?.data?.session?.access_token
        ?? (session as any)?.access_token
        ?? (session as any)?.accessToken;

      if (token && !done) {
        done = true;
        setAuthCookie(token);
        router.replace('/dashboard');
        return;
      }

      // Fallback: listen for auth state change (fires when SDK processes URL tokens)
      const { unsubscribe } = butterbase.onAuthStateChange((event, s) => {
        const t = (s as any)?.access_token ?? (s as any)?.accessToken;
        if (t && !done) {
          done = true;
          setAuthCookie(t);
          router.replace('/dashboard');
        }
      });

      // Last resort: redirect to login after 6s
      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          router.replace('/login');
        }
      }, 6000);

      return () => {
        unsubscribe();
        clearTimeout(timeout);
      };
    }

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent mx-auto" />
        <p className="text-sm text-zinc-400">Signing you in…</p>
      </div>
    </div>
  );
}
