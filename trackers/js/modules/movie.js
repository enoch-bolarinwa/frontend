/**
 * @module movie.js
 * @description Movie Tracker application.
 *
 * APIs used:
 *   1. OMDB API (http://www.omdbapi.com/) — movie search, details, ratings
 *   2. TMDB API (https://api.themoviedb.org/) — trending movies, posters
 *
 * Features:
 *   - Search movies by title (OMDB)
 *   - Browse trending movies (TMDB)
 *   - Watchlist management with status (To Watch / Watched)
 *   - Movie detail modal
 *   - Filter by status tab
 *   - Persistent storage via localStorage
 */

import { showToast, escapeHtml, $, skeletonLines, Store, debounce, formatDate } from './utils.js';

// ─── API Configuration ────────────────────────────────────────────────────────
// NOTE: Replace these with your own keys for production use.
// OMDB free key (demo key with limited requests):
const OMDB_KEY = 'trilogy'; // free demo key — replace with your own from omdbapi.com
const TMDB_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwZGQyMjE5Yjk4MWNmZGYzY2E4NjNiNzk2MjdiNTkwYSIsInN1YiI6IjY1YjZkNzBiMmIzYzRjMDE3YzZkNjFiMyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.bGEMoD-fjJPFYR_7GUFnEbMwFDqCUFuZ6jbx4C3jnPM'; // TMDB read token

const OMDB_BASE = 'https://www.omdbapi.com/';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';

const STORE_KEY = 'movieTracker_watchlist';

// ─── Watchlist State ─────────────────────────────────────────────────────────

/**
 * @typedef {{ imdbID: string, Title: string, Year: string,
 *             Poster: string, status: 'watchlist'|'watched',
 *             addedAt: string }} WatchlistEntry
 */

/** @type {Map<string, WatchlistEntry>} */
let watchlist = new Map(Object.entries(Store.get(STORE_KEY, {})));

/** Persist watchlist to storage. */
function saveWatchlist() {
  Store.set(STORE_KEY, Object.fromEntries(watchlist));
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * Searches movies via OMDB.
 * @param {string} query
 * @returns {Promise<Array>}
 */
async function searchMovies(query) {
  const url = `${OMDB_BASE}?apikey=${OMDB_KEY}&s=${encodeURIComponent(query)}&type=movie`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Response === 'False') throw new Error(data.Error || 'No results found');
  return data.Search || [];
}

/**
 * Gets full movie details from OMDB by imdbID.
 * @param {string} imdbID
 * @returns {Promise<Object>}
 */
async function getMovieDetails(imdbID) {
  const url = `${OMDB_BASE}?apikey=${OMDB_KEY}&i=${encodeURIComponent(imdbID)}&plot=full`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Response === 'False') throw new Error(data.Error || 'Movie not found');
  return data;
}

/**
 * Fetches trending movies from TMDB.
 * @returns {Promise<Array>}
 */
async function fetchTrending() {
  const res = await fetch(`${TMDB_BASE}/trending/movie/week?language=en-US`, {
    headers: { Authorization: `Bearer ${TMDB_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load trending movies');
  const data = await res.json();
  return data.results || [];
}

// ─── Render Helpers ───────────────────────────────────────────────────────────

/**
 * Converts TMDB movie to a display-compatible object shape.
 * @param {Object} m - TMDB movie object
 * @returns {Object}
 */
function tmdbToDisplay(m) {
  return {
    imdbID: `tmdb_${m.id}`,
    Title: m.title,
    Year: m.release_date ? m.release_date.slice(0, 4) : 'N/A',
    Poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : 'N/A',
    imdbRating: m.vote_average ? (m.vote_average / 2).toFixed(1) : 'N/A',
    Genre: (m.genre_ids || []).join(','),
    trending: true,
    tmdbId: m.id,
  };
}

/**
 * Renders a movie card element.
 * @param {Object} movie
 * @returns {HTMLElement}
 */
function renderMovieCard(movie) {
  const { imdbID, Title, Year, Poster, imdbRating, trending } = movie;
  const inWatchlist = watchlist.has(imdbID);
  const entry = watchlist.get(imdbID);
  const status = entry ? entry.status : null;

  const card = document.createElement('article');
  card.className = 'movie-card';
  card.dataset.id = imdbID;
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${Title}, ${Year}. Click for details.`);

  const posterHtml = Poster && Poster !== 'N/A'
    ? `<img src="${escapeHtml(Poster)}" alt="${escapeHtml(Title)} poster" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'movie-poster-placeholder\\'><span>🎬</span><span>No Image</span></div>'">`
    : `<div class="movie-poster-placeholder" aria-hidden="true"><span>🎬</span><span>No Image</span></div>`;

  const ratingHtml = imdbRating && imdbRating !== 'N/A'
    ? `<span class="movie-rating" aria-label="Rating ${imdbRating} out of 10">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
         ${escapeHtml(String(imdbRating))}
       </span>`
    : '';

  card.innerHTML = `
    <div class="movie-poster">
      ${trending ? '<span class="trending-label" aria-label="Trending">🔥 Trending</span>' : ''}
      ${posterHtml}
      <div class="movie-poster-overlay" aria-hidden="true">
        <button class="btn btn-primary btn-sm detail-btn" data-id="${escapeHtml(imdbID)}" aria-label="View details for ${escapeHtml(Title)}">Details</button>
      </div>
    </div>
    <div class="movie-info">
      <h3 class="movie-title">${escapeHtml(Title)}</h3>
      <p class="movie-year">${escapeHtml(Year)}</p>
      <div class="movie-meta">
        ${ratingHtml}
        ${inWatchlist ? `<span class="badge ${status === 'watched' ? 'badge-success' : 'badge-info'}">${status === 'watched' ? 'Watched' : 'In List'}</span>` : ''}
      </div>
      <div class="status-buttons" role="group" aria-label="Watchlist actions for ${escapeHtml(Title)}">
        <button class="status-btn ${status === 'watchlist' ? 'active-watchlist' : ''}"
          data-action="watchlist" data-id="${escapeHtml(imdbID)}"
          aria-pressed="${status === 'watchlist'}"
          aria-label="Add to watchlist">+ List</button>
        <button class="status-btn ${status === 'watched' ? 'active-watched' : ''}"
          data-action="watched" data-id="${escapeHtml(imdbID)}"
          aria-pressed="${status === 'watched'}"
          aria-label="Mark as watched">✓ Seen</button>
      </div>
    </div>`;

  // Store movie data on element for event delegation
  card._movieData = movie;

  return card;
}

/**
 * Renders the watchlist section.
 */
function renderWatchlist() {
  const container = $('#watchlist-container');
  const noItems = $('#watchlist-empty');
  const totalEl = $('#stat-total');
  const watchedEl = $('#stat-watched');
  const pendingEl = $('#stat-pending');

  const entries = [...watchlist.values()];
  const activeTab = $('.tab-btn.active')?.dataset.tab || 'all';

  const filtered = entries.filter((e) => {
    if (activeTab === 'all') return true;
    return e.status === activeTab;
  });

  const totalCount = entries.length;
  const watchedCount = entries.filter((e) => e.status === 'watched').length;
  const pendingCount = totalCount - watchedCount;

  if (totalEl) totalEl.textContent = totalCount;
  if (watchedEl) watchedEl.textContent = watchedCount;
  if (pendingEl) pendingEl.textContent = pendingCount;

  if (!filtered.length) {
    container.innerHTML = '';
    noItems.hidden = false;
    return;
  }

  noItems.hidden = true;

  container.innerHTML = `
    <ul class="watchlist-list" role="list" aria-label="Your watchlist">
      ${filtered.map((entry) => `
        <li class="watchlist-item" data-id="${escapeHtml(entry.imdbID)}">
          ${entry.Poster && entry.Poster !== 'N/A'
            ? `<img class="watchlist-thumb" src="${escapeHtml(entry.Poster)}" alt="${escapeHtml(entry.Title)} thumbnail" loading="lazy">`
            : `<div class="watchlist-thumb-placeholder" aria-hidden="true">🎬</div>`}
          <div class="watchlist-info">
            <p class="watchlist-movie-title">${escapeHtml(entry.Title)}</p>
            <p class="watchlist-movie-meta">${escapeHtml(entry.Year)} &middot; Added ${formatDate(entry.addedAt, 'short')}</p>
            <span class="badge ${entry.status === 'watched' ? 'badge-success' : 'badge-info'}">
              ${entry.status === 'watched' ? 'Watched' : 'To Watch'}
            </span>
          </div>
          <div class="watchlist-actions">
            <button class="btn btn-secondary btn-sm status-toggle-btn"
              data-id="${escapeHtml(entry.imdbID)}"
              data-current="${escapeHtml(entry.status)}"
              aria-label="Toggle status for ${escapeHtml(entry.Title)}">
              ${entry.status === 'watched' ? '↩ Unwatch' : '✓ Watched'}
            </button>
            <button class="btn btn-danger btn-sm remove-btn"
              data-id="${escapeHtml(entry.imdbID)}"
              aria-label="Remove ${escapeHtml(entry.Title)} from watchlist">✕</button>
          </div>
        </li>`).join('')}
    </ul>`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

/**
 * Opens a movie detail modal.
 * @param {string} imdbID
 * @param {string} [tmdbId] - Optional TMDB id for backdrop image
 */
async function openModal(imdbID, tmdbId) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Movie details');

  backdrop.innerHTML = `
    <div class="modal" id="movie-modal">
      <button class="modal-close" aria-label="Close dialog">&times;</button>
      <div class="loading-state"><div class="spinner" role="status" aria-label="Loading"></div>Loading details…</div>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  // Focus trap
  const closeBtn = backdrop.querySelector('.modal-close');
  closeBtn.focus();

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(backdrop); });
  closeBtn.addEventListener('click', () => closeModal(backdrop));

  // Close on Escape
  const onKeydown = (e) => { if (e.key === 'Escape') { closeModal(backdrop); document.removeEventListener('keydown', onKeydown); } };
  document.addEventListener('keydown', onKeydown);

  try {
    // For TMDB-only movies, we get limited info from OMDB
    let details;
    if (imdbID.startsWith('tmdb_')) {
      // Use TMDB movie detail endpoint instead
      const tid = imdbID.replace('tmdb_', '');
      const res = await fetch(`${TMDB_BASE}/movie/${tid}?language=en-US`, {
        headers: { Authorization: `Bearer ${TMDB_KEY}` },
      });
      const d = await res.json();
      details = {
        Title: d.title,
        Year: d.release_date ? d.release_date.slice(0, 4) : 'N/A',
        Rated: d.adult ? 'R' : 'PG-13',
        Runtime: d.runtime ? `${d.runtime} min` : 'N/A',
        Genre: (d.genres || []).map((g) => g.name).join(', '),
        Director: 'N/A',
        Actors: 'N/A',
        Plot: d.overview || 'No plot available.',
        Language: d.original_language ? d.original_language.toUpperCase() : 'N/A',
        Country: (d.production_countries || []).map((c) => c.name).join(', ') || 'N/A',
        imdbRating: d.vote_average ? (d.vote_average / 2).toFixed(1) : 'N/A',
        BoxOffice: d.revenue ? `$${d.revenue.toLocaleString()}` : 'N/A',
        Poster: d.poster_path ? `${TMDB_IMG}${d.poster_path}` : 'N/A',
        Backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
      };
    } else {
      details = await getMovieDetails(imdbID);
    }

    populateModal(backdrop.querySelector('#movie-modal'), details, imdbID);
  } catch (err) {
    backdrop.querySelector('#movie-modal').innerHTML = `
      <button class="modal-close" aria-label="Close">&times;</button>
      <div class="modal-body"><p class="empty-state-text" role="alert">⚠ ${escapeHtml(err.message)}</p></div>`;
    backdrop.querySelector('.modal-close').addEventListener('click', () => closeModal(backdrop));
  }
}

/**
 * Populates the modal with movie details.
 * @param {HTMLElement} modal
 * @param {Object} details
 * @param {string} imdbID
 */
function populateModal(modal, details, imdbID) {
  const {
    Title, Year, Rated, Runtime, Genre, Director, Actors,
    Plot, Language, Country, imdbRating, BoxOffice, Poster, Backdrop,
  } = details;

  const entry = watchlist.get(imdbID);
  const status = entry ? entry.status : null;

  modal.innerHTML = `
    <button class="modal-close" aria-label="Close dialog">&times;</button>
    ${Backdrop
      ? `<img class="modal-banner" src="${escapeHtml(Backdrop)}" alt="${escapeHtml(Title)} backdrop" loading="lazy">`
      : `<div class="modal-banner-placeholder" aria-hidden="true">🎬</div>`}
    <div class="modal-body">
      <h2 class="modal-title">${escapeHtml(Title)}</h2>
      <div class="modal-meta-row">
        <span>${escapeHtml(Year)}</span>
        <span aria-label="Rating">${Rated && Rated !== 'N/A' ? escapeHtml(Rated) : ''}</span>
        <span>${Runtime && Runtime !== 'N/A' ? escapeHtml(Runtime) : ''}</span>
        ${imdbRating && imdbRating !== 'N/A'
          ? `<span class="movie-rating" aria-label="IMDB rating ${imdbRating}">⭐ ${escapeHtml(String(imdbRating))} / 10</span>`
          : ''}
        ${status ? `<span class="badge ${status === 'watched' ? 'badge-success' : 'badge-info'}">${status === 'watched' ? 'Watched' : 'In Watchlist'}</span>` : ''}
      </div>
      <p class="modal-plot">${escapeHtml(Plot || 'No plot available.')}</p>
      <div class="modal-details-grid" role="list">
        ${[[' Genre', Genre], ['Director', Director], ['Cast', Actors], ['Language', Language], ['Country', Country], ['Box Office', BoxOffice]]
          .filter(([, v]) => v && v !== 'N/A')
          .map(([label, value]) => `
            <div class="detail-item" role="listitem">
              <p class="detail-label">${escapeHtml(label)}</p>
              <p class="detail-value">${escapeHtml(value)}</p>
            </div>`).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary modal-watchlist-btn"
          data-id="${escapeHtml(imdbID)}"
          data-action="watchlist"
          aria-pressed="${status === 'watchlist'}">
          ${status === 'watchlist' ? '✓ In Watchlist' : '+ Add to Watchlist'}
        </button>
        <button class="btn btn-primary modal-watched-btn"
          data-id="${escapeHtml(imdbID)}"
          data-action="watched"
          aria-pressed="${status === 'watched'}">
          ${status === 'watched' ? '↩ Unmark Watched' : '✓ Mark Watched'}
        </button>
      </div>
    </div>`;

  // Re-attach close button
  modal.querySelector('.modal-close').addEventListener('click', () => closeModal(modal.closest('.modal-backdrop')));

  // Modal watchlist buttons
  modal.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const movieData = { imdbID, Title, Year, Poster };
      toggleStatus(movieData, btn.dataset.action);
      closeModal(modal.closest('.modal-backdrop'));
      renderWatchlist();
      renderMovieCards();
    });
  });
}

/**
 * Closes and removes a modal backdrop.
 * @param {HTMLElement} backdrop
 */
function closeModal(backdrop) {
  backdrop.classList.add('closing');
  backdrop.addEventListener('animationend', () => {
    backdrop.remove();
    document.body.style.overflow = '';
  }, { once: true });
}

// ─── Watchlist Logic ──────────────────────────────────────────────────────────

/**
 * Toggles or sets a movie's status in the watchlist.
 * @param {Object} movie
 * @param {'watchlist'|'watched'} action
 */
function toggleStatus(movie, action) {
  const { imdbID } = movie;
  const existing = watchlist.get(imdbID);

  if (existing && existing.status === action) {
    // Remove if clicking the same status again
    watchlist.delete(imdbID);
    showToast(`Removed "${movie.Title}" from your list`, 'info');
  } else {
    watchlist.set(imdbID, {
      imdbID,
      Title: movie.Title,
      Year: movie.Year,
      Poster: movie.Poster,
      status: action,
      addedAt: new Date().toISOString(),
    });
    const label = action === 'watched' ? 'Marked as watched' : 'Added to watchlist';
    showToast(`${label}: "${movie.Title}"`, 'success');
  }

  saveWatchlist();
}

// ─── Display & Search ─────────────────────────────────────────────────────────

/** @type {Array<Object>} */
let currentMovies = [];

/**
 * Renders the movie grid with the current movie list.
 */
function renderMovieCards() {
  const grid = $('#movie-grid');
  if (!currentMovies.length) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = '';
  currentMovies.forEach((movie) => {
    const card = renderMovieCard(movie);
    grid.appendChild(card);
  });
}

/**
 * Handles the search form submission.
 * @param {Event} e
 */
async function handleSearch(e) {
  e.preventDefault();
  const query = $('#search-input').value.trim();
  if (!query) return;

  const grid = $('#movie-grid');
  const trendingSection = $('#trending-section');

  trendingSection.hidden = true;
  grid.innerHTML = `<div class="loading-state"><div class="spinner" role="status" aria-label="Searching"></div>Searching for "${escapeHtml(query)}"…</div>`;

  try {
    const results = await searchMovies(query);
    currentMovies = results;
    renderMovieCards();
    if (!results.length) showToast('No movies found for that search.', 'info');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">
      <p class="empty-state-icon" aria-hidden="true">🔍</p>
      <p class="empty-state-title">No results</p>
      <p class="empty-state-text">${escapeHtml(err.message)}</p>
    </div>`;
    showToast(err.message, 'error');
  }
}

// ─── Event Delegation ─────────────────────────────────────────────────────────

/**
 * Sets up delegated events for the movie grid.
 */
function initGridEvents() {
  const grid = $('#movie-grid');

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.movie-card');
    const actionBtn = e.target.closest('[data-action]');
    const detailBtn = e.target.closest('.detail-btn');

    if (detailBtn) {
      e.stopPropagation();
      openModal(detailBtn.dataset.id);
      return;
    }

    if (actionBtn && card) {
      e.stopPropagation();
      toggleStatus(card._movieData, actionBtn.dataset.action);
      renderWatchlist();
      renderMovieCards();
      return;
    }

    if (card) {
      openModal(card.dataset.id);
    }
  });

  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.movie-card');
      if (card) { e.preventDefault(); openModal(card.dataset.id); }
    }
  });
}

/**
 * Sets up watchlist panel events.
 */
function initWatchlistEvents() {
  const container = $('#watchlist-container');

  container.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-btn');
    const toggleBtn = e.target.closest('.status-toggle-btn');

    if (removeBtn) {
      const id = removeBtn.dataset.id;
      const entry = watchlist.get(id);
      if (entry) {
        watchlist.delete(id);
        saveWatchlist();
        renderWatchlist();
        renderMovieCards();
        showToast(`Removed "${entry.Title}" from watchlist`, 'info');
      }
    } else if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const entry = watchlist.get(id);
      if (entry) {
        const newStatus = entry.status === 'watched' ? 'watchlist' : 'watched';
        entry.status = newStatus;
        watchlist.set(id, entry);
        saveWatchlist();
        renderWatchlist();
        renderMovieCards();
        showToast(`Status updated for "${entry.Title}"`, 'success');
      }
    }
  });

  // Tabs
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      renderWatchlist();
    });
  });
}

// ─── Trending Movies ─────────────────────────────────────────────────────────

/**
 * Loads and renders trending movies from TMDB.
 */
async function loadTrending() {
  const grid = $('#movie-grid');
  grid.innerHTML = `<div class="loading-state"><div class="spinner" role="status" aria-label="Loading"></div>Loading trending movies…</div>`;

  try {
    const results = await fetchTrending();
    currentMovies = results.slice(0, 12).map(tmdbToDisplay);
    renderMovieCards();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">
      <p class="empty-state-icon" aria-hidden="true">⚠️</p>
      <p class="empty-state-title">Failed to load trending</p>
      <p class="empty-state-text">${escapeHtml(err.message)}</p>
    </div>`;
    showToast('Could not load trending movies', 'error');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/** Main entry point. */
function init() {
  // Search form
  const form = $('#search-form');
  form.addEventListener('submit', handleSearch);

  // Clear / show trending
  const clearBtn = $('#clear-search-btn');
  clearBtn?.addEventListener('click', () => {
    $('#search-input').value = '';
    $('#trending-section').hidden = false;
    loadTrending();
  });

  // Grid + watchlist events
  initGridEvents();
  initWatchlistEvents();

  // Initial render
  loadTrending();
  renderWatchlist();
}

document.addEventListener('DOMContentLoaded', init);
