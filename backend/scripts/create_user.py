#!/usr/bin/env python3
"""Create or update a user row (bcrypt password). For production bootstrap when dev-login is off.

Run from ``backend/`` (or Docker ``WORKDIR /app``) with ``DATABASE_URL`` set — same as the API.

Examples::

    cd backend
    python scripts/create_user.py --email admin@company.com --role admin

    # avoid shell history (Render shell):
    CREATE_USER_PASSWORD='your-secret' python scripts/create_user.py --email admin@company.com --role admin

    # reset password for existing user:
    python scripts/create_user.py --email admin@company.com --role admin --update
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")
load_dotenv(BACKEND.parent / ".env")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.roles import ROLES
from app.core.fbo_id import normalize_fbo_id
from app.core.passwords import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User


async def run(
    *,
    email: str,
    fbo_id: str | None,
    password: str,
    role: str,
    update: bool,
) -> None:
    async with AsyncSessionLocal() as session:
        await _upsert(
            session,
            email=email,
            fbo_id=fbo_id,
            password=password,
            role=role,
            update=update,
        )


async def _upsert(
    session: AsyncSession,
    *,
    email: str,
    fbo_id: str | None,
    password: str,
    role: str,
    update: bool,
) -> None:
    q = await session.execute(select(User).where(User.email == email))
    row = q.scalar_one_or_none()
    h = hash_password(password)
    if row is None:
        if not fbo_id or not fbo_id.strip():
            print(
                "--fbo-id is required when creating a new user (globally unique login id).",
                file=sys.stderr,
            )
            raise SystemExit(1)
        fn = normalize_fbo_id(fbo_id)
        dup = await session.execute(select(User.id).where(User.fbo_id == fn))
        if dup.scalar_one_or_none() is not None:
            print(f"FBO ID {fn!r} is already registered.", file=sys.stderr)
            raise SystemExit(1)
        u = User(fbo_id=fn, email=email, role=role, hashed_password=h)
        session.add(u)
        await session.commit()
        await session.refresh(u)
        print(
            f"OK: created user id={u.id} fbo_id={fn!r} email={email!r} role={role}",
            file=sys.stderr,
        )
        return
    if not update:
        print(
            f"User {email!r} already exists. Pass --update to replace password and role.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    row.role = role
    row.hashed_password = h
    await session.commit()
    print(f"OK: updated user id={row.id} email={email!r} role={role}", file=sys.stderr)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Create or update a Myle vl2 user (bcrypt).")
    p.add_argument("--email", required=True, help="Unique email (contact / recovery).")
    p.add_argument(
        "--fbo-id",
        default="",
        help="Globally unique FBO ID (required for new users; login identifier).",
    )
    p.add_argument(
        "--role",
        required=True,
        choices=ROLES,
        help="Dashboard role",
    )
    p.add_argument(
        "--password",
        default="",
        help="Plain password (prefer CREATE_USER_PASSWORD env for non-interactive).",
    )
    p.add_argument(
        "--update",
        action="store_true",
        help="If the user exists, update password and role instead of failing.",
    )
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    pw = args.password or os.environ.get("CREATE_USER_PASSWORD", "")
    if not pw:
        pw = getpass.getpass("Password: ")
        pw2 = getpass.getpass("Password (again): ")
        if pw != pw2:
            print("Passwords do not match.", file=sys.stderr)
            raise SystemExit(1)
    if not pw.strip():
        print("Password is required (or set CREATE_USER_PASSWORD).", file=sys.stderr)
        raise SystemExit(1)

    fbo_raw = (args.fbo_id or "").strip()
    asyncio.run(
        run(
            email=args.email.strip().lower(),
            fbo_id=fbo_raw or None,
            password=pw,
            role=args.role,
            update=args.update,
        )
    )


if __name__ == "__main__":
    main()
