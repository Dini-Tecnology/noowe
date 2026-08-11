import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { ENV } from '../config/env';

let client: SupabaseClient | null = null;
let autoRefreshConfigured = false;

function getSupabasePublicKey(): string {
  return ENV.SUPABASE_PUBLISHABLE_KEY || ENV.SUPABASE_ANON_KEY;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(ENV.SUPABASE_URL && getSupabasePublicKey());
}

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  if (!client) {
    client = createClient(ENV.SUPABASE_URL, getSupabasePublicKey(), {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  if (!autoRefreshConfigured) {
    autoRefreshConfigured = true;
    AppState.addEventListener('change', (state) => {
      if (!client) return;
      if (state === 'active') {
        client.auth.startAutoRefresh();
      } else {
        client.auth.stopAutoRefresh();
      }
    });
  }

  return client;
}
