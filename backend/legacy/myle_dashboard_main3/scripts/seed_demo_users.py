#!/usr/bin/env python3
"""
Seed demo accounts for controlled simulation (no real team needed).

Creates (idempotent upsert by username):
  leader_1  — role leader, approved
  team_1    — role team, approved, upline leader_1
  team_2    — role team, approved, upline leader_1

Default passwords (change after first login in production):
  leader_1  DemoSim_Leader_1!
  team_1    DemoSim_Team_1!
  team_2    DemoSim_Team_2!

Usage:
  export DATABASE_PATH=/path/to/leads.db
  python3 scripts/seed_demo_users.py
  python3 scripts/seed_demo_users.py --sample-pool   # optional: pool leads + wallet credit

Also run automated checks:
  pytest tests/test_controlled_simulation.py -v

Manual playbook (incognito / different browsers):
  1) team_1: claim 5 leads → admin Live Pipeline “Aaj pool se claim”
  2) team_1: no work 48h+ → claim block; team_2: recent work → claim OK
  3) team_1: lead with overdue follow_up_date → open /dashboard → discipline updates lead
  4) leader_1: /dashboard → team snapshot / alerts
  5) DB hack: INSERT old activity_log or UPDATE users last_activity_at pattern via activity_log
  6) Same user: two tabs → rapid claim / refresh (stability)
"""
from __future__ import annotations

import argparse
import os
import sys

# Repo root on path
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from werkzeug.security import generate_password_hash

from database import get_db, migrate_db

ACCOUNTS = (
    ('leader_1', 'leader', 'DemoSim_Leader_1!', '', ''),
    ('team_1', 'team', 'DemoSim_Team_1!', 'leader_1', 'leader_1'),
    ('team_2', 'team', 'DemoSim_Team_2!', 'leader_1', 'leader_1'),
)


def upsert_users() -> None:
    db = get_db()
    for username, role, password, upline_u, upline_n in ACCOUNTS:
        row = db.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()
        ph = generate_password_hash(password, method='pbkdf2:sha256')
        if row:
            db.execute(
                """UPDATE users SET password=?, role=?, status='approved',
                   upline_username=?, upline_name=? WHERE username=?""",
                (ph, role, upline_u, upline_n, username),
            )
        else:
            db.execute(
                """INSERT INTO users (username, password, role, status, upline_username, upline_name)
                   VALUES (?,?,?,'approved',?,?)""",
                (username, ph, role, upline_u, upline_n),
            )
    db.commit()
    db.close()


def optional_sample_pool() -> None:
    """Ten cheap pool leads + ₹5000 approved wallet per demo team (not leader)."""
    db = get_db()
    for un in ('team_1', 'team_2'):
        db.execute(
            """INSERT INTO wallet_recharges (username, amount, utr_number, status,
               requested_at, processed_at)
               VALUES (?, 5000, 'DEMO-SEED-POOL', 'approved',
               datetime('now', '+5 hours', '+30 minutes'), datetime('now', '+5 hours', '+30 minutes'))""",
            (un,),
        )
        for i in range(10):
            phone = f'DEMO-POOL-{un}-{i}'
            db.execute(
                """INSERT INTO leads (name, phone, assigned_to, source, status, in_pool, pool_price,
                   city, deleted_at)
                   VALUES (?, ?, '', 'demo_seed', 'New Lead', 1, 50.0, '', '')""",
                (f'Demo pool {un} {i}', phone),
            )
    db.commit()
    db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description='Seed demo users for simulation testing.')
    ap.add_argument('--sample-pool', action='store_true', help='Add pool leads + wallet credits for team_1/team_2')
    ap.add_argument('--yes', action='store_true', help='Acknowledge writing to DATABASE_PATH')
    args = ap.parse_args()

    if not os.environ.get('DATABASE_PATH'):
        print('ERROR: Set DATABASE_PATH to your SQLite file.', file=sys.stderr)
        return 1
    if not args.yes:
        print('Refusing to write: pass --yes to confirm (DATABASE_PATH=%r).' % os.environ['DATABASE_PATH'])
        return 1

    migrate_db()
    upsert_users()
    print('OK: leader_1, team_1, team_2 upserted (approved). Passwords:')
    for u, _, pw, _, _ in ACCOUNTS:
        print(f'  {u:10}  {pw}')

    if args.sample_pool:
        optional_sample_pool()
        print('OK: sample pool leads + wallet credits for team_1, team_2')

    print('\nNext: pytest tests/test_controlled_simulation.py -v')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
