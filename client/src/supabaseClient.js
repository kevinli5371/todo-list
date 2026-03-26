import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** True when real Supabase env is configured (Vite must be restarted after changing .env). */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * createClient('', '') throws at import time ("supabaseUrl is required") → blank page.
 * Use a stub so the app loads and we can show auth UI + clear configuration errors.
 */
function createStubClient() {
  const noopSub = { unsubscribe: () => {} };
  const err = new Error(
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env (see .env.example), then restart the dev server.'
  );
  err.name = 'ConfigError';

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange() {
        return { data: { subscription: noopSub } };
      },
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: err }),
      signUp: async () => ({ data: { user: null, session: null }, error: err }),
      signOut: async () => {},
    },
  };
}

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : createStubClient();
