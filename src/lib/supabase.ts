import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.ts";
export type { Database };

const supabaseUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_URL : undefined);
const supabaseAnonKey =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_ANON_KEY : undefined);

/**
 * Checks whether valid Supabase credentials have been configured.
 * Frontend will gracefully utilize local store simulation if credentials are not provided.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== "https://your-project-id.supabase.co" &&
  !supabaseAnonKey.includes("your-supabase-anon-key")
);

let client: SupabaseClient<Database> | null = null;

if (isSupabaseConfigured && supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.warn("Failed to initialize Supabase client:", err);
    client = null;
  }
} else {
  // Safe development notice (no secrets exposed)
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.info(
      "%c[QLess Supabase]%c Operating in configured single-store local mode. Provide VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY in .env to connect live Supabase project.",
      "color: #0F2044; font-weight: bold;",
      "color: #7A8493;"
    );
  }
}

export const supabase = client;
