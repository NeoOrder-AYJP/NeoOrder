// js/supabase.js - Supabase Client Initialization & Global Theme Manager

// Get credentials from environment or runtime window object
const SUPABASE_URL = "https://nurnxrtxdcasrjcwxvky.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e97hOiDRJhMbrF4smXlKWA_mV3it-Ef";

// Initialize Supabase client via global supabase object loaded from CDN
let supabaseClient = null;

if (window.supabase && window.supabase.createClient) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  });
} else {
  console.error("Supabase SDK CDN not loaded on window.");
}

// Make client available globally for non-module scripts
window.supabaseClient = supabaseClient;
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// Global helper function to get Supabase client safely without global variable collision
window.getSupabaseClient = function() {
  if (!window.supabaseClient) {
    console.error("Supabase client não encontrado. Verifique o carregamento de js/supabase.js.");
  }
  return window.supabaseClient;
};

// Global Safe Query Helper with Timeout Fallback to prevent infinite loading
window.safeSupabaseQuery = async function(queryPromise, timeoutMs = 2500) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ data: null, error: new Error("Supabase query timeout") });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([queryPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result || { data: null, error: new Error("Empty result") };
  } catch (err) {
    clearTimeout(timeoutId);
    return { data: null, error: err };
  }
};

// Global Theme Management (Light / Dark mode persisted in localStorage)
(function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  document.addEventListener('DOMContentLoaded', () => {
    updateThemeIcons(savedTheme);
    const btnToggleTheme = document.getElementById('btnToggleTheme');
    if (btnToggleTheme) {
      btnToggleTheme.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcons(newTheme);
      });
    }
  });
})();

function updateThemeIcons(theme) {
  const themeBtns = document.querySelectorAll('#btnToggleTheme');
  themeBtns.forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined, .fas');
    if (icon) {
      if (icon.classList.contains('fas')) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      } else {
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
      }
    }
  });
}
