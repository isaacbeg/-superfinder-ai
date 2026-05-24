# The Secret Society

The Secret Society is a luxury dark-theme private AI dashboard. Deal Hunter now has two modes:

- Live Research through SerpAPI Google Shopping
- Facebook Manual Listings for safe manual Marketplace review

No fake live listings are shown.

## What Works Now

- Cinematic landing page
- Fake login for the MVP
- Dashboard with agent cards
- Deal Hunter tabs:
  - Live Research
  - Facebook Manual Listings
  - Saved Deals
- Quick Solver for math and room/material estimates
- Saved results stored locally in `backend/data/results.json`
- Backend research route for real SerpAPI Google Shopping results
- Manual Facebook listing analyzer and ranker

## Live Research Sources

Live Research uses SerpAPI as the only live source for now. eBay, Kijiji, Facebook, and Best Buy API keys are not required.

| Source | Status |
| --- | --- |
| SerpAPI Google Shopping | Live product research when `SERPAPI_API_KEY` is set. Fetches real Google Shopping titles, prices, stores, links, and images. |
| Facebook Marketplace | Manual only. The app creates a Marketplace search URL and paste box but does not scrape, login, or automate messages. |

If the SerpAPI key is missing, the app shows `API not connected`.

## API Keys

Copy the example env file:

```bash
cp .env.example .env
```

Then add keys:

```text
SERPAPI_API_KEY=
```

Restart the backend after changing `.env`.

## Important Safety Rules

- The app does not scrape Facebook Marketplace.
- The app does not automate Facebook login.
- The app does not auto-message sellers.
- Seller messages are manual copy/paste only.
- Live Research only returns results from SerpAPI Google Shopping.

## Backend Routes

```text
GET  /api/research?item=&budget=&location=&category=
POST /api/analyze-listings
POST /api/save-result
GET  /api/saved-results
GET  /api/results
POST /api/results
DELETE /api/results/:id
```

## Install

From this folder:

```bash
cd "/Users/a2025/Isaac AI Agent /the-secret-society"
npm install
npm run install:all
```

## Run

Run frontend and backend together:

```bash
npm run dev
```

Open the dashboard:

```text
http://localhost:5174
```

Backend:

```text
http://localhost:5002
```

## Publish

The app is deployable as one Node web service. The backend serves both:

- the React dashboard from `frontend/dist`
- the API routes under `/api`

Recommended Render settings:

```text
Root Directory: the-secret-society
Build Command: npm install && npm run install:all && npm run build
Start Command: npm start
Environment Variable: SERPAPI_API_KEY=your_serpapi_key
```

If using the included `render.yaml`, create a Render Blueprint from the repo and add `SERPAPI_API_KEY` when Render asks for it.

## How To Test Live Research

1. Open `http://localhost:5174`.
2. Login with anything.
3. Open `Deal Hunter`.
4. Use the `Live Research` tab.
5. Type:

```text
iPhone 17 pro what are the best prices my budget is under $1,000 near Markham
```

6. Click `Research Deals`.

Without `SERPAPI_API_KEY`, you should see:

```text
API not connected. Add SERPAPI_API_KEY to enable live research.
```

With `SERPAPI_API_KEY`, SerpAPI returns real product cards with:

- title
- price
- source/store
- link
- image if available
- ranking score
- badges such as `Best Deal`, `Cheapest`, or `Over Budget`

## How To Test Facebook Manual Listings

1. Open `Deal Hunter`.
2. Open the `Facebook Manual Listings` tab.
3. Enter:

```text
Find me an iPhone 16 Pro Max under $1000 near Markham
```

4. Paste:

```text
iPhone 16 Pro Max 256GB - $950 - Markham - unlocked - 100% battery - minor scratches
iPhone 16 Pro Max 256GB - $800 - Toronto - iCloud locked - cracked
```

5. Click `Analyze Listings`.

The app ranks the pasted listings and gives scores, red flags, offer prices, and recommendations.

## How To Test Quick Solver

Try:

```text
9x6
```

Try:

```text
a room is 9 ft by 6 ft
```

Try:

```text
flooring for 9x6 room at $4 per sqft
```

## Project Structure

```text
the-secret-society
├── .env.example
├── backend
│   ├── data
│   │   └── results.json
│   ├── src
│   │   ├── agentLogic.js
│   │   ├── researchSources.js
│   │   └── server.js
│   └── package.json
├── frontend
│   ├── public
│   │   └── assets
│   │       └── society-command-room.png
│   ├── src
│   │   ├── main.jsx
│   │   └── styles.css
│   └── package.json
└── README.md
```
