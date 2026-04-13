# VisaTrack Pro

**Smarter H-1B employer intelligence. Powered by real USCIS data and AI.**

VisaTrack Pro ingests official USCIS H-1B petition data and serves it through a full-stack web platform with an interactive US map, company search, AI-enriched profiles, trend charts, and a clean REST API.

---

## Quick Start

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add your OPENAI_API_KEY
```

### 3. Start both services

```bash
npm run dev
```

On first backend startup, VisaTrack Pro automatically downloads the USCIS H-1B CSV files, imports all supported years into SQLite, and replaces old demo-only data if it exists.

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001/api

```bash
npm run sync:data
```

Use this if you want to trigger a full USCIS refresh manually from the command line.

---

## Loading Real USCIS Data

Real USCIS data is now the default path.

- Automatic first run: if the database is empty, the backend downloads and imports all USCIS CSVs on startup.
- Automatic annual refresh: a `node-cron` job runs on the schedule in `USCIS_SYNC_SCHEDULE`.
- Manual CLI refresh: run `npm run sync:data`.
- Manual API refresh: call `POST /api/admin/refresh`.
- Manual UI refresh: use the Refresh Data panel on the home page.

If you still want to import a local CSV file manually:

```bash
node backend/scripts/importCSV.js path/to/H-1B_FY2023.csv 2023
node backend/scripts/importCSV.js path/to/H-1B_FY2022.csv 2022
```

The importer auto-detects column names from USCIS CSV variants and upserts records safely, so re-running a year does not create duplicates.

---

## Project Structure

```
VisaTrack Pro/
├── backend/
│   ├── server.js           # Express app entry point (port 3001)
│   ├── db/
│   │   └── schema.js       # SQLite schema + getDb()
│   ├── routes/
│   │   ├── companies.js    # GET /api/companies, /api/companies/:name
│   │   ├── states.js       # GET /api/states, /api/states/:code
│   │   └── enrich.js       # GET /api/enrich/:name, POST /api/enrich/batch
│   ├── scripts/
│   │   ├── importCSV.js    # USCIS CSV importer
│   │   ├── seedDemo.js     # Optional demo data seeder
│   │   └── syncUSCIS.js    # Full USCIS download + import runner
│   ├── services/
│   │   └── dataSync.js     # Scheduled/manual USCIS sync manager
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router + Navbar + Footer
│   │   ├── pages/
│   │   │   ├── HomePage.jsx     # Interactive US map + stats
│   │   │   ├── CompaniesPage.jsx # Search/filter table
│   │   │   ├── CompanyPage.jsx   # Company profile + trend chart
│   │   │   ├── StatePage.jsx     # State drill-down
│   │   │   └── ApiDocsPage.jsx   # REST API reference
│   │   └── components/
│   │       ├── USMap.jsx        # SVG choropleth map
│   │       ├── TrendChart.jsx   # Recharts bar/line chart
│   │       ├── SearchFilters.jsx # Search + filter bar
│   │       └── Pagination.jsx   # Page navigation
│   └── vite.config.js      # Proxies /api → :3001
└── package.json            # Root scripts for both services
```

---

## REST API

All endpoints return JSON. See the in-app **API Docs** page at `/api-docs` for interactive documentation.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List companies. Params: `state`, `year`, `search`, `page`, `limit`, `sort`, `order` |
| GET | `/api/companies/:name` | Full H-1B history + enrichment for one company |
| GET | `/api/states` | Aggregated stats for all states. Param: `year` |
| GET | `/api/states/:code` | Stats + top employers + yearly trend for one state |
| GET | `/api/enrich/:name` | Claude AI lookup: website + LinkedIn. Cached 30 days. |
| POST | `/api/enrich/batch` | Enrich up to 10 companies. Body: `{ companies: [...] }` |
| GET | `/api/health` | Health check — status, record count, available years |
| GET | `/api/admin/refresh` | Current USCIS sync status and progress |
| POST | `/api/admin/refresh` | Trigger a USCIS refresh run |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, better-sqlite3 |
| AI Enrichment | Anthropic Claude (claude-haiku-4-5) |
| Frontend | React 18, React Router v6, Vite |
| Charts | Recharts |
| Database | SQLite (h1b.db) |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for AI enrichment | Required |
| `PORT` | Backend port | `3001` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `DB_PATH` | Path to SQLite database file | `./h1b.db` |
| `USCIS_SYNC_ON_STARTUP` | Auto-download/import USCIS data when DB is empty | `true` |
| `USCIS_SYNC_SCHEDULE_ENABLED` | Enable annual scheduled refresh | `true` |
| `USCIS_SYNC_SCHEDULE` | Cron expression for scheduled refresh | `0 5 15 1 *` |
| `USCIS_SYNC_YEARS` | Optional comma-separated year whitelist | all supported years |
| `ADMIN_API_TOKEN` | Optional token for POST `/api/admin/refresh` | unset |

---

## Data Source

H-1B petition data is sourced from the official [USCIS H-1B Employer Data Hub](https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub). AI company enrichment is provided by Claude (Anthropic) and cached for 30 days per company.
