/**
 * @module utils.js
 * @description Shared utility functions used across all tracker apps.
 *              Provides toast notifications, DOM helpers, local storage,
 *              date formatting, and debounce utilities.
 */

// ─── Toast Notification System ──────────────────────────────────────────────

/**
 * Ensures the toast container exists in the DOM.
 * @returns {HTMLElement} The toast container element.
 */
function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.setAttribute('role', 'status');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Displays a toast notification.
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'error'} [type='info'] - Toast style type.
 * @param {number} [duration=3500] - Auto-dismiss duration in milliseconds.
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = getToastContainer();
  const icons = { info: 'ℹ', success: '✓', error: '✕' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `<span aria-hidden="true">${icons[type]}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Auto-dismiss
  const timer = setTimeout(() => dismissToast(toast), duration);

  // Allow click-to-dismiss
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismissToast(toast);
  });
}

/**
 * Animates and removes a toast element.
 * @param {HTMLElement} toast - The toast element to remove.
 */
function dismissToast(toast) {
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

/**
 * Safely escapes HTML to prevent XSS.
 * @param {string} str - Raw string.
 * @returns {string} HTML-safe string.
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders a skeleton placeholder block.
 * @param {number} [lines=3] - Number of skeleton lines to render.
 * @returns {string} HTML string for the skeleton.
 */
export function skeletonLines(lines = 3) {
  return Array.from({ length: lines }, (_, i) => {
    const width = [85, 65, 50][i % 3];
    return `<div class="skeleton" style="height:14px;width:${width}%;margin-bottom:10px;"></div>`;
  }).join('');
}

/**
 * Shortcut to query a single DOM element.
 * @param {string} selector - CSS selector.
 * @param {Document|HTMLElement} [ctx=document] - Context element.
 * @returns {HTMLElement|null}
 */
export const $ = (selector, ctx = document) => ctx.querySelector(selector);

/**
 * Shortcut to query multiple DOM elements.
 * @param {string} selector - CSS selector.
 * @param {Document|HTMLElement} [ctx=document] - Context element.
 * @returns {NodeList}
 */
export const $$ = (selector, ctx = document) => ctx.querySelectorAll(selector);

// ─── Storage Helpers ─────────────────────────────────────────────────────────

/**
 * A simple localStorage wrapper with JSON serialization.
 */
export const Store = {
  /**
   * Save data to localStorage.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Store.set error:', e);
    }
  },

  /**
   * Retrieve data from localStorage.
   * @param {string} key
   * @param {*} [fallback=null]
   * @returns {*}
   */
  get(key, fallback = null) {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : fallback;
    } catch (e) {
      console.warn('Store.get error:', e);
      return fallback;
    }
  },

  /**
   * Remove a key from localStorage.
   * @param {string} key
   */
  remove(key) {
    localStorage.removeItem(key);
  },
};

// ─── Date & Time Utilities ───────────────────────────────────────────────────

/**
 * Formats a date string into a human-readable form.
 * @param {string|Date} dateInput - Date value.
 * @param {'long'|'short'|'relative'} [style='long'] - Display style.
 * @returns {string}
 */
export function formatDate(dateInput, style = 'long') {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  if (style === 'relative') {
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
  }

  if (style === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Function Utilities ──────────────────────────────────────────────────────

/**
 * Debounces a function call.
 * @param {Function} fn - Function to debounce.
 * @param {number} [delay=400] - Delay in milliseconds.
 * @returns {Function}
 */
export function debounce(fn, delay = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generates a short random ID string.
 * @returns {string}
 */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Wraps an async function with error handling.
 * @param {Function} asyncFn - The async function to wrap.
 * @returns {Function}
 */
export function withErrorHandler(asyncFn) {
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (err) {
      console.error('Async error:', err);
      showToast(err.message || 'An unexpected error occurred.', 'error');
      return null;
    }
  };
}

// ─── Generic Fetch Wrapper ───────────────────────────────────────────────────

/**
 * Fetches JSON from a URL with error handling.
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} [options] - Fetch options.
 * @returns {Promise<any>}
 */
export async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
  }
  return response.json();
}

// ─── Currency Formatter ──────────────────────────────────────────────────────

/**
 * Formats a number as USD currency.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
