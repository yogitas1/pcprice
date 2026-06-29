'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';
import { setAuthCookie } from '@/lib/auth-cookies';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // The SDK auto-detects OAuth tokens from the URL hash/query params
    // when detectSessionFromUrl is true (the default). Listen for the
    // resulting auth state change and sync the token to a cookie.
    const { unsubscribe } = butterbase.onAuthStateChange((event, session) => {
      if (session?.accessToken) {
        setAuthCookie(session.accessToken);
        router.replace('/dashboard');
      } else if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }
    });

    // Fallback: if no auth event fires within 4s, give up and go to login
    const timeout = setTimeout(() => router.replace('/login'), 4000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
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
