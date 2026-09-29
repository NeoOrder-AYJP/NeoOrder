// js/theme.js - Dark/Light Mode Switcher for NeoOrder

(function() {
  const STORAGE_KEY = 'theme';

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);

    // Update toggle buttons across page if present
    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
      const icon = btn.querySelector('.material-symbols-outlined') || btn.querySelector('i');
      if (icon) {
        if (icon.tagName.toLowerCase() === 'i') {
          icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        } else {
          icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
        }
      }
      const label = btn.querySelector('.theme-label');
      if (label) {
        label.textContent = theme === 'dark' ? 'Claro' : 'Escuro';
      }
    });
  }

  // Apply immediately before render to avoid flash
  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getPreferredTheme());

    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    });
  });
})();
