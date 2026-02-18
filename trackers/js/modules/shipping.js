/**
 * @module shipping.js
 * @description Shipping Tracker application.
 *
 * APIs used:
 *   1. AfterShip API (https://www.aftership.com/docs) — package tracking
 *   2. OpenCage Geocoding API (https://opencagedata.com/) — geocode locations from tracking events
 *      (demonstrates real geocoding without OpenWeatherMap)
 *
 * Since AfterShip requires a paid key for live tracking, this app simulates realistic
 * package tracking data (as many shipping tracker demos do) while showing how the API
 * integration would work. Replace DEMO_MODE = false and add real keys for production.
 *
 * Features:
 *   - Add shipment by tracking number + carrier
 *   - View animated progress timeline
 *   - Estimated delivery countdown
 *   - Geocoding of tracking event locations
 *   - Persistent storage of tracked packages
 *   - Delete and refresh packages
 */

import { showToast, escapeHtml, $, $$, Store, formatDate } from './utils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Set to true to use simulated data (no API keys required for demo). */
const DEMO_MODE = true;

/** AfterShip API key — replace with your own key from aftership.com */
const AFTERSHIP_KEY = 'your-aftership-api-key-here';

/** OpenCage API key — replace with your own from opencagedata.com */
const OPENCAGE_KEY = 'your-opencage-api-key-here';

const AFTERSHIP_BASE = 'https://api.aftership.com/v4';
const OPENCAGE_BASE  = 'https://api.opencagedata.com/geocode/v1';

const STORE_KEY = 'shippingTracker_packages';

// ─── Carrier Configuration ────────────────────────────────────────────────────

/** @type {Object.<string, {name: string, icon: string, color: string}>} */
const CARRIERS = {
  ups:        { name: 'UPS',        icon: '🟫', color: '#8B4513' },
  fedex:      { name: 'FedEx',      icon: '🟣', color: '#4B0082' },
  usps:       { name: 'USPS',       icon: '🦅', color: '#336699' },
  dhl:        { name: 'DHL',        icon: '🟡', color: '#FFCC00' },
  amazon:     { name: 'Amazon',     icon: '📦', color: '#FF9900' },
  ontrac:     { name: 'OnTrac',     icon: '🔵', color: '#0066CC' },
};

// ─── Status Config ────────────────────────────────────────────────────────────

const STEPS = ['Ordered', 'In Transit', 'Out for Delivery', 'Delivered'];

const STATUS_BADGE = {
  pending:          'badge-muted',
  in_transit:       'badge-info',
  out_for_delivery: 'badge-warning',
  delivered:        'badge-success',
  failed_attempt:   'badge-error',
  exception:        'badge-error',
};

const STATUS_LABEL = {
  pending:          'Pending',
  in_transit:       'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  failed_attempt:   'Failed Attempt',
  exception:        'Exception',
};

// ─── State ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   id: string,
 *   trackingNumber: string,
 *   carrier: string,
 *   label: string,
 *   addedAt: string,
 *   status: string,
 *   estimatedDelivery: string|null,
 *   events: Array<{timestamp:string, description:string, location:string}>,
 *   geocode: {lat:number, lng:number}|null
 * }} Package
 */

/** @type {Map<string, Package>} */
let packages = new Map(Object.entries(Store.get(STORE_KEY, {})));

function savePackages() {
  Store.set(STORE_KEY, Object.fromEntries(packages));
}

// ─── Simulated Tracking Data ──────────────────────────────────────────────────

/** Returns simulated tracking events for demo mode. */
function simulateTracking(trackingNumber, carrier) {
  // Use the last char of tracking number to vary simulated status
  const lastChar = trackingNumber.slice(-1).toUpperCase();
  const statusMap = 'ABCDEFGHIJ'.split('');
  const statusIdx = statusMap.indexOf(lastChar) % 4;

  const statuses = ['pending', 'in_transit', 'out_for_delivery', 'delivered'];
  const status = statuses[Math.abs(statusIdx)] || 'in_transit';

  const now = new Date();
  const events = [];

  if (['in_transit', 'out_for_delivery', 'delivered'].includes(status)) {
    events.push({
      timestamp: new Date(now - 3600000).toISOString(),
      description: 'Package arrived at local facility',
      location: 'Chicago, IL, US',
    });
    events.push({
      timestamp: new Date(now - 86400000).toISOString(),
      description: 'Departed sorting center',
      location: 'Indianapolis, IN, US',
    });
    events.push({
      timestamp: new Date(now - 172800000).toISOString(),
      description: 'Package received by carrier',
      location: 'Louisville, KY, US',
    });
  }

  if (status === 'out_for_delivery') {
    events.unshift({
      timestamp: new Date(now - 1800000).toISOString(),
      description: 'Out for delivery',
      location: 'Chicago, IL, US',
    });
  }

  if (status === 'delivered') {
    events.unshift({
      timestamp: new Date(now - 7200000).toISOString(),
      description: 'Package delivered — left at front door',
      location: 'Chicago, IL, US',
    });
  }

  events.push({
    timestamp: new Date(now - 259200000).toISOString(),
    description: 'Order created',
    location: 'Seller Warehouse, US',
  });

  const etaDays = status === 'delivered' ? -1 : status === 'out_for_delivery' ? 0 : 2;
  const eta = etaDays >= 0 ? new Date(now.getTime() + etaDays * 86400000).toISOString() : null;

  return { status, events, estimatedDelivery: eta };
}

// ─── Live API Calls (used when DEMO_MODE = false) ────────────────────────────

/**
 * Fetches tracking info from AfterShip.
 * @param {string} trackingNumber
 * @param {string} carrier
 * @returns {Promise<{status: string, events: Array, estimatedDelivery: string|null}>}
 */
async function fetchTracking(trackingNumber, carrier) {
  if (DEMO_MODE) {
    // Simulate API delay
    await new Promise((r) => setTimeout(r, 900));
    return simulateTracking(trackingNumber, carrier);
  }

  const url = `${AFTERSHIP_BASE}/trackings/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`;
  const res = await fetch(url, {
    headers: {
      'aftership-api-key': AFTERSHIP_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`AfterShip API error: ${res.status}`);
  const data = await res.json();
  const tracking = data.data?.tracking;

  const events = (tracking?.checkpoints || []).map((cp) => ({
    timestamp: cp.created_at,
    description: cp.message,
    location: [cp.city, cp.state, cp.country_iso3].filter(Boolean).join(', '),
  }));

  return {
    status: tracking?.tag?.toLowerCase() || 'pending',
    events,
    estimatedDelivery: tracking?.expected_delivery || null,
  };
}

/**
 * Geocodes a location string using OpenCage.
 * @param {string} locationString
 * @returns {Promise<{lat:number, lng:number}|null>}
 */
async function geocodeLocation(locationString) {
  if (DEMO_MODE || !locationString || OPENCAGE_KEY === 'your-opencage-api-key-here') return null;

  try {
    const url = `${OPENCAGE_BASE}/json?q=${encodeURIComponent(locationString)}&key=${OPENCAGE_KEY}&limit=1&no_annotations=1`;
    const res = await fetch(url);
    const data = await res.json();
    const result = data.results?.[0];
    if (result) return { lat: result.geometry.lat, lng: result.geometry.lng };
  } catch (err) {
    console.warn('Geocode failed:', err);
  }
  return null;
}

// ─── Progress Helpers ─────────────────────────────────────────────────────────

/**
 * Returns the progress step index (0–3) for a given status.
 * @param {string} status
 * @returns {number}
 */
function getProgressIndex(status) {
  const map = {
    pending: 0,
    in_transit: 1,
    out_for_delivery: 2,
    delivered: 3,
  };
  return map[status] ?? 1;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Renders the progress steps bar HTML.
 * @param {string} status
 * @returns {string}
 */
function renderProgressSteps(status) {
  const idx = getProgressIndex(status);
  const pct = Math.round((idx / (STEPS.length - 1)) * 100);

  const stepsHtml = STEPS.map((label, i) => {
    const cls = i < idx ? 'done' : i === idx ? 'current' : '';
    const icon = i < idx ? '✓' : i === idx ? '●' : '○';
    return `<div class="progress-step ${cls}" aria-label="${label}: ${cls === 'done' ? 'completed' : cls === 'current' ? 'current step' : 'pending'}">
      <div class="progress-dot" aria-hidden="true">${icon}</div>
      <span class="progress-label">${escapeHtml(label)}</span>
    </div>`;
  }).join('');

  return `
    <div class="progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Shipping progress: ${STEPS[idx]}">
      <div class="progress-steps" style="--progress-pct:${pct}%" data-pct="${pct}">
        ${stepsHtml}
      </div>
    </div>`;
}

/**
 * Renders timeline events HTML.
 * @param {Array} events
 * @returns {string}
 */
function renderTimeline(events) {
  if (!events.length) return '<p style="color:var(--clr-text-muted);font-size:0.85rem;">No tracking events yet.</p>';

  return `
    <div class="event-timeline" role="list" aria-label="Tracking history">
      ${events.map((ev, i) => `
        <div class="timeline-row" role="listitem">
          <div class="tl-dot" aria-hidden="true"></div>
          <div class="tl-body">
            <p class="tl-desc">${escapeHtml(ev.description)}</p>
            <p class="tl-meta">
              ${ev.location ? `📍 ${escapeHtml(ev.location)} &middot; ` : ''}
              <time datetime="${escapeHtml(ev.timestamp)}">${formatDate(ev.timestamp, 'short')}</time>
            </p>
          </div>
        </div>`).join('')}
    </div>`;
}

/**
 * Renders the ETA widget.
 * @param {string|null} eta
 * @param {string} status
 * @returns {string}
 */
function renderETA(eta, status) {
  if (status === 'delivered') {
    return `<div class="eta-widget"><div>
      <p class="eta-label">Status</p>
      <p class="eta-date" style="color:var(--clr-success)">✓ Delivered</p>
    </div></div>`;
  }

  if (!eta) return '';

  const etaDate = new Date(eta);
  const now = new Date();
  const diffDays = Math.ceil((etaDate - now) / 86400000);
  const countdown = diffDays <= 0
    ? '<span style="color:var(--clr-warning)">Expected today</span>'
    : `<span>${diffDays} day${diffDays !== 1 ? 's' : ''} remaining</span>`;

  return `
    <div class="eta-widget">
      <div>
        <p class="eta-label">Estimated Delivery</p>
        <p class="eta-date">${formatDate(eta, 'short')}</p>
        <p class="eta-countdown">${countdown}</p>
      </div>
      <span aria-hidden="true" style="font-size:2rem">🚚</span>
    </div>`;
}

/**
 * Builds and returns a full package card element.
 * @param {Package} pkg
 * @returns {HTMLElement}
 */
function buildPackageCard(pkg) {
  const carrier = CARRIERS[pkg.carrier] || { name: pkg.carrier, icon: '📦' };
  const badgeClass = STATUS_BADGE[pkg.status] || 'badge-muted';
  const statusLabel = STATUS_LABEL[pkg.status] || pkg.status;

  const article = document.createElement('article');
  article.className = 'shipment-card';
  article.dataset.id = pkg.id;
  article.setAttribute('tabindex', '0');
  article.setAttribute('aria-label', `Package: ${pkg.label}, carrier: ${carrier.name}, status: ${statusLabel}`);

  article.innerHTML = `
    <div class="shipment-card-header">
      <div class="shipment-carrier-icon" aria-hidden="true">${carrier.icon}</div>
      <div class="shipment-info">
        <p class="shipment-label">${escapeHtml(pkg.label)}</p>
        <p class="shipment-tracking-num">${escapeHtml(carrier.name)} · ${escapeHtml(pkg.trackingNumber)}</p>
      </div>
      <div class="shipment-card-actions">
        <span class="badge ${badgeClass}" aria-label="Status: ${statusLabel}">${statusLabel}</span>
        <button class="btn btn-secondary btn-sm refresh-pkg-btn"
          data-id="${escapeHtml(pkg.id)}"
          aria-label="Refresh tracking for ${escapeHtml(pkg.label)}">↻</button>
        <button class="btn btn-danger btn-sm remove-pkg-btn"
          data-id="${escapeHtml(pkg.id)}"
          aria-label="Remove ${escapeHtml(pkg.label)}">✕</button>
      </div>
    </div>
    <div class="shipment-card-body">
      ${renderProgressSteps(pkg.status)}
      ${renderETA(pkg.estimatedDelivery, pkg.status)}
      <details style="margin-top:var(--space-md)">
        <summary style="cursor:pointer;font-size:0.8rem;color:var(--clr-text-muted);margin-bottom:var(--space-md);user-select:none">
          View tracking history (${pkg.events.length} events)
        </summary>
        ${renderTimeline(pkg.events)}
      </details>
    </div>`;

  // Animate the progress bar fill after insertion
  requestAnimationFrame(() => {
    const stepsEl = article.querySelector('.progress-steps');
    if (stepsEl) {
      const pct = stepsEl.dataset.pct;
      stepsEl.style.setProperty('--pct', `${pct}%`);
      // Set the ::after width via inline style on a helper span
      const filler = document.createElement('span');
      filler.style.cssText = `position:absolute;top:14px;left:0;height:2px;background:var(--clr-accent);z-index:1;width:0;transition:width 1s cubic-bezier(0.16,1,0.3,1);pointer-events:none`;
      stepsEl.appendChild(filler);
      requestAnimationFrame(() => { filler.style.width = `${pct}%`; });
    }
  });

  return article;
}

// ─── Render All Packages ──────────────────────────────────────────────────────

function renderPackages() {
  const container = $('#shipment-list');
  const empty = $('#shipments-empty');
  const statTotal = $('#stat-total');
  const statInTransit = $('#stat-in-transit');
  const statDelivered = $('#stat-delivered');

  const all = [...packages.values()];

  if (statTotal) statTotal.textContent = all.length;
  if (statInTransit) statInTransit.textContent = all.filter((p) => ['in_transit', 'out_for_delivery'].includes(p.status)).length;
  if (statDelivered) statDelivered.textContent = all.filter((p) => p.status === 'delivered').length;

  if (!all.length) {
    container.innerHTML = '';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  container.innerHTML = '';

  all.forEach((pkg, i) => {
    const card = buildPackageCard(pkg);
    card.style.animationDelay = `${i * 0.06}s`;
    container.appendChild(card);
  });
}

// ─── Add Package ─────────────────────────────────────────────────────────────

/**
 * Handles the add-package form submission.
 * @param {Event} e
 */
async function handleAddPackage(e) {
  e.preventDefault();

  const trackingInput = $('#tracking-input');
  const labelInput    = $('#label-input');
  const carrier       = $('[data-carrier-btn].selected')?.dataset.carrierBtn || 'ups';
  const submitBtn     = $('#add-package-btn');

  const trackingNumber = trackingInput.value.trim().toUpperCase();
  const label = labelInput.value.trim() || `Package ${trackingNumber.slice(-6)}`;

  if (!trackingNumber) {
    showToast('Please enter a tracking number.', 'error');
    trackingInput.focus();
    return;
  }

  // Duplicate check
  const existing = [...packages.values()].find((p) => p.trackingNumber === trackingNumber);
  if (existing) {
    showToast('That tracking number is already being tracked.', 'info');
    return;
  }

  // Show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Tracking…';

  try {
    const trackingData = await fetchTracking(trackingNumber, carrier);

    // Geocode the latest event location (only in live mode)
    const latestLocation = trackingData.events[0]?.location;
    const geocode = await geocodeLocation(latestLocation);

    const id = `pkg_${Date.now()}`;
    /** @type {Package} */
    const pkg = {
      id,
      trackingNumber,
      carrier,
      label,
      addedAt: new Date().toISOString(),
      ...trackingData,
      geocode,
    };

    packages.set(id, pkg);
    savePackages();
    renderPackages();

    // Reset form
    trackingInput.value = '';
    labelInput.value = '';

    showToast(`Now tracking: "${label}"`, 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    console.error('Tracking error:', err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Track Package';
  }
}

// ─── Refresh Package ─────────────────────────────────────────────────────────

/**
 * Re-fetches tracking data for an existing package.
 * @param {string} id
 */
async function refreshPackage(id) {
  const pkg = packages.get(id);
  if (!pkg) return;

  showToast(`Refreshing tracking for "${pkg.label}"…`, 'info');

  try {
    const trackingData = await fetchTracking(pkg.trackingNumber, pkg.carrier);
    const latestLocation = trackingData.events[0]?.location;
    const geocode = await geocodeLocation(latestLocation);

    packages.set(id, { ...pkg, ...trackingData, geocode });
    savePackages();
    renderPackages();
    showToast('Tracking updated!', 'success');
  } catch (err) {
    showToast(`Refresh failed: ${err.message}`, 'error');
  }
}

// ─── Event Delegation ─────────────────────────────────────────────────────────

function initListEvents() {
  const list = $('#shipment-list');

  list.addEventListener('click', (e) => {
    const removeBtn  = e.target.closest('.remove-pkg-btn');
    const refreshBtn = e.target.closest('.refresh-pkg-btn');

    if (removeBtn) {
      const id = removeBtn.dataset.id;
      const pkg = packages.get(id);
      if (pkg) {
        packages.delete(id);
        savePackages();
        renderPackages();
        showToast(`Removed "${pkg.label}"`, 'info');
      }
    } else if (refreshBtn) {
      refreshPackage(refreshBtn.dataset.id);
    }
  });
}

/**
 * Sets up carrier selector buttons.
 */
function initCarrierSelector() {
  $$('[data-carrier-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('[data-carrier-btn]').forEach((b) => {
        b.classList.remove('selected');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
    });
  });
}

// ─── Clear All ────────────────────────────────────────────────────────────────

function initClearAll() {
  const btn = $('#clear-all-btn');
  btn?.addEventListener('click', () => {
    if (packages.size === 0) return;
    if (window.confirm('Remove all tracked packages?')) {
      packages.clear();
      savePackages();
      renderPackages();
      showToast('All packages cleared.', 'info');
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  $('#add-package-form').addEventListener('submit', handleAddPackage);
  initListEvents();
  initCarrierSelector();
  initClearAll();
  renderPackages();

  // Show demo mode badge info
  if (DEMO_MODE) {
    console.info('%c[Shipping Tracker] Running in DEMO MODE — simulated tracking data.', 'color:#00e5ff');
  }
}

document.addEventListener('DOMContentLoaded', init);
