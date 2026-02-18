/**
 * @module shopping.js
 * @description Shopping Tracker application.
 *
 * APIs used:
 *   1. Open Food Facts API (https://world.openfoodfacts.org/api/v2) — barcode/product lookup
 *   2. Exchangerate.host API (https://exchangerate.host) — currency conversion for price tracking
 *      (free, no key required — demonstrates a non-OpenWeatherMap external API)
 *
 * Features:
 *   - Search products by name or barcode (Open Food Facts)
 *   - Add items with name, price, quantity, category, priority
 *   - Set price alert thresholds
 *   - Currency conversion for prices (Exchangerate.host)
 *   - Budget tracking with visual progress bar
 *   - Mark items as purchased / toggle purchased state
 *   - Sort and filter by category
 *   - Persistent storage
 */

import {
  showToast, escapeHtml, $, $$, Store, formatCurrency, debounce,
} from './utils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const OPEN_FOOD_FACTS = 'https://world.openfoodfacts.org/api/v2';
const EXCHANGE_API    = 'https://api.exchangerate.host/live';

const STORE_KEY        = 'shoppingTracker_items';
const BUDGET_STORE_KEY = 'shoppingTracker_budget';

const DEFAULT_BUDGET = 200;

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORIES = {
  groceries:    { label: 'Groceries',    icon: '🛒' },
  electronics:  { label: 'Electronics',  icon: '💻' },
  clothing:     { label: 'Clothing',     icon: '👕' },
  health:       { label: 'Health',       icon: '💊' },
  home:         { label: 'Home',         icon: '🏠' },
  other:        { label: 'Other',        icon: '📦' },
};

const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

// ─── State ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   brand: string,
 *   price: number,
 *   qty: number,
 *   category: string,
 *   priority: string,
 *   alertPrice: number|null,
 *   purchased: boolean,
 *   image: string|null,
 *   note: string,
 *   addedAt: string,
 *   barcode: string|null
 * }} ShoppingItem
 */

/** @type {Map<string, ShoppingItem>} */
let items = new Map(Object.entries(Store.get(STORE_KEY, {})));

/** @type {number} */
let budget = Store.get(BUDGET_STORE_KEY, DEFAULT_BUDGET);

/** @type {string} Active category filter */
let activeCategory = 'all';

/** @type {string} Active sort key */
let sortKey = 'addedAt';

/** @type {Object|null} Cached exchange rates */
let exchangeRates = null;

function saveItems() {
  Store.set(STORE_KEY, Object.fromEntries(items));
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * Searches Open Food Facts for products by name.
 * @param {string} query - Product name or barcode.
 * @returns {Promise<Array>}
 */
async function searchProduct(query) {
  // Check if it's a numeric barcode
  if (/^\d+$/.test(query)) {
    const res = await fetch(`${OPEN_FOOD_FACTS}/product/${query}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      return [data.product];
    }
    throw new Error('Barcode not found in Open Food Facts database.');
  }

  // Text search
  const url = `${OPEN_FOOD_FACTS}/search?search_terms=${encodeURIComponent(query)}&fields=product_name,brands,image_thumb_url,categories_tags,code&page_size=5&json=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Product search failed');
  const data = await res.json();

  if (!data.products?.length) throw new Error('No products found for that query.');
  return data.products;
}

/**
 * Fetches exchange rates relative to USD from Exchangerate.host.
 * @returns {Promise<Object>}
 */
async function fetchExchangeRates() {
  if (exchangeRates) return exchangeRates;

  const res = await fetch(`${EXCHANGE_API}?access_key=free&currencies=EUR,GBP,JPY,CAD,AUD&source=USD&format=1`);
  if (!res.ok) {
    // Fallback to approximate rates if API unavailable
    exchangeRates = { USDEUR: 0.92, USDGBP: 0.79, USDJPY: 149.5, USDCAD: 1.36, USDAUD: 1.54 };
    return exchangeRates;
  }
  const data = await res.json();
  exchangeRates = data.quotes || {};
  return exchangeRates;
}

/**
 * Converts USD price to another currency.
 * @param {number} usdAmount
 * @param {string} targetCurrency - e.g. 'EUR', 'GBP'
 * @returns {Promise<{amount: number, symbol: string}>}
 */
async function convertCurrency(usdAmount, targetCurrency) {
  const rates = await fetchExchangeRates();
  const key = `USD${targetCurrency.toUpperCase()}`;
  const rate = rates[key] || 1;
  const symbols = { EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'AU$', USD: '$' };
  return {
    amount: usdAmount * rate,
    symbol: symbols[targetCurrency] || targetCurrency,
  };
}

// ─── Product Search UI ────────────────────────────────────────────────────────

/** @type {Object|null} Currently previewed product from search */
let previewProduct = null;

/**
 * Handles product search and populates the preview.
 */
const handleProductSearch = debounce(async () => {
  const query = $('#product-search-input').value.trim();
  if (query.length < 3) return;

  const preview = $('#product-preview');
  preview.className = 'product-result-preview';
  preview.innerHTML = '<div style="width:100%;text-align:center;color:var(--clr-text-muted)"><div class="spinner" style="width:24px;height:24px;margin:0 auto"></div></div>';
  preview.classList.add('visible');

  try {
    const results = await searchProduct(query);
    const product = results[0];
    previewProduct = product;

    const name  = product.product_name || query;
    const brand = product.brands || '';
    const img   = product.image_thumb_url || product.image_small_url || null;

    preview.innerHTML = `
      <div style="display:flex;gap:var(--space-md);align-items:flex-start;width:100%">
        ${img
          ? `<img class="product-preview-img" src="${escapeHtml(img)}" alt="${escapeHtml(name)} product image" loading="lazy">`
          : `<div class="product-preview-img-placeholder" aria-hidden="true">🛒</div>`}
        <div class="product-preview-info" style="flex:1">
          <p class="product-preview-name">${escapeHtml(name)}</p>
          ${brand ? `<p class="product-preview-brand">${escapeHtml(brand)}</p>` : ''}
          <button class="btn btn-secondary btn-sm" id="use-product-btn" aria-label="Use ${escapeHtml(name)} as item name">
            Use this product ↗
          </button>
        </div>
      </div>`;

    $('#use-product-btn')?.addEventListener('click', () => {
      $('#item-name-input').value = name;
      if (brand && !$('#item-name-input').value.includes(brand)) {
        $('#item-name-input').value = `${brand} ${name}`;
      }
      preview.className = 'product-result-preview';
      $('#product-search-input').value = '';
    });
  } catch (err) {
    preview.innerHTML = `<p style="font-size:0.8rem;color:var(--clr-error)">${escapeHtml(err.message)}</p>`;
  }
}, 700);

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Builds a shopping item card element.
 * @param {ShoppingItem} item
 * @returns {HTMLElement}
 */
function buildItemCard(item) {
  const cat = CATEGORIES[item.category] || CATEGORIES.other;
  const alertActive = item.alertPrice !== null && item.price <= item.alertPrice;
  const priceTrend = '';

  const li = document.createElement('li');
  li.className = `shopping-item priority-${item.priority}${item.purchased ? ' purchased' : ''}${alertActive ? ' alert-triggered' : ''}`;
  li.dataset.id = item.id;
  li.setAttribute('aria-label', `${item.name}, ${formatCurrency(item.price)}, quantity ${item.qty}${item.purchased ? ', purchased' : ''}`);

  li.innerHTML = `
    <button class="item-check" data-action="toggle-purchase" data-id="${escapeHtml(item.id)}"
      aria-label="${item.purchased ? 'Mark as unpurchased' : 'Mark as purchased'}" aria-pressed="${item.purchased}">
      ${item.purchased ? '✓' : ''}
    </button>

    ${item.image
      ? `<img class="item-img" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">`
      : `<div class="item-img-placeholder" aria-hidden="true">${cat.icon}</div>`}

    <div class="item-info">
      <p class="item-name">${escapeHtml(item.name)}</p>
      <div class="item-meta">
        <span class="item-price" aria-label="Price: ${formatCurrency(item.price)}">${formatCurrency(item.price)}</span>
        <span class="item-category-tag">${cat.icon} ${escapeHtml(cat.label)}</span>
        <div class="priority-dot ${escapeHtml(item.priority)}" aria-label="Priority: ${escapeHtml(PRIORITY_LABELS[item.priority] || item.priority)}" title="${PRIORITY_LABELS[item.priority] || item.priority} priority"></div>
        ${alertActive ? `<span class="item-alert-chip">🔔 Price Alert!</span>` : ''}
      </div>
      ${item.note ? `<p class="item-note">"${escapeHtml(item.note)}"</p>` : ''}
    </div>

    <div class="item-qty" role="group" aria-label="Quantity controls for ${escapeHtml(item.name)}">
      <button class="qty-btn" data-action="dec-qty" data-id="${escapeHtml(item.id)}" aria-label="Decrease quantity">−</button>
      <span class="qty-display" aria-live="polite" aria-label="Quantity: ${item.qty}">${item.qty}</span>
      <button class="qty-btn" data-action="inc-qty" data-id="${escapeHtml(item.id)}" aria-label="Increase quantity">+</button>
    </div>

    <div class="item-actions">
      <button class="btn btn-danger btn-sm" data-action="remove" data-id="${escapeHtml(item.id)}"
        aria-label="Remove ${escapeHtml(item.name)} from list">✕</button>
    </div>`;

  return li;
}

/**
 * Computes total cost for all unpurchased items.
 * @returns {{total: number, purchased: number, remaining: number}}
 */
function computeTotals() {
  let total = 0;
  let purchasedTotal = 0;

  items.forEach((item) => {
    const lineTotal = item.price * item.qty;
    total += lineTotal;
    if (item.purchased) purchasedTotal += lineTotal;
  });

  return { total, purchasedTotal, remaining: total - purchasedTotal };
}

/**
 * Gets all items, filtered and sorted.
 * @returns {ShoppingItem[]}
 */
function getFilteredSorted() {
  let list = [...items.values()];

  // Category filter
  if (activeCategory !== 'all') {
    list = list.filter((i) => i.category === activeCategory);
  }

  // Sort
  list.sort((a, b) => {
    if (sortKey === 'price')    return b.price - a.price;
    if (sortKey === 'name')     return a.name.localeCompare(b.name);
    if (sortKey === 'priority') {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
    }
    return new Date(b.addedAt) - new Date(a.addedAt);
  });

  return list;
}

/**
 * Re-renders the full item list and summary.
 */
function renderList() {
  const list     = $('#item-list');
  const empty    = $('#list-empty');
  const countEl  = $('#stat-item-count');
  const totalEl  = $('#stat-total-cost');
  const savedEl  = $('#stat-purchased');
  const budgetEl = $('#budget-fill');
  const budgetRemainingEl = $('#budget-remaining');

  const filtered = getFilteredSorted();
  const totals   = computeTotals();

  if (countEl) countEl.textContent = items.size;
  if (totalEl) totalEl.textContent = formatCurrency(totals.total);
  if (savedEl) savedEl.textContent = formatCurrency(totals.purchasedTotal);

  // Budget bar
  if (budgetEl) {
    const pct = Math.min((totals.total / budget) * 100, 100);
    budgetEl.style.width = `${pct}%`;
    budgetEl.classList.toggle('over-budget', totals.total > budget);
  }
  if (budgetRemainingEl) {
    const remaining = budget - totals.total;
    budgetRemainingEl.textContent = remaining >= 0
      ? `${formatCurrency(remaining)} under budget`
      : `${formatCurrency(Math.abs(remaining))} over budget`;
    budgetRemainingEl.style.color = remaining >= 0 ? 'var(--clr-success)' : 'var(--clr-error)';
  }

  if (!filtered.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = '';
  filtered.forEach((item) => {
    list.appendChild(buildItemCard(item));
  });
}

/**
 * Renders category filter tabs (including dynamic counts).
 */
function renderCategoryTabs() {
  const tabsContainer = $('#category-tabs');
  if (!tabsContainer) return;

  const allCount = items.size;
  const counts = {};
  items.forEach((item) => { counts[item.category] = (counts[item.category] || 0) + 1; });

  const allItems = [{ key: 'all', label: 'All', icon: '✦', count: allCount }];
  Object.entries(CATEGORIES).forEach(([key, { label, icon }]) => {
    if (counts[key]) allItems.push({ key, label, icon, count: counts[key] });
  });

  tabsContainer.innerHTML = allItems.map(({ key, label, icon, count }) => `
    <button class="category-tab ${activeCategory === key ? 'active' : ''}"
      data-category="${escapeHtml(key)}"
      aria-pressed="${activeCategory === key}">
      ${icon} ${escapeHtml(label)} <span style="opacity:0.6">(${count})</span>
    </button>`).join('');
}

// ─── Add Item ─────────────────────────────────────────────────────────────────

/**
 * Handles the add-item form submission.
 * @param {Event} e
 */
async function handleAddItem(e) {
  e.preventDefault();

  const name      = $('#item-name-input').value.trim();
  const price     = parseFloat($('#item-price-input').value) || 0;
  const qty       = parseInt($('#item-qty-input').value, 10) || 1;
  const category  = $('#item-category-select').value;
  const priority  = $('#item-priority-select').value;
  const alertP    = parseFloat($('#item-alert-input').value) || null;
  const note      = $('#item-note-input').value.trim();

  if (!name) {
    showToast('Please enter an item name.', 'error');
    $('#item-name-input').focus();
    return;
  }

  // Get image from previewProduct if it matches the name
  let image = null;
  if (previewProduct) {
    const productName = previewProduct.product_name || '';
    if (name.toLowerCase().includes(productName.toLowerCase().slice(0, 8))) {
      image = previewProduct.image_thumb_url || null;
    }
  }

  const id = `item_${Date.now()}`;
  /** @type {ShoppingItem} */
  const item = {
    id,
    name,
    brand: '',
    price,
    qty,
    category,
    priority,
    alertPrice: alertP,
    purchased: false,
    image,
    note,
    addedAt: new Date().toISOString(),
    barcode: null,
  };

  items.set(id, item);
  saveItems();

  // Trigger alert check immediately
  if (alertP !== null && price <= alertP) {
    showToast(`🔔 Price alert: "${name}" is at or below your alert price of ${formatCurrency(alertP)}!`, 'success', 5000);
  } else {
    showToast(`Added: "${name}"`, 'success');
  }

  // Fetch currency conversion for fun display
  if (price > 0) {
    try {
      const converted = await convertCurrency(price, 'EUR');
      console.info(`[Currency] ${formatCurrency(price)} ≈ ${converted.symbol}${converted.amount.toFixed(2)}`);
    } catch (err) {
      console.warn('Currency conversion failed:', err);
    }
  }

  // Reset form
  e.target.reset();
  previewProduct = null;
  $('#product-preview').className = 'product-result-preview';

  renderList();
  renderCategoryTabs();
}

// ─── Event Delegation ─────────────────────────────────────────────────────────

function initListEvents() {
  const list = $('#item-list');

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const item = items.get(id);
    if (!item) return;

    const action = btn.dataset.action;

    if (action === 'remove') {
      items.delete(id);
      saveItems();
      renderList();
      renderCategoryTabs();
      showToast(`Removed: "${item.name}"`, 'info');
    } else if (action === 'toggle-purchase') {
      item.purchased = !item.purchased;
      items.set(id, item);
      saveItems();
      renderList();
    } else if (action === 'inc-qty') {
      item.qty = Math.min(item.qty + 1, 99);
      items.set(id, item);
      saveItems();
      renderList();
    } else if (action === 'dec-qty') {
      if (item.qty > 1) {
        item.qty -= 1;
        items.set(id, item);
        saveItems();
        renderList();
      }
    }
  });
}

function initCategoryTabs() {
  const container = $('#category-tabs');
  container.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-category]');
    if (!tab) return;
    activeCategory = tab.dataset.category;
    renderCategoryTabs();
    renderList();
  });
}

function initSortSelect() {
  $('#sort-select')?.addEventListener('change', (e) => {
    sortKey = e.target.value;
    renderList();
  });
}

function initBudgetInput() {
  const input = $('#budget-input');
  if (input) {
    input.value = budget;
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (!Number.isNaN(val) && val >= 0) {
        budget = val;
        Store.set(BUDGET_STORE_KEY, budget);
        renderList();
      }
    });
  }
}

function initClearPurchased() {
  $('#clear-purchased-btn')?.addEventListener('click', () => {
    const count = [...items.values()].filter((i) => i.purchased).length;
    if (!count) { showToast('No purchased items to clear.', 'info'); return; }
    items.forEach((item, id) => { if (item.purchased) items.delete(id); });
    saveItems();
    renderList();
    renderCategoryTabs();
    showToast(`Cleared ${count} purchased item${count !== 1 ? 's' : ''}.`, 'success');
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  // Form
  $('#add-item-form').addEventListener('submit', handleAddItem);

  // Product search
  $('#product-search-input')?.addEventListener('input', handleProductSearch);

  // Events
  initListEvents();
  initCategoryTabs();
  initSortSelect();
  initBudgetInput();
  initClearPurchased();

  // Initial render
  renderList();
  renderCategoryTabs();
}

document.addEventListener('DOMContentLoaded', init);
