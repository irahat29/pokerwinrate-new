import { createMiddleware } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';

// Attaches a non-expired access token to every server-function call.
// getSession() can hand back an expired token after the tab sleeps (refresh timers pause),
// which the server rejects as "Unauthorized: Invalid token"; refresh it first.
async function freshAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return undefined;
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (expiresAtMs - Date.now() > 60_000) return session.access_token;
  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token;
}

export const attachFreshSupabaseAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const token = await freshAccessToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
