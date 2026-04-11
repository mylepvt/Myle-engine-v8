"""
ASGI entrypoint — same app as ``main:app`` (uvicorn / gunicorn UvicornWorker).

Usage::

  uvicorn asgi:app --host 0.0.0.0 --port 8000

  gunicorn -c gunicorn.conf.py asgi:app
"""

from __future__ import annotations

from main import app

__all__ = ["app"]
