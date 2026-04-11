"""
Gunicorn + Uvicorn workers — optional ASGI production layout (monolith ``gunicorn.conf.py`` port).

Default Docker/Render image uses ``uvicorn`` directly (see ``Dockerfile``). Use this when you want
gunicorn process management with ``uvicorn.workers.UvicornWorker`` (e.g. ``WEB_CONCURRENCY`` > 1).

Example::

  cd backend && gunicorn -c gunicorn.conf.py asgi:app

Requires ``gunicorn`` (see ``requirements.txt``). No Flask ``post_fork`` scheduler — vl2 has no
``start_scheduler`` hook from the monolith.
"""
from __future__ import annotations

import os

bind = "0.0.0.0:" + os.environ.get("PORT", "8000")

_render = os.environ.get("RENDER", "").lower() in ("1", "true", "yes")
_wc = os.environ.get("WEB_CONCURRENCY", "").strip()
if _wc:
    workers = max(1, int(_wc))
else:
    workers = 1 if _render else 2

worker_class = "uvicorn.workers.UvicornWorker"
timeout = 120
preload_app = not (_render and workers == 1)
accesslog = "-"
errorlog = "-"
loglevel = "info"
