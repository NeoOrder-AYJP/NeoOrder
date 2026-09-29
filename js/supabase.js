// js/supabase.js - Supabase Client Initialization

// Get credentials from environment or runtime window object
const SUPABASE_URL = "https://nurnxrtxdcasrjcwxvky.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e97hOiDRJhMbrF4smXlKWA_mV3it-Ef";

// Initialize Supabase client via global supabase object loaded from CDN
let supabaseClient = null;

if (window.supabase && window.supabase.createClient) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error("Supabase SDK CDN not loaded on window.");
}

export { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY };
