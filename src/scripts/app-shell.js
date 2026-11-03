/*
 * Site chrome: theme toggle (auto-detect + manual, persisted) and the mobile nav.
 * There is no login on this site — joining happens through WeChat (see JoinDropdown).
 */

function setTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  try {
    localStorage.setItem('gfic-theme', dark ? 'dark' : 'light');
  } catch (e) {
    /* storage blocked — theme just won't persist */
  }
}

function initTheme() {
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return;
  // The two glyphs live in the DOM and CSS picks the visible one from data-theme, so the
  // script only has to keep aria-label honest — it no longer writes glyph markup.
  // Sync on startup too: the inline theme bootstrap restores dark mode before this module
  // loads, while the server-rendered button still carries the light-mode label.
  const syncLabel = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  syncLabel();
  button.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    setTheme(dark);
    syncLabel();
  });
}

function initNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (!toggle || !nav) return;

  function close() {
    if (!nav.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }
  function open() {
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (nav.classList.contains('is-open')) close();
    else open();
  });

  // Tap outside the menu closes it; the open menu is position:absolute under the header,
  // so a click in the page body must not count as "inside". Matches JoinDropdown.
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('is-open') && !nav.contains(event.target) && !toggle.contains(event.target)) {
      close();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}

export function initShell() {
  initTheme();
  initNav();
}
