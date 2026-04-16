# CRM web — deployment architecture

Do **not** merge this Next.js app with the legacy Vite dashboard in `frontend/`.

| Host | Application |
|------|-------------|
| `app.domain.com` (example) | Legacy Myle dashboard — **unchanged** |
| `crm.domain.com` (example) | This Lead Execution CRM (`apps/crm-web`) |

- Separate deploy targets, env vars, and cookies until you intentionally add **shared JWT auth** (future; not implemented here).
- No shared UI package in this phase.
