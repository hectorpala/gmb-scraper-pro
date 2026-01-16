# Copilot / AI Agent Instructions — GMB Scraper

Short, actionable notes to help an AI engineer be productive in this repository.

- **Big picture**: This repo is a small Node.js (ESM) web app that scrapes Google Maps (via Puppeteer) and persists results locally (CSV/JSON) and optionally to Google Sheets. Main components: `backend/` (server, scraper, exporters, Google Sheets integration), `frontend/` (single-page UI), and `output/` (exports).

- **Important files**:
  - `backend/server.js` — Express API + static file server, ports: app `PORT` (default 8000). Serves `frontend/` and `output/`.
  - `backend/scraper.js` — Puppeteer scraping logic (user-agent rotation, headless, singleton browser). Note: `executablePath` currently points to macOS Chrome.
  - `backend/googleSheets.js` — OAuth desktop flow (listens on port 3333), token stored at `token.json`, spreadsheet id at `spreadsheet_config.json`.
  - `backend/exporter.js` — CSV/JSON export naming pattern and `output/` management.
  - `frontend/app.js` + `frontend/index.html` — UI that calls the backend API endpoints.
  - `run.sh` — macOS-friendly runner: checks Node >=18, installs dependencies, runs `npx puppeteer browsers install chrome`, and starts `node server.js`.

- **Run / dev workflows**:
  - Quick start (desktop wrapper): double-click the app (per README). Otherwise, run the included script:

    cd "Scraper google my business"
    ./run.sh

  - Manual dev: from backend directory:

    cd "Scraper google my business/backend"
    npm install
    npm start

  - Node requirement: Node 18+ (see `run.sh` and `backend/package.json` which uses ESM — `type: "module"`).

- **API contract (examples)**:
  - POST `/api/scrape` JSON body: `{ "businessType": "plomeria", "city": "Culiacan", "country": "Mexico", "exportToGoogleSheets": true }` — returns `data.businesses`, `data.exports` with `json` and `csv` paths.
  - GET `/api/google/status` — checks credentials & authentication.
  - GET `/api/google/connect` — returns `authUrl` to open for OAuth.
  - GET `/api/export/:format` (`json`|`csv`) — returns `downloadUrl`.

- **Google Sheets integration notes**:
  - `credentials.json` must live in the project root (see README). OAuth server listens on port `3333` and writes `token.json` after successful auth.
  - Spreadsheet metadata is saved to `spreadsheet_config.json` (contains `spreadsheetId`). Modifying this file changes where rows are appended.
  - When automating tests, stub or mock `googleapis` calls rather than performing real OAuth.

- **Scraper specifics & editing tips**:
  - `backend/scraper.js` uses a browser singleton (`browserInstance`) and sets `executablePath` to a system Chrome. If you prefer to use Puppeteer's bundled browser, remove `executablePath` and ensure `npx puppeteer browsers install chrome` has completed (see `run.sh`).
  - The scraper waits for `div[role="feed"]` and clicks result anchors matching `/maps/place/`. Be conservative when changing selectors — tests rely on these keys.
  - Random delays and UA rotation are deliberate to reduce blocking; keep them unless testing in a controlled environment.

- **Export patterns**:
  - `backend/exporter.js` creates filenames using: `{sanitize(businessType)}_{sanitize(city)}_{sanitize(country)}_{timestamp}.{ext}`. Tests or tooling that parse filenames expect this pattern.
  - Exports are written to `output/` and served at `/output/<filename>` by the Express static middleware.

- **Common gotchas**:
  - ESM modules: use `import`/`export` syntax; avoid CommonJS `require` in backend files.
  - Puppeteer on macOS: `run.sh` installs a browser; the code currently points to `/Applications/Google Chrome.app/...`. If CI uses Linux containers, update `executablePath` accordingly or rely on installed puppeteer browser.
  - Google OAuth requires a desktop client in Google Cloud Console and the `credentials.json` format that `googleapis` expects (installed/web key object).

- **Where to change behavior safely**:
  - To change export columns or CSV formatting: update `backend/exporter.js` columns array.
  - To add new frontend controls: update `frontend/index.html` and `frontend/app.js` (UI sends same API requests).

If anything here is unclear or you want me to expand examples (curl endpoints, test harness, or CI adjustments), tell me which section to improve.
