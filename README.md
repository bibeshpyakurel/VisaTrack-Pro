# VisaTrack Pro

VisaTrack Pro is an H-1B employer intelligence platform built on top of official USCIS employer disclosure data. It transforms yearly USCIS CSV releases into a searchable product with company profiles, state-level analytics, trend views, enrichment workflows, and a REST API.

The project is designed to make H-1B employer data easier to explore, compare, and operationalize than the raw USCIS download experience allows on its own.

## Product Overview

VisaTrack Pro focuses on employer-level and geography-level visibility across the H-1B dataset.

It is built to answer questions such as:

- Which states show the highest H-1B approval activity?
- Which employers appear consistently across fiscal years?
- How do approvals and denials evolve over time for a company or a state?
- Which employers dominate a given state or industry slice?
- What company context can be added on top of the raw USCIS records?

The application exposes this through a unified experience:

- A dashboard with national and state-level summaries
- A company search and filtering interface
- Individual company history pages with yearly trend analysis
- State drill-down views with top employers and aggregated trends
- A REST API mirroring the same data model used by the frontend

## Why It Matters

The USCIS H-1B Employer Data Hub is authoritative, but it is still primarily a data release mechanism. VisaTrack Pro adds the missing application layer.

Its value comes from four areas:

- Converting annual CSV disclosures into an application-ready dataset
- Preserving multi-year comparability in a queryable local database
- Providing interactive search and drill-down exploration
- Adding optional AI-based company context without altering the source-of-truth data

## How The System Works

VisaTrack Pro operates as a full-stack application backed by a local ingestion and sync pipeline.

1. USCIS publishes yearly H-1B employer CSV exports.
2. The backend downloads those files directly from the USCIS source.
3. The importer normalizes USCIS schema variations across years.
4. Parsed records are stored in SQLite.
5. Express routes expose aggregated and entity-level data through JSON endpoints.
6. The React frontend consumes those endpoints for maps, tables, charts, and status views.
7. Optional AI enrichment attaches supplemental company metadata to employer records.

The platform supports automatic first-run ingestion, annual scheduled sync, manual refresh, and refresh progress reporting.

## Architecture

VisaTrack Pro is intentionally simple in deployment shape while still covering the full data lifecycle.

### Frontend Layer

The frontend is a Vite-powered React application responsible for presentation, interaction, and view-level filtering.

Responsibilities:

- Render state and company summaries
- Provide table filtering, sorting, and pagination
- Visualize trend data
- Surface refresh status and data freshness
- Document the API in-product

### Backend Layer

The backend is an Express service backed by SQLite. It manages ingestion, storage, aggregation, enrichment, and refresh workflows.

Responsibilities:

- Initialize and migrate schema
- Download USCIS data files
- Parse yearly CSV format differences safely
- Deduplicate identical source rows while preserving valid multi-row employer data
- Serve product-facing REST endpoints
- Track sync runs and refresh progress
- Run scheduled and manual refresh jobs

## Data Pipeline Design

The data pipeline is one of the core engineering parts of the project.

### USCIS Source Handling

USCIS yearly exports are not perfectly uniform. Column names and formats vary across years, so the importer normalizes those differences into a stable internal representation before persistence.

### Storage Model

The database stores source-level rows rather than collapsing all employer-year records into a single row. This is important because some employers legitimately appear multiple times within the same fiscal year. The API aggregates those records when it returns company and state summaries.

### Sync Model

The sync process supports:

- Automatic import when the database is empty
- Scheduled yearly refresh using cron
- Manual refresh from API or UI
- Safe year-level replacement on rerun
- Operational visibility through recorded sync-run metadata

### Deduplication Strategy

The system distinguishes between two valid metrics:

- Raw CSV rows processed
- Unique rows stored in the database

This matters because USCIS files can contain identical duplicate rows. VisaTrack Pro keeps the processing count for observability while storing deduplicated records for analytical correctness.

## API Perspective

The backend exposes a focused REST surface shaped around product use cases rather than raw table access.

Main endpoint groups:

- `/api/companies` for employer search and company detail views
- `/api/states` for map and state drill-down analytics
- `/api/industries` for filter support
- `/api/enrich` for enrichment workflows
- `/api/health` for service and dataset status
- `/api/admin/refresh` for refresh state and manual refresh triggers

The API is designed for aggregated application use, so most responses are already grouped or summarized in ways the UI can render directly.

## Technical Perspective

From an engineering standpoint, the repository favors a pragmatic local architecture over unnecessary infrastructure.

### SQLite As The Core Store

SQLite is a strong fit because this dataset is structured, read-heavy, and batch-refreshed rather than continuously written. It gives the project a low-overhead persistence layer while still supporting fast aggregate queries.

### Express As The Service Layer

Express keeps the backend explicit and thin. Most of the project complexity lives in import logic, aggregation behavior, and refresh orchestration, not in framework abstractions.

### React And Vite For The Client

The frontend is interactive rather than static. React supports filter-heavy and drill-down-heavy UI well, while Vite keeps the development/build cycle fast and lightweight.

### AI Enrichment As A Separate Concern

USCIS data remains the authoritative source. AI-generated company metadata is layered on top as optional enrichment so the core analytics remain deterministic even without model output.

## Project Structure

```text
VisaTrack Pro/
├── backend/
│   ├── server.js
│   ├── db/
│   │   └── schema.js
│   ├── routes/
│   │   ├── admin.js
│   │   ├── companies.js
│   │   ├── enrich.js
│   │   └── states.js
│   ├── scripts/
│   │   ├── importCSV.js
│   │   ├── seedDemo.js
│   │   └── syncUSCIS.js
│   ├── services/
│   │   └── dataSync.js
│   └── data/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── vite.config.js
└── package.json
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router, Vite |
| Visualization | Recharts, custom map UI |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 |
| Parsing | csv-parse |
| Scheduling | node-cron |
| Enrichment | OpenAI |

## Product Strengths

Some of the strongest aspects of the project are:

- Direct use of official USCIS source data
- End-to-end ownership from ingestion through presentation
- Low-overhead local architecture with strong analytical usefulness
- Clear separation between authoritative data and enriched metadata
- Built-in sync and refresh behavior instead of one-off import scripts
- Usable both as a web product and as an application API

## Data Source

H-1B employer petition data is sourced from the USCIS H-1B Employer Data Hub.

AI enrichment, when enabled, adds supplemental company context on top of that source data and is treated as an enhancement rather than a replacement for official records.
