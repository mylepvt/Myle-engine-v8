# Myle Community v2

## Which GitHub repo is “the” repo?

| Repo | Role |
|------|------|
| **`Mylecommunity/Myle-community`** | **Canonical** — open PRs here, branch from here, issues here. |
| **`mylepvt/New-Myle-Community`** | **Optional mirror** — auto-updated copy for tools that only connect to that org (e.g. some Render setups). Same code as `main` on the canonical repo; do **not** treat it as a second place to merge features. |

To use **only one repo:** connect Render (and everyone’s remotes) to **`Mylecommunity/Myle-community`**, then archive or ignore the mirror.

Monorepo layout: `backend/` (FastAPI), `frontend/` (Vite/React), `tests/`, `docs/`.
