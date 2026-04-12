"""
Shim for legacy commands that use ``uvicorn app.main:app`` (see ``deploy.sh`` / docs).

Delegates to the real ASGI app in ``backend/main.py`` — same CORS allowlist, middleware,
lifespan, health routes, and optional SPA — so this is **not** a second permissive app.
"""

from __future__ import annotations

import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parents[1]
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from main import app  # noqa: E402

__all__ = ["app"]
