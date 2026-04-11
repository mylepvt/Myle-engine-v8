# Cursor context — Myle Dashboard

Short instructions for anyone opening this repo in Cursor (local or cloud).

## What this app is

Flask + Jinja2 + SQLite (`DATABASE_PATH`, default `leads.db` in project root). Roles: **admin**, **leader**, **team**.

## UI redesign surface (do not scatter CSS)

| Concern | File |
|--------|------|
| **Global shell** — sidebar, nav, light/dark tokens, glass aesthetic | `templates/base.html` + `static/css/style.css` (`:root`, `[data-theme="dark"]`, layout) |
| **Admin Command Center** — navy shell (`#070B14` / `#0B1220`), hero band, gradient cards (matches standalone mockup) | `templates/admin.html` (**markup only**) + `static/css/style.css` (section **Admin Command Center — `.admin-premium-layout`**) |
| **Charts on admin** | `static/js/chart.umd.min.js` loaded only in `admin.html` `{% block extra_head %}` |

**Rule:** Admin dashboard styling must **not** live in a `<style>` block inside `admin.html`. Edit the `.admin-premium-layout { … }` block in `static/css/style.css` so one file owns the redesign.

After CSS changes, bump the cache-buster on the stylesheet link in `base.html` (the `?v=…` query on `css/style.css`) so browsers reload.

## Product copy

User-facing strings should be **professional English** (admin, leader, team). Avoid Hinglish in templates and flash messages.

## Local / cloud run (avoid “missing settings”)

SQLite is a **file**. Cloud workspaces use their **own** disk unless you copy `leads.db` or set:

```bash
export DATABASE_PATH=/absolute/path/to/leads.db
```

Optional dev-only:

```bash
export DEV_BYPASS_AUTH=1          # skip login; admin session
export BOOTSTRAP_ADMIN_PASSWORD=… # first seed when users table empty
export PORT=5003                  # or whatever the preview forwards
```

## CSRF

All **POST** requests require `csrf_token` in the form (or header `X-CSRF-Token`). Inline forms on `/admin` (e.g. approve/reject in the action queue) must include `<input type="hidden" name="csrf_token" value="{{ csrf_token }}">` or the app returns **403**.

## Tests

```bash
python3 -m pytest -q
```

## Git remote

Upstream: `mylepvt/Myle-Dashboard` (branch `main` unless you are on a feature branch).
