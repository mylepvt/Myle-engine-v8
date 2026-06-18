"""Post-action verification — the app's "did that actually work?" check.

The app trusts that once it runs an action, the action happened. The
soft-delete bug broke exactly that trust: the delete failed at the database
level, the request errored, but no one noticed the member was never removed.

``ensure`` lets a critical action re-read its own result and assert the world
actually changed the way it intended. A failed check is loud (logged + raised)
instead of silent, so a half-done action surfaces immediately rather than
leaking through every downstream rule.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class PostconditionError(RuntimeError):
    """Raised when an action's expected after-state did not actually hold."""

    def __init__(self, message: str, *, code: str = "postcondition_failed") -> None:
        super().__init__(message)
        self.code = code


def ensure(condition: bool, message: str, *, code: str = "postcondition_failed") -> None:
    """Assert a post-action invariant. Logs and raises ``PostconditionError`` if false."""
    if not condition:
        logger.error("postcondition failed [%s]: %s", code, message)
        raise PostconditionError(message, code=code)
