import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (import.meta.env.PROD && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error('Missing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_ANON_KEY');
}

if (SUPABASE_PUBLISHABLE_KEY?.toLowerCase().includes('service_role')) {
  throw new Error('Never expose the Supabase service_role key in the browser client');
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_PUBLISHABLE_KEY || 'missing-anon-key',
  {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'X-Client-Info': 'noowe-site',
      },
    },
  }
);
