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

## Render configuration for this separate deployment

This Blueprint creates a separate PostgreSQL database (`precursorx-db`), FastAPI backend (`precursorx-backend`),
and Node/Express frontend (`precursorx-frontend`). It does not reuse or modify the existing PRECURSOR-X services.

Before deploying, create a new GitHub repository named `precursorx` and upload the project contents (not the ZIP file).
Then connect that repository in Render using **New + → Blueprint** and review the resources before applying.

Set these environment variables in the new services after Render assigns their actual public URLs:

- Frontend `BACKEND_URL`: the new backend's public origin only, e.g. `https://precursorx-backend.onrender.com`.
- Backend `CORS_ORIGINS`: the new frontend's actual public origin, e.g. `https://precursorx-frontend.onrender.com` (no trailing slash).
- Backend `GROQ_API_KEY`: set privately in the Render dashboard; never commit it.
- `DATABASE_URL` is supplied by the new `precursorx-db` database reference.
- Keep `VITE_API_BASE_URL` unset; the browser uses same-origin `/api/v1` through Express.

Render service names and generated public URLs can differ if a name is unavailable, so use the actual URLs shown in the dashboard.
Do not delete or rename the existing deployment. The Node frontend needs a successful `npm ci --include=dev` and `npm run build`;
run the checks below locally before deploying.

## Development & Verification

```bash
# Start development server
npm run dev

# Validate TypeScript type safety and linting
npm run lint

# Build production bundle
npm run build
```
