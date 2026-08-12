// Server-side Supabase client. Only import this from api/ routes or scripts — never from
// src/ui or anything that ends up in the browser bundle, or the service-role/anon key ships to
// every visitor's devtools.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_KEY are not configured on the server');
  cached = createClient(url, key);
  return cached;
}