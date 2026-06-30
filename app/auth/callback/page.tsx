'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { butterbase } from '@/lib/butterbase';
import { setAuthCookie } from '@/lib/auth-cookies';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let done = false;

    function finish(token: string, expiresIn: number) {
      if (done) return;
      done = true;
      setAuthCookie(token, expiresIn);
      router.replace('/dashboard');
    }

    // Primary path: read tokens from URL query params (Google OAuth redirects here
    // with ?access_token=...&refresh_token=...&expires_in=...).
    // Decode JWT payload to populate the SDK's sessionManager without making an
    // API call (which would hit a double-appId URL and 404).
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10);

    if (accessToken && refreshToken) {
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const user = { id: payload.sub ?? payload.user_id ?? '', email: payload.email ?? '' };
        (butterbase as any).sessionManager?.setSessionFromLoginResponse(
          { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user },
          'SIGNED_IN'
        );
      } catch {
        // JWT decode failed — session manager won't have user data, but the cookie
        // still lets the middleware pass; pages will redirect to /login if userId is null
      }
      finish(accessToken, expiresIn);
      return;
    }

    // Fallback: SDK fires onAuthStateChange when it processes hash-based OAuth tokens
    const { unsubscribe } = butterbase.onAuthStateChange((_event, s) => {
      const t = (s as any)?.accessToken ?? (s as any)?.access_token;
      if (t) finish(t, (s as any)?.expiresAt ? Math.max(60, (s as any).expiresAt - Math.floor(Date.now() / 1000)) : 3600);
    });

    // Last resort: redirect to login after 6s if no session materialised
    const timeout = setTimeout(() => {
      if (!done) { done = true; router.replace('/login'); }
    }, 6000);

    return () => { unsubscribe(); clearTimeout(timeout); };
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
