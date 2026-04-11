"""
Backfill daily_scores.calls_made from activity_log.

Problem that was fixed:
  - 'Called - Not Interested' was never counted in calls_made
  - Same lead updated multiple times in a day was double-counted

This script recomputes calls_made for every (username, date) using
activity_log as the source of truth, counting unique lead IDs that
received any calling-type call_status update on that day.

Usage:
    python scripts/backfill_calls_made.py [--db /path/to/leads.db] [--dry-run]

Default DB path: leads.db in the project root (or DATABASE_PATH env var).
"""
from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from collections import defaultdict

CALLING_STATUSES = frozenset({
    'Called - Interested', 'Called - No Answer',
    'Called - Follow Up',  'Called - Not Interested',
    'Called - Switch Off', 'Called - Busy',
    'Call Back',           'Wrong Number',
})

# Regex to extract lead ID from activity_log details
# Format: "Lead #123 call_status=Called - No Answer"
_LEAD_ID_RE   = re.compile(r'Lead #(\d+)')
_STATUS_RE    = re.compile(r'call_status=(.+)$')


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    default_db = os.environ.get(
        'DATABASE_PATH',
        os.path.join(os.path.dirname(__file__), '..', 'leads.db'),
    )
    p.add_argument('--db', default=default_db, help='Path to leads.db')
    p.add_argument('--dry-run', action='store_true',
                   help='Show what would change without writing to DB')
    return p.parse_args()


def main():
    args = parse_args()
    db_path = os.path.abspath(args.db)

    if not os.path.exists(db_path):
        print(f"ERROR: Database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ── Step 1: Read all call_status_update events from activity_log ──────────
    print("Reading activity_log …")
    rows = cur.execute("""
        SELECT username,
               DATE(created_at) AS log_date,
               details
        FROM   activity_log
        WHERE  event_type = 'call_status_update'
        ORDER  BY created_at
    """).fetchall()

    print(f"  Found {len(rows):,} call_status_update events")

    # {username -> {date -> set(lead_ids that had a CALLING status update)}}
    calls_per_day: dict[str, dict[str, set[int]]] = defaultdict(lambda: defaultdict(set))

    skipped = 0
    for row in rows:
        details = row['details'] or ''
        m_id     = _LEAD_ID_RE.search(details)
        m_status = _STATUS_RE.search(details)
        if not m_id or not m_status:
            skipped += 1
            continue
        lead_id = int(m_id.group(1))
        status  = m_status.group(1).strip()
        if status in CALLING_STATUSES:
            calls_per_day[row['username']][row['log_date']].add(lead_id)

    if skipped:
        print(f"  Skipped {skipped} rows with unparseable details")

    total_user_days = sum(len(dates) for dates in calls_per_day.values())
    print(f"  {len(calls_per_day)} users × dates = {total_user_days} (user, date) pairs to update\n")

    if total_user_days == 0:
        # ── Fallback: activity_log is empty; derive from leads table ──────────
        # This is less accurate (we only know CURRENT call_status, not the date
        # it was set), but better than leaving calls_made at 0.
        print("activity_log has no calling data — falling back to leads table.")
        print("WARNING: This only reconstructs CURRENT state, not per-day history.")
        print("         All calls will be attributed to today's date in daily_scores.\n")

        lead_rows = cur.execute("""
            SELECT assigned_to AS username,
                   DATE(updated_at) AS upd_date,
                   id
            FROM   leads
            WHERE  call_status IN (
                       'Called - Interested', 'Called - No Answer',
                       'Called - Follow Up',  'Called - Not Interested',
                       'Called - Switch Off', 'Called - Busy',
                       'Call Back',           'Wrong Number'
                   )
              AND  deleted_at = ''
              AND  in_pool   = 0
              AND  assigned_to IS NOT NULL
              AND  assigned_to != ''
        """).fetchall()

        print(f"  Found {len(lead_rows):,} leads with a calling status")
        for r in lead_rows:
            if r['username'] and r['upd_date']:
                calls_per_day[r['username']][r['upd_date']].add(r['id'])

        total_user_days = sum(len(dates) for dates in calls_per_day.values())
        print(f"  → {len(calls_per_day)} users × dates = {total_user_days} pairs\n")

    # ── Step 2: Read existing daily_scores to show diff ───────────────────────
    existing_scores: dict[tuple[str, str], int] = {}
    for r in cur.execute("SELECT username, score_date, calls_made FROM daily_scores").fetchall():
        existing_scores[(r['username'], r['score_date'])] = r['calls_made']

    # ── Step 3: Compute changes ────────────────────────────────────────────────
    changes: list[tuple[str, str, int, int]] = []  # (username, date, old, new)
    inserts: list[tuple[str, str, int]] = []        # (username, date, new)

    for username, dates in sorted(calls_per_day.items()):
        for date, lead_ids in sorted(dates.items()):
            new_count = len(lead_ids)
            key = (username, date)
            if key in existing_scores:
                old_count = existing_scores[key]
                if old_count != new_count:
                    changes.append((username, date, old_count, new_count))
            else:
                inserts.append((username, date, new_count))

    # ── Step 4: Report ─────────────────────────────────────────────────────────
    if not changes and not inserts:
        print("✅  Nothing to change — daily_scores.calls_made is already in sync.")
        conn.close()
        return

    if changes:
        print(f"{'USER':<20} {'DATE':<12} {'OLD':>6} {'NEW':>6}  CHANGE")
        print("-" * 55)
        for username, date, old, new in changes:
            diff = new - old
            sign = '+' if diff >= 0 else ''
            print(f"{username:<20} {date:<12} {old:>6} {new:>6}  {sign}{diff}")
        print()

    if inserts:
        print(f"NEW rows to insert ({len(inserts)}):")
        for username, date, count in inserts[:20]:
            print(f"  {username:<20} {date:<12}  calls_made={count}")
        if len(inserts) > 20:
            print(f"  … and {len(inserts) - 20} more")
        print()

    if args.dry_run:
        print("DRY RUN — no changes written.")
        conn.close()
        return

    # ── Step 5: Apply changes ──────────────────────────────────────────────────
    print("Applying …")
    for username, date, _old, new_count in changes:
        cur.execute(
            "UPDATE daily_scores SET calls_made=? WHERE username=? AND score_date=?",
            (new_count, username, date),
        )

    for username, date, new_count in inserts:
        cur.execute("""
            INSERT OR IGNORE INTO daily_scores
                (username, score_date, calls_made, videos_sent, batches_marked,
                 payments_collected, total_points, streak_days)
            VALUES (?, ?, ?, 0, 0, 0, 0, 1)
        """, (username, date, new_count))

    conn.commit()
    conn.close()
    print(f"✅  Done — {len(changes)} rows updated, {len(inserts)} rows inserted.")


if __name__ == '__main__':
    main()
