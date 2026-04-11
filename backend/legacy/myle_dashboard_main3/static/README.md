# Myle-Dashboard-main-3 — `static/` (reference snapshot)

Verbatim tree from the legacy Flask monolith: **PWA manifest**, **service worker**, **Bootstrap 5.3.3**, **bootstrap-icons**, and app-specific **CSS/JS** (`working.css`, `working.js`, `followup.js`, **Chart.js** UMD).

vl2 serves the SPA from **`frontend/`** (Vite build → `frontend_dist/` in Docker). These assets are **not** used by the FastAPI app — keep this folder for **diffing** old UI vs dashboard shell only.
