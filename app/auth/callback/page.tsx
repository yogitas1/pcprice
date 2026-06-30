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
      // Try explicit OAuth callback handling (reads access_token from URL query params).
      // The SDK also fires this automatically on init, so onAuthStateChange below is the
      // primary signal — this is belt-and-suspenders for slower environments.
      try {
        const { data } = await butterbase.auth.handleOAuthCallback();
        if (data?.session?.accessToken && !done) {
          done = true;
          const expiresIn = data.session.expiresAt
            ? Math.max(60, data.session.expiresAt - Math.floor(Date.now() / 1000))
            : 3600;
          setAuthCookie(data.session.accessToken, expiresIn);
          router.replace('/dashboard');
          return;
        }
      } catch {
        // No OAuth params in URL — handled by onAuthStateChange below
      }

      // Primary path: SDK fires SIGNED_IN via onAuthStateChange once it processes URL tokens
      const { unsubscribe } = butterbase.onAuthStateChange((event, s) => {
        const t = (s as any)?.accessToken ?? (s as any)?.access_token;
        if (t && !done) {
          done = true;
          setAuthCookie(t);
          router.replace('/dashboard');
        }
      });

      // Last resort: redirect to login after 6s if no session materialised
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
