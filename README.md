# SUPERFINDERX

SUPERFINDERX is a local React and Express app for comparing marketplace-style listings by overall value. It ranks sample listings from a product, location, and pickup radius, then weighs price, condition, distance, seller reviews, and trust signals.

## What It Does

- Accepts a product, city/postal code/current location, and max pickup distance.
- Ranks listings by price, condition, location, distance, seller reviews, and trust signals.
- Highlights the best overall deal, best value, most trusted seller, and budget option.
- Marks or hides listings outside the preferred range.
- Opens approximate pickup areas in an optional map overlay.
- Requires login/signup before using the dashboard and keeps the session in the browser.
- Adds direct listing links so each deal can be opened in a new tab.
- Saves ranked deals locally through the backend.

## Privacy

Location is used only for distance ranking inside the app. The UI shows general areas and does not display an exact home address or precise user location.

## Safety

- This app does not scrape Facebook or any marketplace.
- This app does not automate marketplace login.
- This app does not auto-message sellers.
- Listings are generated locally as a ranking workflow demo unless you connect your own data source later.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Storage: local JSON file at `backend/data/deals.json`

## Install

```bash
npm install
npm run install:all
```

## Run

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:5001
```

## Backend API

```text
GET    /api/health
POST   /api/auth/signup
POST   /api/auth/login
GET    /api/auth/session
GET    /api/rank-listings
GET    /api/deals
POST   /api/deals
DELETE /api/deals/:id
```
