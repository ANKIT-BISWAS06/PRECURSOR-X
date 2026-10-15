# PRECURSOR-X — Safety Intelligence Platform

> **Seeded demo data.** The frontend talks to the FastAPI backend (`/api/v1`), which stores data in PostgreSQL and uses Groq for report analysis. See `backend/README.md` for setup and `UX_CHANGES.md` for the latest interface changes.

---

## Overview

PRECURSOR-X transforms unstructured incident reports, near-misses, and barrier telemetry into actionable precursor intelligence to prevent Serious Injuries and Fatalities (SIF).

The platform implements 9 specialized operational workspaces derived from Google Stitch UI/UX specifications:

1. **/dashboard** — Executive Risk Command with live pulse telemetry, facility filtering (14 global assets), trajectory curves, and real JSON dossier export.
2. **/report-analyzer** — Interactive NLP Diagnostics extracting precursors, hazards, barrier breaches, mitigating controls (SWA), and an interactive Bowtie Model SVG.
3. **/risk-intelligence** — Multi-dimensional risk vector console featuring a dynamic 5×5 Consequence Severity vs Probability Frequency Matrix, asset benchmark ratios, and facility leading indicator tables.
4. **/safety-dna** — Precursor Pattern Discovery with genomic clustering (DBSCAN), causal-chain topological pathways, and phenotype failure mode inspection.
5. **/safety-memory** — Institutional Corpus Search across 142,890 historical records with three distinct search modes:
   - **Semantic**: Multi-field weighted matching (precursors, narrative, title, LSR, facility) with dynamic similarity scoring.
   - **Keyword**: Exact and partial term frequency filtering.
   - **Fingerprint**: Precursor and failure-vector Jaccard similarity.
6. **/knowledge-graph** — Relational Safety Ontology featuring Force-Directed, Causal Chain, and Barrier Tree layouts, node search, and a live Barrier Restoration Simulation propagating risk adjustments across connected nodes.
7. **/what-changed** — Precursor Velocity Shift Monitor providing 2-interval differential comparisons (e.g. 7D vs 30D baseline, 24h emergency windows), divergence SVG charts, and direct CAPA dispatch.
8. **/interventions** — Preventive Action Dispatch & CAPA Tracker lifecycle status transitions (Proposed → Approved → In Progress → Completed), quick verification, and new CAPA authoring.
9. **/human-review** — Specialist Sign-Off & AI Governance queue supporting certified approval, calibration adjustments, and board escalation workflows.

---

## Architecture & Data Flow

```
React view layer (Tailwind CSS)
   ↓
Service layer (`src/services/api.ts`, `httpClient.ts`)
   ↓
FastAPI backend (`backend/app`) → PostgreSQL, Groq
```

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router v7

---

## Production architecture

```
Browser -> same-origin Node/Express web service (server/) -> FastAPI -> PostgreSQL
```

The browser only calls its own origin's `/api/v1/...`. `server/index.js` serves the compiled Vite app from `dist/`
(with React Router fallback) and forwards `/api/*` to FastAPI, preserving methods, query strings, bodies, the `Cookie`
request header and every `Set-Cookie` response header. It returns JSON 502/504 when the backend is down or slow (never
the SPA HTML for an API call), blocks cross-origin state-changing requests, and never logs cookies, bodies or queries.

```bash
npm ci && npm run build        # build the SPA
BACKEND_URL=http://127.0.0.1:8000 npm start   # serve it and proxy /api/*
npm run test:server            # proxy + Express tests (Express tests need npm install first)
npm run check:config           # render.yaml / package.json / server consistency
npm run check:lock             # package.json and package-lock.json agree
```

## Render configuration and migration

`render.yaml` now describes the frontend as a **Node web service** (`runtime: node`, `npm start`). Editing the Blueprint
does **not** convert an existing service: if `precursor-x-frontend` currently exists as a **Static Site**, do this once:

1. On a machine with network access run `npm install` and commit the updated `package-lock.json`
   (it must contain `express`; `npm run check:lock` verifies this). The Render build uses `npm ci`, which fails otherwise.
2. In the Render dashboard, delete the old `precursor-x-frontend` **Static Site** (or keep it and give the new service a
   different `name` in `render.yaml`). A service's type cannot be changed in place.
3. Sync the Blueprint (or create the service from it). Keep the existing backend service and the single `precursor-x-db`
   database; do not create another database.
4. Frontend service environment: set `BACKEND_URL` to the backend's public URL, origin only
   (e.g. `https://precursor-x-backend.onrender.com`). Make sure `VITE_API_BASE_URL` is **not** set (delete it if an
   earlier deployment set it; Blueprint syncs do not remove variables that were dropped from the file).
5. Backend service environment: set `CORS_ORIGINS` to the frontend's actual public URL (e.g.
   `https://precursor-x-frontend.onrender.com`) and delete any old `AUTH_COOKIE_SAMESITE=none` override so the cookie
   uses the new `SameSite=Lax` default. Keep `GROQ_API_KEY` and `GROQ_MODEL=openai/gpt-oss-120b`.
6. After deploy, `GET https://<frontend>/api/v1/health` must return the backend's JSON health response, and
   `GET https://<frontend>/healthz` the frontend's own `{"status":"ok"}`. Sign in, reload the page (you must stay signed
   in), then sign out.

## Development & Verification

```bash
# Start development server
npm run dev

# Validate TypeScript type safety and linting
npm run lint

# Build production bundle
npm run build
```
