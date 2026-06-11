/* ============================================================
 * app.js — LinkVault Frontend Logic
 * ============================================================
 * Renders the full LinkVault single-page app:
 *   - auth (login / register)
 *   - shorten form + dashboard metrics
 *   - saved links list (filter / search / sort / restore / delete / rename)
 *   - per-link analytics page (line, doughnut, bar charts)
 *
 * Talks to the API defined in CONFIG.apiBase. All state lives in
 * the `state` object so the UI is a function of state.
 * ============================================================ */

(function () {
  'use strict';

  // ---------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const CONFIG = {
    apiBase: isLocal ? 'http://localhost:3001' : 'https://n5wzw93cd3.execute-api.ap-south-1.amazonaws.com/Prod',
    themeStorageKey: 'linkvault-theme',
    restoreGraceDays: 7,
    defaultExpiryDays: '7',
  };

  // ---------------------------------------------------------
  // STATE
  // ---------------------------------------------------------
  const state = {
    links: [],
    filtered: [],
    current: 'loginPage',
    analyticsCode: null,
    deleteCode: null,
    renameCode: null,
    charts: {},
    drawer: false,
    range: 'all',
    expiryFilter: 'all',
    expirySort: 'newest',
    createExpiry: CONFIG.defaultExpiryDays,
  };

  // ---------------------------------------------------------
  // DOM HELPERS
  // ---------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    navbar: $('navbar'),
    drawer: $('drawer'),
    hello: $('hello'),
    loading: $('loading'),
    toasts: $('toasts'),
    loginMsg: $('loginMsg'),
    registerMsg: $('registerMsg'),
    tooltip: $('tooltip'),
    advancedPanel: $('advancedPanel'),
    totalLinks: $('totalLinks'),
    totalClicks: $('totalClicks'),
    mostClicked: $('mostClicked'),
    linksList: $('linksList'),
    linksEmpty: $('linksEmpty'),
    renameOverlay: $('renameOverlay'),
    deleteOverlay: $('deleteOverlay'),
    analyticsCode: $('analyticsCode'),
    analyticsLong: $('analyticsLong'),
    analyticsClicks: $('analyticsClicks'),
    analyticsCreatedAt: $('analyticsCreatedAt'),
    analyticsExpiresAt: $('analyticsExpiresAt'),
    recentList: $('recentList'),
    recentEmpty: $('recentEmpty'),
    renameTitle: $('renameTitleInput'),
    themeToggle: $('themeToggle'),
    themeToggleMobile: $('themeToggleMobile'),
  };

  // ---------------------------------------------------------
  // CHART PLUGIN — draws the total click count in the doughnut
  // ---------------------------------------------------------
  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart, _args, options) {
      if (!options || !options.text) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Big number
      ctx.fillStyle = themeValue('--chart-center');
      ctx.font = "700 28px 'Inter', sans-serif";
      ctx.fillText(
        options.text,
        (chartArea.left + chartArea.right) / 2,
        (chartArea.top + chartArea.bottom) / 2 - 8
      );

      // Subtitle
      ctx.fillStyle = themeValue('--chart-subtle');
      ctx.font = "600 11px 'Inter', sans-serif";
      ctx.letterSpacing = '0.08em';
      ctx.fillText(
        'TOTAL CLICKS',
        (chartArea.left + chartArea.right) / 2,
        (chartArea.top + chartArea.bottom) / 2 + 16
      );
      ctx.restore();
    },
  };

  // ---------------------------------------------------------
  // ESCAPE + small utilities
  // ---------------------------------------------------------
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sessionToken() { return sessionStorage.getItem('token'); }
  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionToken() };
  }

  function setLoading(show) { els.loading.classList.toggle('show', show); }

  // ---------------------------------------------------------
  // TOAST + INLINE MESSAGES
  // ---------------------------------------------------------
  function toast(type, message) {
    const node = document.createElement('div');
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    node.className = 'toast ' + type;
    node.innerHTML = '<div aria-hidden="true">' + icon + '</div><div>' + escapeHtml(message) + '</div>';
    els.toasts.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(-8px)';
      setTimeout(() => node.remove(), 250);
    }, 3000);
  }

  function showInline(target, type, message) {
    target.className = 'inline-msg show ' + type;
    target.textContent = message;
  }

  function clearInline(target) {
    target.className = 'inline-msg';
    target.textContent = '';
  }

  // ---------------------------------------------------------
  // THEME
  // ---------------------------------------------------------
  function themeValue(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function preferredTheme() {
    const saved = localStorage.getItem(CONFIG.themeStorageKey);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function syncThemeToggle() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const label = dark ? '☀️ Light' : '🌙 Dark';
    els.themeToggle.textContent = label;
    els.themeToggleMobile.textContent = label;
  }

  function applyTheme(theme, persist = true) {
    document.documentElement.dataset.theme = theme;
    if (persist) localStorage.setItem(CONFIG.themeStorageKey, theme);
    syncThemeToggle();
    if (state.current === 'analyticsPage' && state.analyticsCode) loadAnalytics(state.analyticsCode);
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }

  // ---------------------------------------------------------
  // DATE / FORMAT HELPERS
  // ---------------------------------------------------------
  function formatDate(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function formatExpiry(expiry) {
    if (!expiry || Number(expiry) === 0) return 'Never';
    return new Date(Number(expiry) * 1000).toLocaleString();
  }

  function formatRelativeTime(value) {
    if (!value) return 'saved recently';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'saved recently';
    const diffMs = Date.now() - timestamp;
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `saved ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `saved ${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `saved ${days} day${days === 1 ? '' : 's'} ago`;
    const weeks = Math.floor(days / 7);
    if (days < 30) return `saved ${weeks} week${weeks === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    return `saved ${months} month${months === 1 ? '' : 's'} ago`;
  }

  // ---------------------------------------------------------
  // URL HELPERS
  // ---------------------------------------------------------
  function normalizeLongUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  }

  function isValidLongUrl(value) {
    try {
      const parsed = new URL(normalizeLongUrl(value));
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      const host = parsed.hostname || '';
      if (!host || /\s/.test(host)) return false;
      return host === 'localhost' || host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    } catch (error) {
      return false;
    }
  }

  function isExistingShortUrl(value) {
    try {
      const normalized = normalizeLongUrl(value);
      if (!CONFIG.apiBase.startsWith('http')) return false;
      const inputUrl = new URL(normalized);
      const apiUrl = new URL(CONFIG.apiBase);
      const apiBasePath = apiUrl.pathname.replace(/\/$/, '');
      return inputUrl.host === apiUrl.host && inputUrl.pathname.startsWith(apiBasePath + '/s/');
    } catch (error) {
      return false;
    }
  }

  function shortPrefix() {
    if (!CONFIG.apiBase.startsWith('http')) return 'yourdomain.com/s/';
    return CONFIG.apiBase.replace(/\/$/, '') + '/s/';
  }

  // ---------------------------------------------------------
  // UI PRIMITIVES
  // ---------------------------------------------------------
  function refreshChrome() {
    const name = sessionStorage.getItem('userName') || 'User';
    els.hello.textContent = 'Hello, ' + name + ' 👋';
    els.navbar.classList.toggle('show', Boolean(sessionToken()));
  }

  function setButtonLoading(button, loading, fallbackText) {
    if (!button) return;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.innerHTML;
    button.disabled = loading;
    if (loading) {
      button.innerHTML = '<span>' + escapeHtml(fallbackText || 'Working') + '</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    } else {
      button.innerHTML = button.dataset.defaultText;
    }
  }

  function setAdvancedPanel(open) {
    els.advancedPanel.classList.toggle('show', open);
    const btn = $('advancedBtn');
    btn.textContent = (open ? '▴' : '▾') + ' Advanced Options';
    btn.setAttribute('aria-expanded', String(open));
  }

  function resetShortenFormDefaults() {
    $('longUrl').value = '';
    $('linkTitle').value = '';
    state.createExpiry = CONFIG.defaultExpiryDays;
    document.querySelectorAll('[data-expiry-option]').forEach((pill) => {
      const active = pill.dataset.expiryOption === state.createExpiry;
      pill.classList.toggle('active', active);
      pill.setAttribute('aria-checked', String(active));
    });
  }

  function resetPages() {
    document.querySelectorAll('.page, .auth-page').forEach((page) => page.classList.remove('active'));
  }

  function syncNav(pageId) {
    document.querySelectorAll('[data-page]').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === pageId));
  }

  function toggleDrawer(force) {
    state.drawer = typeof force === 'boolean' ? force : !state.drawer;
    els.drawer.classList.toggle('show', state.drawer);
    const burger = $('burgerBtn');
    if (burger) burger.setAttribute('aria-expanded', String(state.drawer));
  }

  function showPage(pageId) {
    resetPages();
    const page = $(pageId);
    if (!page) return;
    page.classList.add('active');
    state.current = pageId;
    syncNav(pageId);
    toggleDrawer(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleUnauthorized() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userName');
    refreshChrome();
    toast('error', 'Session expired, please login again');
    showPage('loginPage');
  }

  // ---------------------------------------------------------
  // API WRAPPER
  // ---------------------------------------------------------
  async function api(path, options = {}, protectedRoute = true) {
    const response = await fetch(CONFIG.apiBase + path, options);
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (error) { data = { raw }; }
    if (response.status === 401 && protectedRoute) {
      handleUnauthorized();
      throw new Error('Unauthorized');
    }
    if (!response.ok) throw new Error(data.error || data.message || 'Something went wrong');
    return data;
  }

  async function copyText(value) {
    await navigator.clipboard.writeText(value);
    toast('success', 'Copied to clipboard');
  }

  // ---------------------------------------------------------
  // METRICS + LINK LIST
  // ---------------------------------------------------------
  function renderMetrics() {
    const totalLinks = state.links.length;
    const totalClicks = state.links.reduce((sum, link) => sum + Number(link.clickCount || 0), 0);
    const top = [...state.links].sort((a, b) => Number(b.clickCount || 0) - Number(a.clickCount || 0))[0];
    els.totalLinks.textContent = String(totalLinks);
    els.totalClicks.textContent = String(totalClicks);
    els.mostClicked.textContent = top ? top.code : '-';
  }

  function findLinkNumber(code) {
    const index = state.links.findIndex((link) => link.code === code);
    return index >= 0 ? index + 1 : null;
  }

  function linkExpiryBucket(link) {
    if (!link.expiresAt || Number(link.expiresAt) === 0) return 'never';
    const created = new Date(link.createdAt || '').getTime();
    if (Number.isNaN(created)) return 'custom';
    const diffDays = Math.round((Number(link.expiresAt) * 1000 - created) / 86400000);
    if (diffDays <= 1) return '1';
    if (diffDays <= 7) return '7';
    if (diffDays <= 30) return '30';
    return 'custom';
  }

  function linkPurgeAt(link) {
    if (!link.expiresAt || Number(link.expiresAt) === 0) return 0;
    return Number(link.purgeAt || (Number(link.expiresAt) + (CONFIG.restoreGraceDays * 86400)));
  }

  function isRestorable(link) {
    if (!link.expiresAt || Number(link.expiresAt) === 0) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    return Number(link.expiresAt) <= nowSeconds && linkPurgeAt(link) > nowSeconds;
  }

  function restoreDaysLeft(link) {
    const purgeAt = linkPurgeAt(link);
    if (!purgeAt) return 0;
    const secondsLeft = purgeAt - Math.floor(Date.now() / 1000);
    return secondsLeft <= 0 ? 0 : Math.ceil(secondsLeft / 86400);
  }

  function filterLinks() {
    const query = $('searchInput').value.trim().toLowerCase();
    const nowSeconds = Math.floor(Date.now() / 1000);
    state.filtered = state.links.filter((link) => {
      const matchesQuery =
        (link.code || '').toLowerCase().includes(query) ||
        (link.longUrl || '').toLowerCase().includes(query) ||
        (link.title || '').toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (state.range !== 'all') {
        const createdAt = new Date(link.createdAt || '').getTime();
        if (Number.isNaN(createdAt) || Date.now() - createdAt > Number(state.range) * 86400000) return false;
      }
      if (state.expiryFilter === 'all') return true;
      if (state.expiryFilter === 'active') return !link.expiresAt || Number(link.expiresAt) === 0 || Number(link.expiresAt) > nowSeconds;
      if (state.expiryFilter === 'expired') return Boolean(link.expiresAt) && Number(link.expiresAt) !== 0 && Number(link.expiresAt) <= nowSeconds;
      if (state.expiryFilter === 'restorable') return isRestorable(link);
      return linkExpiryBucket(link) === state.expiryFilter;
    });
    state.filtered.sort((a, b) => {
      if (state.expirySort === 'oldest') return (a.createdAt || '').localeCompare(b.createdAt || '');
      if (state.expirySort === 'expires-soon') {
        const aExp = !a.expiresAt || Number(a.expiresAt) === 0 ? Number.MAX_SAFE_INTEGER : Number(a.expiresAt);
        const bExp = !b.expiresAt || Number(b.expiresAt) === 0 ? Number.MAX_SAFE_INTEGER : Number(b.expiresAt);
        return aExp - bExp;
      }
      if (state.expirySort === 'expires-late') {
        const aExp = !a.expiresAt || Number(a.expiresAt) === 0 ? Number.MAX_SAFE_INTEGER : Number(a.expiresAt);
        const bExp = !b.expiresAt || Number(b.expiresAt) === 0 ? Number.MAX_SAFE_INTEGER : Number(b.expiresAt);
        return bExp - aExp;
      }
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    renderLinks();
  }

  function expiryLabel(link) {
    if (!link.expiresAt || Number(link.expiresAt) === 0) return '<span>Never</span>';
    const now = Math.floor(Date.now() / 1000);
    const diff = Number(link.expiresAt) - now;
    if (diff <= 0) {
      const grace = isRestorable(link)
        ? `<div class="expiry-note">Restore available for ${restoreDaysLeft(link)} more day(s)</div><span class="badge restore">Can Restore</span>`
        : '<div class="expiry-note">Restore window ended</div>';
      return '<span style="color:#fca5a5">' + formatExpiry(link.expiresAt) + '</span> <span class="badge expired">Expired</span>' + grace;
    }
    if (diff < 86400) return '<span style="color:#fca5a5">' + formatExpiry(link.expiresAt) + '</span> <span class="badge soon">Expiring Soon</span>';
    return '<span>' + formatExpiry(link.expiresAt) + '</span>';
  }

  function renderLinks() {
    els.linksList.innerHTML = '';
    els.linksEmpty.classList.toggle('show', state.filtered.length === 0);
    state.filtered.forEach((link, index) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      const title = link.title && link.title.trim() ? link.title.trim() : 'Untitled link';
      const restoreButton = isRestorable(link)
        ? `<button class="icon green" type="button" data-restore="${escapeHtml(link.code)}" aria-label="Restore ${escapeHtml(title)}">↺</button>`
        : '';
      row.innerHTML =
        '<div><div class="code-block">' +
          '<span class="item-no">#' + (index + 1) + '</span>' +
          '<span class="mono">' + escapeHtml(link.code) + '</span>' +
          '<button class="icon" type="button" data-copy="' + escapeHtml(link.code) + '" aria-label="Copy short URL for ' + escapeHtml(title) + '">📋</button>' +
        '</div></div>' +
        '<div>' +
          '<div class="title-text">' + escapeHtml(title) + '</div>' +
          '<div class="url-text" data-tip="' + escapeHtml(link.longUrl) + '">' + escapeHtml(link.longUrl) + '</div>' +
          '<div class="muted" style="margin-top:8px">' + escapeHtml(formatRelativeTime(link.createdAt)) + '</div>' +
          '<div class="muted">' + escapeHtml(link.createdAt ? 'Saved on ' + formatDate(link.createdAt) : '') + '</div>' +
        '</div>' +
        '<div><strong>' + Number(link.clickCount || 0) + '</strong> 👆</div>' +
        '<div>' + expiryLabel(link) + '</div>' +
        '<div><div class="row-actions">' +
          restoreButton +
          '<button class="icon" type="button" data-rename="' + escapeHtml(link.code) + '" aria-label="Rename ' + escapeHtml(title) + '">✏️</button>' +
          '<button class="icon indigo" type="button" data-analytics="' + escapeHtml(link.code) + '" aria-label="View analytics for ' + escapeHtml(title) + '">📊</button>' +
          '<button class="icon red" type="button" data-delete="' + escapeHtml(link.code) + '" aria-label="Delete ' + escapeHtml(title) + '">🗑️</button>' +
        '</div></div>';
      els.linksList.appendChild(row);
    });
  }

  // ---------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------
  async function loadLinks() {
    setLoading(true);
    try {
      const data = await api('/links', { headers: authHeaders() });
      state.links = Array.isArray(data) ? data : [];
      state.filtered = [...state.links];
      renderLinks();
      renderMetrics();
    } catch (error) {
      if (error.message !== 'Unauthorized') toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function openDelete(code) {
    state.deleteCode = code;
    els.deleteOverlay.classList.add('show');
  }
  function closeDelete() {
    state.deleteCode = null;
    els.deleteOverlay.classList.remove('show');
  }
  function openRename(code) {
    const link = state.links.find((item) => item.code === code);
    state.renameCode = code;
    els.renameTitle.value = link && link.title ? link.title : '';
    els.renameOverlay.classList.add('show');
    setTimeout(() => els.renameTitle.focus(), 0);
  }
  function closeRename() {
    state.renameCode = null;
    els.renameTitle.value = '';
    els.renameOverlay.classList.remove('show');
  }

  async function renameLink() {
    if (!state.renameCode) return;
    const button = $('confirmRename');
    setButtonLoading(button, true, 'Save Title');
    try {
      const payload = { title: els.renameTitle.value.trim() };
      const data = await api('/links/' + encodeURIComponent(state.renameCode), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const updatedLink = data.link || {};
      state.links = state.links.map((link) =>
        link.code === state.renameCode ? { ...link, ...updatedLink } : link
      );
      filterLinks();
      toast('success', 'Link renamed successfully');
      closeRename();
    } catch (error) {
      if (error.message !== 'Unauthorized') toast('error', error.message);
    } finally {
      setButtonLoading(button, false, 'Save Title');
    }
  }

  async function removeLink() {
    if (!state.deleteCode) return;
    const button = $('confirmDelete');
    setButtonLoading(button, true, 'Delete');
    try {
      await api('/links/' + encodeURIComponent(state.deleteCode), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      toast('success', 'Link deleted successfully');
      closeDelete();
      await loadLinks();
    } catch (error) {
      if (error.message !== 'Unauthorized') toast('error', error.message);
    } finally {
      setButtonLoading(button, false, 'Delete');
    }
  }

  async function restoreLink(code) {
    try {
      const data = await api('/links/' + encodeURIComponent(code) + '/restore', {
        method: 'POST',
        headers: authHeaders(),
      });
      const updatedLink = data.link || {};
      state.links = state.links.map((link) =>
        link.code === code ? { ...link, ...updatedLink } : link
      );
      filterLinks();
      renderMetrics();
      toast('success', 'Link restored successfully');
    } catch (error) {
      if (error.message !== 'Unauthorized') toast('error', error.message);
    }
  }

  // ---------------------------------------------------------
  // SHORTEN
  // ---------------------------------------------------------
  async function shorten() {
    const button = $('shortenBtn');
    setButtonLoading(button, true, 'Shorten');
    try {
      const payload = {
        longUrl: normalizeLongUrl($('longUrl').value),
        title: $('linkTitle').value.trim(),
        expiryDays: Number(state.createExpiry || 0),
      };
      if (!isValidLongUrl(payload.longUrl)) {
        throw new Error('Please enter a valid URL, for example example.com/page or https://example.com/page');
      }
      if (isExistingShortUrl(payload.longUrl)) {
        throw new Error('This is already a LinkVault short URL. Please use the original destination URL instead.');
      }
      const data = await api('/shorten', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      await loadLinks();
      resetShortenFormDefaults();
      if (data.alreadyExists) {
        const savedNumber = findLinkNumber(data.code);
        const savedTitle = data.title && data.title.trim() ? data.title.trim() : 'Untitled link';
        toast('info', `Already saved as ${savedNumber ? '#' + savedNumber + ' ' : ''}${savedTitle}`);
      } else {
        toast('success', 'Saved to My Links');
      }
    } catch (error) {
      if (error.message !== 'Unauthorized') toast('error', error.message);
    } finally {
      setButtonLoading(button, false, 'Shorten');
    }
  }

  // ---------------------------------------------------------
  // AUTH
  // ---------------------------------------------------------
  async function login() {
    clearInline(els.loginMsg);
    const button = $('loginBtn');
    setButtonLoading(button, true, 'Login');
    try {
      const data = await api(
        '/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: $('loginEmail').value.trim(),
            password: $('loginPassword').value.trim(),
          }),
        },
        false
      );
      sessionStorage.setItem('token', data.token);
      sessionStorage.setItem('userName', data.name || 'User');
      refreshChrome();
      showPage('shortenPage');
      toast('success', 'Welcome back, ' + (data.name || 'User'));
      await loadLinks();
    } catch (error) {
      showInline(els.loginMsg, 'error', error.message);
    } finally {
      setButtonLoading(button, false, 'Login');
    }
  }

  async function register() {
    clearInline(els.registerMsg);
    const button = $('registerBtn');
    setButtonLoading(button, true, 'Create Account');
    try {
      await api(
        '/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: $('registerName').value.trim(),
            email: $('registerEmail').value.trim(),
            password: $('registerPassword').value.trim(),
          }),
        },
        false
      );
      showInline(els.registerMsg, 'success', 'Account created successfully. Redirecting to login...');
      toast('success', 'Registration successful');
      setTimeout(() => {
        $('loginEmail').value = $('registerEmail').value.trim();
        $('loginPassword').value = '';
        showPage('loginPage');
        clearInline(els.registerMsg);
      }, 1200);
    } catch (error) {
      showInline(els.registerMsg, 'error', error.message);
    } finally {
      setButtonLoading(button, false, 'Create Account');
    }
  }

  function logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userName');
    state.analyticsCode = null;
    refreshChrome();
    showPage('loginPage');
    toast('info', 'Logged out successfully');
  }

  // ---------------------------------------------------------
  // ANALYTICS RENDERING
  // ---------------------------------------------------------
  function countryFlag(country) {
    const map = { India: '🇮🇳', USA: '🇺🇸', 'United States': '🇺🇸', Canada: '🇨🇦', Germany: '🇩🇪', France: '🇫🇷', Unknown: '🌍' };
    return map[country] || '🌍';
  }

  function deviceIcon(device) {
    if (device === 'Mobile') return '📱';
    if (device === 'Tablet') return '📟';
    return '💻';
  }

  function destroyCharts() {
    Object.values(state.charts).forEach((chart) => chart && chart.destroy());
    state.charts = {};
  }

  function renderRecent(clicks) {
    els.recentList.innerHTML = '';
    const recent = [...(clicks || [])]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);
    els.recentEmpty.classList.toggle('show', recent.length === 0);
    recent.forEach((click) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      row.innerHTML =
        '<div>' + escapeHtml(formatDate(click.timestamp)) + '</div>' +
        '<div>' + deviceIcon(click.device) + ' ' + escapeHtml(click.device || 'Desktop') + '</div>' +
        '<div>' + countryFlag(click.country) + ' ' + escapeHtml(click.country || 'Unknown') + '</div>' +
        '<div>' + escapeHtml(click.city || 'Unknown') + '</div>' +
        '<div>' + escapeHtml(click.isp || 'Unknown') + '</div>';
      els.recentList.appendChild(row);
    });
  }

  function renderCharts(analytics) {
    destroyCharts();
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded yet — analytics charts skipped');
      return;
    }
    Chart.register(centerTextPlugin);

    // Line chart — clicks over time
    const lineCtx = $('lineChart').getContext('2d');
    const lineGrad = lineCtx.createLinearGradient(0, 0, 0, 280);
    lineGrad.addColorStop(0, themeValue('--chart-line-fill-start'));
    lineGrad.addColorStop(1, themeValue('--chart-line-fill-end'));
    const byDate = analytics.byDate || {};
    const labels = Object.keys(byDate).sort().slice(-14);
    state.charts.line = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: labels.map((d) => byDate[d] || 0),
          borderColor: themeValue('--chart-line'),
          backgroundColor: lineGrad,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: themeValue('--chart-tick') }, grid: { color: themeValue('--chart-grid') } },
          y: { ticks: { color: themeValue('--chart-tick'), precision: 0 }, grid: { color: themeValue('--chart-grid') } },
        },
      },
    });

    // Doughnut — by device
    const byDevice = analytics.byDevice || {};
    state.charts.device = new Chart($('deviceChart').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Desktop', 'Mobile', 'Tablet'],
        datasets: [{
          data: [byDevice.Desktop || 0, byDevice.Mobile || 0, byDevice.Tablet || 0],
          backgroundColor: [
            themeValue('--chart-device-1'),
            themeValue('--chart-device-2'),
            themeValue('--chart-device-3'),
          ],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { color: themeValue('--chart-label') } },
          centerText: { text: String(analytics.totalClicks || 0) },
        },
      },
    });

    // Bar — top countries
    const byCountry = Object.entries(analytics.byCountry || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const cCtx = $('countryChart').getContext('2d');
    const barGrad = cCtx.createLinearGradient(0, 0, 360, 0);
    barGrad.addColorStop(0, themeValue('--chart-bar-start'));
    barGrad.addColorStop(1, themeValue('--chart-bar-end'));
    state.charts.country = new Chart(cCtx, {
      type: 'bar',
      data: {
        labels: byCountry.map((entry) => entry[0]),
        datasets: [{
          data: byCountry.map((entry) => entry[1]),
          backgroundColor: barGrad,
          borderRadius: 12,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: themeValue('--chart-tick'), precision: 0 }, grid: { color: themeValue('--chart-grid') } },
          y: { ticks: { color: themeValue('--chart-label') }, grid: { display: false } },
        },
      },
    });
  }

  async function loadAnalytics(code) {
    state.analyticsCode = code;
    setLoading(true);
    try {
      const data = await api('/analytics/' + encodeURIComponent(code), { headers: authHeaders() });
      const link = state.links.find((item) => item.code === code);
      els.analyticsCode.textContent = data.code || '-';
      els.analyticsLong.textContent = data.longUrl || '-';
      els.analyticsClicks.textContent = String(data.totalClicks || 0);
      els.analyticsCreatedAt.textContent = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '-';
      els.analyticsExpiresAt.textContent = link ? formatExpiry(link.expiresAt) : 'Unknown';
      renderCharts(data);
      renderRecent(data.clicks || []);
      showPage('analyticsPage');
    } catch (error) {
      if (error.message !== 'Unauthorized') toast('error', error.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------
  // BOOT + BIND
  // ---------------------------------------------------------
  async function boot() {
    // Clean any stale localStorage keys — this app is sessionStorage only
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    applyTheme(preferredTheme(), false);
    refreshChrome();
    if (sessionToken()) {
      showPage('shortenPage');
      await loadLinks();
    } else {
      showPage('loginPage');
    }
  }

  function bind() {
    // Auth navigation
    $('goRegister').addEventListener('click', () => showPage('registerPage'));
    $('goLogin').addEventListener('click', () => showPage('loginPage'));
    $('loginBtn').addEventListener('click', login);
    $('registerBtn').addEventListener('click', register);
    $('logoutBtn').addEventListener('click', logout);
    $('logoutBtnMobile').addEventListener('click', logout);

    // Theme + drawer
    els.themeToggle.addEventListener('click', toggleTheme);
    els.themeToggleMobile.addEventListener('click', toggleTheme);
    $('burgerBtn').addEventListener('click', () => toggleDrawer());

    // Advanced panel toggle
    $('advancedBtn').addEventListener('click', () => setAdvancedPanel(!els.advancedPanel.classList.contains('show')));

    // Shorten form
    $('shortenForm').addEventListener('submit', (e) => { e.preventDefault(); shorten(); });
    $('longUrl').addEventListener('input', () => { if ($('longUrl').value.trim()) setAdvancedPanel(true); });
    $('longUrl').addEventListener('paste', () => setTimeout(() => { if ($('longUrl').value.trim()) setAdvancedPanel(true); }, 0));

    // Expiry pills (create form)
    document.querySelectorAll('[data-expiry-option]').forEach((btn) => btn.addEventListener('click', () => {
      state.createExpiry = btn.dataset.expiryOption;
      document.querySelectorAll('[data-expiry-option]').forEach((pill) => {
        const active = pill.dataset.expiryOption === state.createExpiry;
        pill.classList.toggle('active', active);
        pill.setAttribute('aria-checked', String(active));
      });
    }));

    // Search + filter + sort
    $('searchInput').addEventListener('input', filterLinks);
    document.querySelectorAll('[data-expiry-filter]').forEach((btn) => btn.addEventListener('click', () => {
      state.expiryFilter = btn.dataset.expiryFilter;
      document.querySelectorAll('[data-expiry-filter]').forEach((pill) => pill.classList.toggle('active', pill.dataset.expiryFilter === state.expiryFilter));
      filterLinks();
    }));
    document.querySelectorAll('[data-expiry-sort]').forEach((btn) => btn.addEventListener('click', () => {
      state.expirySort = btn.dataset.expirySort;
      document.querySelectorAll('[data-expiry-sort]').forEach((pill) => pill.classList.toggle('active', pill.dataset.expirySort === state.expirySort));
      filterLinks();
    }));
    document.querySelectorAll('[data-range]').forEach((btn) => btn.addEventListener('click', () => {
      state.range = btn.dataset.range;
      document.querySelectorAll('[data-range]').forEach((pill) => pill.classList.toggle('active', pill.dataset.range === state.range));
      filterLinks();
    }));

    // Empty state CTA
    $('emptyCreate').addEventListener('click', () => showPage('shortenPage'));

    // Modals
    $('cancelRename').addEventListener('click', closeRename);
    $('confirmRename').addEventListener('click', renameLink);
    $('renameTitleInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') renameLink(); });
    $('cancelDelete').addEventListener('click', closeDelete);
    $('confirmDelete').addEventListener('click', removeLink);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (els.deleteOverlay.classList.contains('show')) closeDelete();
        if (els.renameOverlay.classList.contains('show')) closeRename();
      }
    });

    // Analytics
    $('backLinks').addEventListener('click', () => showPage('linksPage'));
    $('refreshAnalytics').addEventListener('click', () => state.analyticsCode && loadAnalytics(state.analyticsCode));

    // Password visibility
    document.querySelectorAll('.toggle-pass').forEach((btn) => btn.addEventListener('click', () => {
      const input = $(btn.dataset.input);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
      btn.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
    }));

    // Page nav tabs
    document.querySelectorAll('[data-page]').forEach((btn) => btn.addEventListener('click', async () => {
      const page = btn.dataset.page;
      if (page === 'analyticsPage') {
        if (state.analyticsCode) await loadAnalytics(state.analyticsCode);
        else toast('info', 'Select a link from My Links to view analytics');
      } else {
        showPage(page);
      }
    }));

    // Per-row actions (delegated)
    els.linksList.addEventListener('click', async (event) => {
      const copy = event.target.closest('[data-copy]');
      const rename = event.target.closest('[data-rename]');
      const analytics = event.target.closest('[data-analytics]');
      const del = event.target.closest('[data-delete]');
      const restore = event.target.closest('[data-restore]');
      if (copy) await copyText(shortPrefix() + copy.dataset.copy);
      if (restore) await restoreLink(restore.dataset.restore);
      if (rename) openRename(rename.dataset.rename);
      if (analytics) await loadAnalytics(analytics.dataset.analytics);
      if (del) openDelete(del.dataset.delete);
    });

    // Tooltip on URL hover
    els.linksList.addEventListener('mouseover', (event) => {
      const target = event.target.closest('[data-tip]');
      if (!target) return;
      els.tooltip.textContent = target.dataset.tip;
      els.tooltip.classList.add('show');
    });
    els.linksList.addEventListener('mousemove', (event) => {
      if (!els.tooltip.classList.contains('show')) return;
      els.tooltip.style.left = event.pageX + 12 + 'px';
      els.tooltip.style.top = event.pageY - 18 + 'px';
    });
    els.linksList.addEventListener('mouseleave', () => els.tooltip.classList.remove('show'));

    // System theme change
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      if (localStorage.getItem(CONFIG.themeStorageKey)) return;
      applyTheme(event.matches ? 'dark' : 'light', false);
    });
  }

  // ---------------------------------------------------------
  // INIT
  // ---------------------------------------------------------
  bind();
  boot();
})();
