"""Single source of truth: product role ids (admin / leader / team) and dev seed emails."""

from __future__ import annotations

from enum import Enum
from typing import Final

__all__ = ["DEV_EMAIL_BY_ROLE", "ROLES", "ROLES_SET", "Role"]


class Role(str, Enum):
    """Stored in ``users.role`` and JWT ``role`` claim — values are stable API strings."""

    ADMIN = "admin"
    LEADER = "leader"
    TEAM = "team"


ROLES: Final[tuple[str, ...]] = tuple(r.value for r in Role)
ROLES_SET: Final[frozenset[str]] = frozenset(ROLES)

DEV_EMAIL_BY_ROLE: Final[dict[str, str]] = {
    Role.ADMIN: "dev-admin@myle.local",
    Role.LEADER: "dev-leader@myle.local",
    Role.TEAM: "dev-team@myle.local",
}

# Unique login identifier for seeded dev accounts (normalized lowercase in DB).
DEV_FBO_BY_ROLE: Final[dict[str, str]] = {
    Role.ADMIN: "fbo-admin-001",
    Role.LEADER: "fbo-leader-001",
    Role.TEAM: "fbo-team-001",
}
