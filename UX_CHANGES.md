# UX simplification pass

Scope: frontend only. No routes, API contracts, auth, database or Groq code were changed.

## Shared building blocks (`src/components/ui/`)
- `Disclosure` – collapsible section with a one-line summary, keyboard accessible.
- `Severity` – one colour rule: red = critical hazards / failed barriers, amber = warnings, green = verified or completed, grey/cyan = neutral.
- `PageHeader` – title plus the single question the page answers.

## Dashboard
- Leads with the most serious current risk (sorted by priority), why it matters, supporting evidence (source, hazard vector, status) and the next action (Dispatch CAPA, same endpoint as before).
- Four tiles replace the four equal KPI cards: reviews pending, interventions active, SIF precursors (with trend), barrier integrity. Each links to its page. Counts come from the existing review and intervention endpoints.
- Trend chart and facility ranking stay open; life-saving rules and secondary indicators are collapsed.
- Facility list is ranked by severity, no longer silently capped at five (Show all), and renders as stacked rows on phones.
- Removed unsupported text: "Model Confidence: N/A", "Alert L2", backend/database labels.

## Report Analyzer
- On small screens the result now comes first (finding, findings, evidence, decision, diagram, input).
- SIF gauge/label colour follows the AI's own `sifPotential` level; no more always-red.
- Risk score and AI extraction confidence are labelled separately.
- The bowtie diagram is always displayed (no show/hide toggle).
- Removed a non-functional "Drill Audit Log" button, a dead "View Mandate" link and a made-up "SIG-094" ID; decision buttons no longer truncate.

## Other pages
Purpose-first headers on Safety DNA, Safety Memory, Knowledge Graph, Risk Intelligence, What Changed?, Interventions and Human Review. What Changed? now leads with the key-shift statement. Interventions shows pending / active / completed / critical-and-open. Safety DNA lost static claims ("DBSCAN v4.2", "75% genetic match") that the backend does not implement. Human Review's pending count is amber, and "Consensus" is relabelled "Certified" because it is the share of certified reviews.

## App shell
Removed decorative nav badges, the duplicate health pill (the header indicator now appears only when the service is offline), and the hard-coded "Development User" label (now shows the signed-in user).

---

# Second pass: all nine workspaces + same-origin production architecture

## UI (each page now leads with its answer; supporting evidence is collapsed but present)
| Workspace | Before | After |
| --- | --- | --- |
| Dashboard | (first pass) | unchanged |
| Report Analyzer | input form, narrative, then a 2x2 grid of equal cards | Result first on phones: summary, **failed/bypassed barriers**, **strongest precursors** (full evidence text), then narrative and decision. Full findings and **technical details** (model, confidence, latency, IDs) are collapsible. No recommended action is invented: the data has none, so the next step is the human decision. |
| Safety DNA | four metric cards and a large network above the patterns | Strongest 4 patterns first (show all on request); pathway, correlations, precedents and statistics collapse; selecting a pattern opens its evidence. Removed unverifiable engine claims. |
| Safety Memory | search, mode toggles, 6 filters and suggestions all open | Search box + suggestions; mode and filters collapsed with a live summary; top 3 matches in full, the rest as compact rows ("Open case"). Similarity is no longer coloured as risk. |
| Knowledge Graph | force layout by default, inspector actions at the bottom | Opens in cause-to-effect layout; selected-node actions directly under the node name; connected nodes keyboard accessible. Pan, zoom, selection and the barrier what-if are unchanged. |
| Risk Intelligence | filters, matrix, benchmarks, causes, table all open | "Highest risk concentration" first, filters collapsed with summary, facilities table next; causes and the matrix/benchmarks collapse. Dead "Save View" button and a hard-coded calibration claim removed. |
| What Changed? | four KPI cards and a chart before the list | Key shift, then the ranked list of signals that increased (cards on phones), with measurements and the curve collapsed. |
| Interventions | flat grid of equal cards | Grouped: Needs approval, In progress, Completed (collapsed). Clearer next-step button; "Under Review" items now read "Start action". |
| Human Review | queue first, decision form buried under evidence | The AI finding and the incident narrative first; evidence collapsible; the **four governance actions (certify, reclassify, escalate, reject) stay visible**, notes and reviewer identity unchanged; queue collapses behind "Choose another item" on phones. First pending item is auto-selected. |

## Production architecture
- `server/proxy.js`, `server/app.js`, `server/index.js`: Express serves `dist/` with SPA fallback and proxies `/api/*` to FastAPI (cookies, Set-Cookie, query, bodies, JSON/non-JSON, 502/504 JSON errors, origin check, no secret logging).
- `render.yaml`: frontend is a Node web service (`npm ci --include=dev && npm run build`, `npm start`, `/healthz`), `BACKEND_URL` documented; backend and the single database preserved; static rewrite rules and `AUTH_COOKIE_SAMESITE=none` removed.
- Backend: cookie default `SameSite=Lax` (first-party); `OriginGuardMiddleware` rejects cross-origin state-changing requests.
- Tests: `server/proxy.test.mjs`, `server/app.test.mjs`, `backend/tests/test_same_origin_auth.py`, updated `test_production_audit.py`.
- Scripts: `npm start`, `npm run test:server`, `npm run check:config`, `npm run check:lock`.

## Revision: red restored, bowtie always visible
- Elements that were red in the original design are red again (SIF level and gauge in Report Analyzer, escalation and queue count in Human Review, HIGH patterns / rising trends / status in Safety DNA, similarity >= 90 in Safety Memory, velocity and integrity cards in What Changed, rising precursor counts and high-energy releases on the Dashboard, the Critical card and critical progress bars in Interventions).
- Report Analyzer: the bowtie diagram no longer has a Show/Hide button; it is always displayed.
