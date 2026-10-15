# PRECURSOR-X FastAPI Backend

Enterprise process safety precursor diagnostics and SIF barrier intelligence API.

## Architecture

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py             # GET /api/v1/health
│   │       ├── dashboard.py          # GET /api/v1/dashboard/*
│   │       ├── report_analyzer.py    # POST /api/v1/reports/analyze
│   │       ├── risk_intelligence.py  # GET /api/v1/risk-intelligence/*
│   │       ├── safety_dna.py         # GET /api/v1/safety-dna/*
│   │       ├── safety_memory.py      # GET /api/v1/safety-memory/search
│   │       ├── knowledge_graph.py    # GET & POST /api/v1/knowledge-graph/*
│   │       ├── what_changed.py       # GET /api/v1/what-changed
│   │       ├── interventions.py      # GET, POST, PATCH /api/v1/interventions/*
│   │       └── human_review.py       # GET & POST /api/v1/reviews/*
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py                 # Pydantic v2 settings & CORS
│   ├── schemas/                      # Pydantic schemas mirroring frontend types
│   │   ├── common.py
│   │   ├── report.py
│   │   ├── risk.py
│   │   ├── memory.py
│   │   ├── graph.py
│   │   ├── intervention.py
│   │   └── review.py
│   ├── services/                     # Domain services & database-backed query logic
│   │   ├── report_service.py
│   │   ├── risk_service.py
│   │   ├── memory_service.py
│   │   ├── graph_service.py
│   │   ├── intervention_service.py
│   │   └── review_service.py
│   └── data/
│       ├── __init__.py
│       └── seed_data.py              # Canonical deterministic seed data
├── tests/
│   ├── __init__.py
│   ├── test_health.py
│   └── test_api.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## Quickstart

### 1. Setup Virtual Environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

### 3. Run Development Server

```bash
uvicorn app.main:app --reload --port 8000
```

- API Base URL: `http://localhost:8000`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`
- ReDoc Docs: `http://localhost:8000/redoc`
- Health check: `http://localhost:8000/api/v1/health`

### 4. Run Test Suite

```bash
pytest -v
```

## API Endpoints Overview

| Category | Method | Endpoint | Description |
|---|---|---|---|
| **Health** | `GET` | `/api/v1/health` | Health & version probe |
| **Dashboard** | `GET` | `/api/v1/dashboard/summary` | Executive precursor & barrier metrics |
| **Dashboard** | `GET` | `/api/v1/dashboard/telemetry` | Weekly precursor velocity trajectory |
| **Dashboard** | `GET` | `/api/v1/dashboard/facilities` | Facility composite risk rankings |
| **Dashboard** | `GET` | `/api/v1/dashboard/events` | Real-time precursor feed |
| **Report Analyzer** | `POST` | `/api/v1/reports/analyze` | Extracts SIF precursors, barriers, and LSRs |
| **Risk Intelligence**| `GET` | `/api/v1/risk-intelligence/telemetry` | Aggregated facility risk telemetry |
| **Risk Intelligence**| `GET` | `/api/v1/risk-intelligence/matrix` | 5x5 dynamic risk consequence/likelihood matrix |
| **Risk Intelligence**| `GET` | `/api/v1/risk-intelligence/facilities` | Multi-filter facility registry query |
| **Safety DNA** | `GET` | `/api/v1/safety-dna/patterns` | Precursor combination clusters |
| **Safety DNA** | `GET` | `/api/v1/safety-dna/causal-chain` | Hazard-trigger-breach-consequence chain |
| **Safety DNA** | `GET` | `/api/v1/safety-dna/metrics` | Systemic blindspots and barrier decay radar |
| **Safety Memory** | `GET` | `/api/v1/safety-memory/search` | Semantic, keyword, and fingerprint precedent search |
| **Knowledge Graph** | `GET` | `/api/v1/knowledge-graph` | Systemic causal ontology graph nodes & edges |
| **Knowledge Graph** | `POST` | `/api/v1/knowledge-graph/barrier-simulation` | Barrier degradation/restoration simulation |
| **What Changed** | `GET` | `/api/v1/what-changed` | Period divergence velocity comparison |
| **Interventions** | `GET` | `/api/v1/interventions` | Query CAPA interventions |
| **Interventions** | `POST` | `/api/v1/interventions` | Create new CAPA intervention |
| **Interventions** | `PATCH` | `/api/v1/interventions/{id}` | Update intervention status / progress |
| **Human Review** | `GET` | `/api/v1/reviews` | Triage queue for AI-flagged SIF reports |
| **Human Review** | `POST` | `/api/v1/reviews/{id}/decision` | Specialist commit, reject, or escalate action |

## Seed data (synthetic / demo) and startup behaviour

Everything in `app/data/seed_data.py` and inserted by `app/db/seed.py` is **synthetic demonstration data**
(facilities, telemetry, events, reports, precedents, knowledge graph, interventions, the sample review, the
what-changed snapshot). It is only ever inserted into PostgreSQL; the React frontend never imports it and every
operational API response is read from PostgreSQL.

`seed_database(force=False)` is idempotent and per-table: a table is seeded only when it has **zero rows**.

| Render backend starts with… | What happens |
| --- | --- |
| **A) Empty database** | `alembic upgrade head` creates the schema (001 → 005). `python -m app.db.seed` inserts the synthetic demo rows into every empty table. No user is created in production unless `INITIAL_OPERATOR_EMAIL` + `INITIAL_OPERATOR_PASSWORD` are set; people register through `/api/v1/auth/register`. |
| **B) Already-populated database** | `alembic upgrade head` applies only missing migrations (no-op when at head). Seeding sees non-empty tables and changes nothing: no duplicates, no overwritten real records, users untouched. `--force` is dev-only and is never used by `render.yaml`. |

Notes: if an operator deletes *every* row of a seeded table, the next start re-seeds that table. Schema for PostgreSQL is
owned exclusively by Alembic (`create_all` is only used for SQLite test databases).

## Production configuration checklist

- `APP_ENV=production`, `AUTH_SECRET_KEY` >= 32 random chars (Render `generateValue`), `GROQ_API_KEY` (server only).
- `CORS_ORIGINS` must contain the deployed frontend origin (`https://…onrender.com`); the app refuses to start in
  production without an `https://` origin and never accepts `*`.
- Auth cookie: `HttpOnly; Secure; SameSite=Lax` in production. The frontend is a Node/Express service that serves the
  SPA and proxies `/api/*` to this backend, so the browser only talks to one origin and the cookie is first-party.
  `AUTH_COOKIE_SAMESITE=none` is only for deployments that deliberately split the SPA and API across different sites.
- State-changing requests (POST/PUT/PATCH/DELETE) that carry an `Origin` header are rejected with 403 unless the origin
  is in `CORS_ORIGINS`, so `CORS_ORIGINS` must be the frontend's public URL.
- `/docs`, `/redoc` and the OpenAPI schema are disabled in production.
