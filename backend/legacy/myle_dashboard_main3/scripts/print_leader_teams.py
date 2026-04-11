#!/usr/bin/env python3
"""
Print approved leaders and recursive downline (same tree as app: _get_network_usernames).

Read-only — no DB writes.

Usage (Render Shell or local):
  export DATABASE_PATH=/var/data/leads.db    # Render persistent SQLite
  python3 scripts/print_leader_teams.py

  # optional: machine-readable
  python3 scripts/print_leader_teams.py --tsv
"""
from __future__ import annotations

import argparse
import os
import sys

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

os.chdir(_ROOT)


def main() -> int:
    p = argparse.ArgumentParser(description='List leaders and downline teams (read-only).')
    p.add_argument('--tsv', action='store_true', help='Tab-separated: leader<TAB>member<TAB>role')
    args = p.parse_args()

    db_path = (os.environ.get('DATABASE_PATH') or '').strip()
    if not db_path:
        print('ERROR: Set DATABASE_PATH to your SQLite file.', file=sys.stderr)
        print('Example: export DATABASE_PATH=/var/data/leads.db', file=sys.stderr)
        return 1
    if not os.path.isfile(db_path):
        print(f'ERROR: File not found: {db_path}', file=sys.stderr)
        return 1

    from database import get_db
    from helpers import _get_network_usernames

    db = get_db()
    try:
        leaders = db.execute(
            """
            SELECT username,
                   COALESCE(NULLIF(TRIM(name), ''), '') AS disp_name,
                   COALESCE(fbo_id, '') AS fbo_id
            FROM users
            WHERE role = 'leader' AND status = 'approved'
            ORDER BY LOWER(username)
            """
        ).fetchall()

        if args.tsv:
            print('approver_leader\tmember_username\tmember_role\tmember_name\tmember_status')
            for L in leaders:
                lun = (L['username'] or '').strip()
                if not lun:
                    continue
                net = _get_network_usernames(db, lun)
                for un in sorted(net):
                    if un == lun:
                        continue
                    r = db.execute(
                        'SELECT username, role, name, status FROM users WHERE username = ? LIMIT 1',
                        (un,),
                    ).fetchone()
                    if not r:
                        continue
                    print(
                        f"{lun}\t{r['username']}\t{r['role']}\t"
                        f"{(r['name'] or '').strip()}\t{(r['status'] or '').strip()}"
                    )
            return 0

        print('# Leaders & downline (read-only; same recursive rule as app)\n')
        for L in leaders:
            lun = (L['username'] or '').strip()
            dname = (L['disp_name'] or '').strip()
            fbo = (L['fbo_id'] or '').strip()
            line = f'## {lun}'
            if dname:
                line += f' — {dname}'
            if fbo:
                line += f' [FBO {fbo}]'
            print(line)

            net = _get_network_usernames(db, lun)
            members = [u for u in net if u != lun]
            if not members:
                print('  (no downline in tree)\n')
                continue
            ph = ','.join('?' * len(members))
            rows = db.execute(
                f"""
                SELECT username, role,
                       COALESCE(NULLIF(TRIM(name), ''), '') AS disp_name,
                       status
                FROM users
                WHERE username IN ({ph})
                ORDER BY role DESC, LOWER(username)
                """,
                tuple(members),
            ).fetchall()
            for r in rows:
                un = (r['username'] or '').strip()
                role = (r['role'] or '').strip()
                nm = (r['disp_name'] or '').strip()
                st = (r['status'] or '').strip()
                extra = f' ({nm})' if nm else ''
                if st != 'approved':
                    extra += f' [{st}]'
                print(f'  • {un} — {role}{extra}')
            print(f'  — downline: {len(rows)} (tree with leader: {len(net)})\n')
        return 0
    finally:
        db.close()


if __name__ == '__main__':
    raise SystemExit(main())
