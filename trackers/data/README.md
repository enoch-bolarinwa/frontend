# TrackHub — JSON Data Files

This directory contains configuration files and mock data for the TrackHub application.

## 📁 File Structure

```
data/
├── config.json           ← API keys, endpoints, settings
├── mockMovies.json       ← Sample movie data (trending, classics, watchlist)
├── mockShipments.json    ← Sample shipping data (packages, carriers, status codes)
└── sampleProducts.json   ← Sample shopping items (groceries, electronics, etc.)
```

---

## 🔧 config.json

Central configuration file for API credentials and app settings.

### Structure:
```json
{
  "apiKeys": {
    "omdb": "your-key",
    "tmdb": "your-token",
    "aftership": "your-key",
    "opencage": "your-key"
  },
  "apiEndpoints": { ... },
  "settings": {
    "movie": { ... },
    "shipping": { ... },
    "shopping": { ... }
  },
  "features": { ... }
}
```

### Usage:
To load configuration in your JavaScript:
```javascript
// Option 1: Fetch dynamically (recommended for production)
const config = await fetch('./config.json').then(r => r.json());
const OMDB_KEY = config.apiKeys.omdb;

// Option 2: Import as module (requires build step)
import config from './data/config.json' assert { type: 'json' };
```

### How to Use Your Own API Keys:
1. Open `config.json`
2. Replace placeholder values in `apiKeys` section:
   - **OMDB**: Get free key at https://www.omdbapi.com/apikey.aspx
   - **TMDB**: Register at https://www.themoviedb.org/settings/api
   - **AfterShip**: Sign up at https://www.aftership.com/
   - **OpenCage**: Get key at https://opencagedata.com/

---

## 🎬 mockMovies.json

Sample movie data for testing the Movie Tracker without API calls.

### Structure:
```json
{
  "trending": [ /* 6 recent popular movies */ ],
  "classics": [ /* 5 all-time great films */ ],
  "sampleWatchlist": [ /* 3 movies with status */ ]
}
```

### Movie Object Schema:
```typescript
{
  imdbID: string;         // Unique IMDB identifier
  Title: string;          // Movie title
  Year: string;           // Release year
  Poster: string;         // Image URL
  imdbRating: string;     // Rating out of 10
  Genre: string;          // Comma-separated genres
  Plot?: string;          // Full plot description
  Director?: string;      // Director name(s)
  Actors?: string;        // Main actors
  Runtime?: string;       // Duration (e.g., "120 min")
  Released?: string;      // Release date
  status?: string;        // For watchlist: "watchlist" | "watched"
  addedAt?: string;       // ISO timestamp
}
```

### Usage Example:
```javascript
// Load mock data for offline development
const mockData = await fetch('./data/mockMovies.json').then(r => r.json());
const trendingMovies = mockData.trending;

// Use in place of API call
function loadTrendingDemo() {
  currentMovies = mockData.trending;
  renderMovieCards();
}
```

---

## 📦 mockShipments.json

Sample shipping data with tracking events and carrier information.

### Structure:
```json
{
  "activeShipments": [ /* 3 packages at different stages */ ],
  "carriers": [ /* 5 carrier configurations */ ],
  "statusCodes": { /* Status definitions */ }
}
```

### Shipment Object Schema:
```typescript
{
  id: string;                    // Unique package ID
  trackingNumber: string;        // Carrier tracking number
  carrier: string;               // Carrier code (ups, fedex, etc.)
  label: string;                 // User-friendly name
  status: string;                // Current status
  estimatedDelivery: string | null;  // ISO timestamp
  addedAt: string;               // When added to tracker
  events: Array<{
    timestamp: string;           // Event time
    description: string;         // What happened
    location: string;            // Where it happened
  }>;
  geocode?: {
    lat: number;
    lng: number;
  };
}
```

### Usage Example:
```javascript
// Demo mode: use mock shipments
const mockData = await fetch('./data/mockShipments.json').then(r => r.json());

function loadDemoPackages() {
  mockData.activeShipments.forEach(shipment => {
    packages.set(shipment.id, shipment);
  });
  renderPackages();
}
```

---

## 🛒 sampleProducts.json

Sample shopping items organized by category with pricing and details.

### Structure:
```json
{
  "groceries": [ /* Food items with barcodes */ ],
  "health": [ /* Vitamins, medicines */ ],
  "electronics": [ /* Tech accessories */ ],
  "clothing": [ /* Apparel */ ],
  "home": [ /* Household items */ ],
  "popularSearches": [ /* Common search terms */ ],
  "priceAlertExamples": [ /* Items with price tracking */ ]
}
```

### Product Object Schema:
```typescript
{
  code?: string;              // Barcode (for Open Food Facts items)
  product_name: string;       // Product name
  brands: string;             // Brand name
  categories_tags: string[];  // Category tags
  image_thumb_url?: string;   // Product image
  price: number;              // Price in USD
  weight?: string;            // Package weight/size
  count?: string;             // Item count
  specs?: string;             // Technical specifications
  sizes?: string[];           // Available sizes
  styles?: string[];          // Style options
}
```

### Usage Example:
```javascript
// Load sample products for testing
const sampleData = await fetch('./data/sampleProducts.json').then(r => r.json());

// Populate search dropdown with popular items
function setupQuickAdd() {
  const datalist = document.createElement('datalist');
  datalist.id = 'popular-items';
  sampleData.popularSearches.forEach(term => {
    const option = document.createElement('option');
    option.value = term;
    datalist.appendChild(option);
  });
  document.body.appendChild(datalist);
  searchInput.setAttribute('list', 'popular-items');
}

// Demo barcode lookup
function mockBarcodeSearch(barcode) {
  const allProducts = [
    ...sampleData.groceries,
    ...sampleData.health,
    ...sampleData.electronics
  ];
  return allProducts.find(p => p.code === barcode);
}
```

---

## 🔄 Integration with Main App

### Option 1: Offline/Demo Mode
Load JSON files directly when API keys are not available:

```javascript
// In movie.js
const DEMO_MODE = true;

async function fetchTrending() {
  if (DEMO_MODE) {
    const mock = await fetch('./data/mockMovies.json').then(r => r.json());
    return mock.trending.slice(0, 12);
  }
  // ... real API call
}
```

### Option 2: Fallback Data
Use mock data as fallback when API fails:

```javascript
async function searchProduct(query) {
  try {
    // Try real API
    const response = await fetch(`${API_URL}?q=${query}`);
    return await response.json();
  } catch (err) {
    // Fallback to mock data
    console.warn('API unavailable, using sample data');
    const samples = await fetch('./data/sampleProducts.json').then(r => r.json());
    return samples.groceries.filter(p => 
      p.product_name.toLowerCase().includes(query.toLowerCase())
    );
  }
}
```

### Option 3: Testing Fixtures
Use in unit tests:

```javascript
// test/movie.test.js
import mockMovies from '../data/mockMovies.json' assert { type: 'json' };

describe('Movie Tracker', () => {
  it('should render movie cards', () => {
    const movies = mockMovies.trending;
    const cards = renderMovieCards(movies);
    expect(cards).toHaveLength(6);
  });
});
```

---

## 📝 Validation & Schema

All JSON files are validated against the following rules:
- ✅ Valid JSON syntax
- ✅ Required fields present
- ✅ Correct data types
- ✅ ISO 8601 timestamps
- ✅ Valid URLs for images
- ✅ Realistic sample data

To validate manually:
```bash
# Check JSON syntax
node -e "JSON.parse(require('fs').readFileSync('./data/config.json'))"

# Pretty print
cat config.json | python -m json.tool
```

---

## 🔐 Security Notes

⚠️ **Never commit real API keys to version control!**

- The `config.json` file includes placeholder values
- For production: use environment variables or `.env` files
- Add `config.json` to `.gitignore` if storing real keys
- Consider using a secrets manager for deployment

**Recommended approach:**
```javascript
// config.js (not committed)
export const API_KEYS = {
  omdb: process.env.OMDB_KEY || 'demo-key',
  tmdb: process.env.TMDB_KEY || 'demo-key'
};
```

---

## 📊 Data Sources

Mock data is based on:
- **Movies**: Real IMDB data structure from OMDb API
- **Shipments**: Typical tracking event patterns from major carriers
- **Products**: Open Food Facts database format + retail pricing

All sample data is used for educational/demo purposes only.
