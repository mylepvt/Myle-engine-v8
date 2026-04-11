"""
Execution enforcement — role-sharp metrics (funnel, downline control, admin leaks).

Team: personal enrollment funnel + follow-up attack list (links to My Leads / edit).
Leader: downline aggregates + bottleneck tags (worst-first sort).
Admin: at-risk leads (48h+ stale), weak members, leak map.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any

from helpers import FOLLOWUP_TAGS, _now_ist
from services.hierarchy_lead_sync import nearest_approved_leader_username

PRE_VIDEO_STATUSES = (
    'New Lead', 'New', 'Contacted', 'Invited', 'Video Sent',
)

_FUNNEL_EXCLUDE = ('Lost', 'Retarget', 'Inactive', 'Converted', 'Fully Converted')


def _team_active_where() -> str:
    return (
        "assigned_user_id=? AND in_pool=0 AND deleted_at='' "
        f"AND status NOT IN ({','.join('?' * len(_FUNNEL_EXCLUDE))})"
    )


def team_personal_funnel(db, user_id: int) -> dict[str, Any]:
    """Counts + step conversion % for team enrollment funnel."""
    w = _team_active_where()
    params_base = (user_id, *_FUNNEL_EXCLUDE)
    claimed = int(db.execute(f"SELECT COUNT(*) AS c FROM leads WHERE {w}", params_base).fetchone()['c'] or 0)
    ph = ','.join('?' * len(PRE_VIDEO_STATUSES))
    params_v = (user_id, *_FUNNEL_EXCLUDE, *PRE_VIDEO_STATUSES)
    video = int(
        db.execute(
            f"SELECT COUNT(*) AS c FROM leads WHERE {w} AND status NOT IN ({ph})",
            params_v,
        ).fetchone()['c']
        or 0
    )
    proof = int(
        db.execute(
            f"""
            SELECT COUNT(*) AS c FROM leads WHERE {w}
              AND LOWER(COALESCE(payment_proof_approval_status,''))='pending'
              AND TRIM(COALESCE(payment_proof_path,'')) != ''
            """,
            params_base,
        ).fetchone()['c']
        or 0
    )
    paid = int(
        db.execute(
            f"SELECT COUNT(*) AS c FROM leads WHERE {w} AND status='Paid \u20b9196'",
            params_base,
        ).fetchone()['c']
        or 0
    )

    def pct(num: int, den: int) -> float:
        return round(100.0 * num / den, 1) if den else 0.0

    return {
        'claimed': claimed,
        'video_reached': video,
        'proof_pending': proof,
        'paid_196': paid,
        'enrolled_total': paid,
        'pct_video_vs_claimed': pct(video, claimed),
        'pct_proof_vs_video': pct(proof, video),
        'pct_enrolled_vs_video': pct(paid, video),
        'pct_enrolled_vs_claimed': pct(paid, claimed),
    }


def team_followup_attack_rows(db, user_id: int, today_iso: str, limit: int = 15) -> list[dict]:
    """Due / hot follow-ups for team — edit links (not /follow-up queue)."""
    fu_ph = ','.join('?' * len(FOLLOWUP_TAGS))
    q = f"""
        SELECT id, name, phone, follow_up_date, status, call_result
        FROM leads
        WHERE assigned_user_id=? AND in_pool=0 AND deleted_at=''
          AND status NOT IN ('Converted','Fully Converted','Lost','Retarget','Inactive')
          AND (
            (follow_up_date != '' AND date(substr(trim(follow_up_date),1,10)) <= date(?))
            OR call_result IN ({fu_ph})
          )
        ORDER BY CASE WHEN follow_up_date != '' THEN follow_up_date ELSE '9999-12-31' END ASC
        LIMIT ?
    """
    rows = db.execute(q, (user_id, today_iso, *FOLLOWUP_TAGS, limit)).fetchall()
    return [dict(r) for r in rows]


def downline_member_execution_stats(
    db, user_ids: list[int], today_iso: str
) -> dict[int, dict[str, Any]]:
    """Per assignee: totals, enrollments, proof queue, follow-up pressure."""
    if not user_ids:
        return {}
    ph = ','.join('?' * len(user_ids))
    fu_ph = ','.join('?' * len(FOLLOWUP_TAGS))
    q = f"""
        SELECT assigned_user_id,
            COUNT(*) AS total_active,
            SUM(CASE WHEN status IN ('Paid ₹196','Mindset Lock') THEN 1 ELSE 0 END) AS enrollments,
            SUM(CASE WHEN LOWER(COALESCE(payment_proof_approval_status,''))='pending'
                      AND TRIM(COALESCE(payment_proof_path,'')) != '' THEN 1 ELSE 0 END) AS proof_pend,
            SUM(CASE WHEN (follow_up_date != '' AND date(substr(trim(follow_up_date),1,10)) <= date(?))
                      OR call_result IN ({fu_ph}) THEN 1 ELSE 0 END) AS fu_due
        FROM leads
        WHERE assigned_user_id IN ({ph}) AND in_pool=0 AND deleted_at=''
          AND status NOT IN ('Lost','Retarget','Inactive','Converted','Fully Converted')
        GROUP BY assigned_user_id
    """
    params = [today_iso, *FOLLOWUP_TAGS, *user_ids]
    out: dict[int, dict[str, Any]] = {}
    for r in db.execute(q, params).fetchall():
        uid = int(r['assigned_user_id'])
        tot = int(r['total_active'] or 0)
        enr = int(r['enrollments'] or 0)
        out[uid] = {
            'total_active': tot,
            'enrollments': enr,
            'proof_pend': int(r['proof_pend'] or 0),
            'fu_due': int(r['fu_due'] or 0),
            'conv_pct': round(100.0 * enr / tot, 1) if tot else 0.0,
        }
    return out


def bottleneck_tags_for_member(
    stats: dict[str, Any] | None,
    calls_today: int,
) -> list[str]:
    if not stats:
        return []
    if int(stats.get('total_active') or 0) == 0:
        return ['No assigned leads']
    tags: list[str] = []
    if int(stats.get('proof_pend') or 0) >= 2:
        tags.append('Proof stuck')
    if int(stats.get('fu_due') or 0) >= 3 or (
        int(stats.get('fu_due') or 0) >= 1
        and int(stats.get('enrollments') or 0) == 0
        and int(stats.get('total_active') or 0) >= 4
    ):
        tags.append('Follow-up slow')
    if int(stats.get('total_active') or 0) >= 2 and calls_today == 0:
        tags.append('No activity')
    if not tags:
        tags.append('On track')
    return tags


def admin_at_risk_leads(db, stale_hours: int = 48, limit: int = 500) -> list[dict[str, Any]]:
    """Leads stale on current stage (pipeline_entered_at or updated_at)."""
    sh = max(1, int(stale_hours))
    rows = db.execute(
        f"""
        SELECT l.id, l.name, l.phone, l.status, l.updated_at, l.pipeline_entered_at,
               l.last_contacted, l.payment_proof_approval_status, l.payment_proof_path,
               COALESCE(l.stale_worker, '')       AS stale_worker,
               COALESCE(l.stale_worker_since, '') AS stale_worker_since,
               COALESCE(l.stale_worker_by, '')    AS stale_worker_by,
               COALESCE(u.username, '') AS assignee,
               TRIM(COALESCE(l.current_owner, '')) AS current_owner
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_user_id
        WHERE l.in_pool=0 AND l.deleted_at=''
          AND l.status NOT IN ('Lost','Converted','Fully Converted','Retarget','Inactive')
          AND datetime(
            CASE WHEN TRIM(COALESCE(l.pipeline_entered_at,'')) != ''
                 THEN l.pipeline_entered_at ELSE l.updated_at END
          ) <= datetime('now', '+5 hours', '+30 minutes', '-{sh} hours')
        ORDER BY datetime(
            CASE WHEN TRIM(COALESCE(l.pipeline_entered_at,'')) != ''
                 THEN l.pipeline_entered_at ELSE l.updated_at END
        ) ASC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()

    now = _now_ist()
    out: list[dict[str, Any]] = []
    _leader_cache: dict[str, str | None] = {}

    def _nearest_leader(username_key: str) -> str | None:
        uu = (username_key or "").strip()
        if not uu:
            return None
        if uu not in _leader_cache:
            _leader_cache[uu] = nearest_approved_leader_username(db, uu)
        return _leader_cache[uu]

    for r in rows:
        raw = (r['pipeline_entered_at'] or '').strip() or (r['updated_at'] or '').strip()
        days_stuck = 0.0
        try:
            if len(raw) >= 19:
                dt = _dt.datetime.strptime(raw[:19], '%Y-%m-%d %H:%M:%S')
                days_stuck = max(0.0, (now - dt).total_seconds() / 86400.0)
        except (TypeError, ValueError):
            days_stuck = 0.0
        d = dict(r)
        co = (d.get("current_owner") or "").strip()
        ax = (d.get("assignee") or "").strip()
        d["assignee"] = ax
        d["current_owner"] = co
        # Org-tree: anchor on permanent buyer when set (matches handoff + wallet), else executor.
        anchor = co or ax
        d["team_member_display"] = anchor or ""
        d["leader_username"] = _nearest_leader(anchor) or ""
        d['days_stuck'] = round(days_stuck, 1)
        ps = (d.get('payment_proof_approval_status') or '').strip().lower()
        path = (d.get('payment_proof_path') or '').strip()
        if path and ps == 'pending':
            d['proof_state'] = 'pending'
        elif ps == 'approved':
            d['proof_state'] = 'approved'
        elif ps == 'rejected':
            d['proof_state'] = 'rejected'
        else:
            d['proof_state'] = 'none' if not path else ps or 'uploaded'
        out.append(d)
    out.sort(key=lambda x: -x['days_stuck'])
    return out


def stale_redistribute(db, stale_hours: int = 48, top_n: int = 5, actor: str = 'auto', limit: int = 50) -> dict:
    """
    Assign stale leads (no update in stale_hours) to top-N team members by all-time points.
    Zero-risk: assigned_user_id is NEVER changed. Only stale_worker fields are set.
    Leads already stale-assigned within the last 24h are skipped to avoid churn.
    Returns {'assigned': count, 'skipped': count}
    """
    sh = max(1, int(stale_hours))

    # Step 1: Auto-clear stale_worker for leads that are no longer stale
    # (original owner updated them since the working assignment was made)
    db.execute(
        f"""UPDATE leads SET stale_worker='', stale_worker_since='', stale_worker_by=''
            WHERE in_pool=0 AND deleted_at=''
              AND TRIM(COALESCE(stale_worker,'')) != ''
              AND datetime(updated_at) > datetime('now', '+5 hours', '+30 minutes', '-{sh} hours')"""
    )
    db.commit()

    # Step 2a: Count churn-protected leads (already assigned within 24h) for accurate telemetry
    skipped = db.execute(
        f"""
        SELECT COUNT(*) FROM leads
        WHERE in_pool=0 AND deleted_at=''
          AND status NOT IN ('Lost','Converted','Fully Converted','Retarget','Inactive','Seat Hold Confirmed')
          AND datetime(updated_at) <= datetime('now', '+5 hours', '+30 minutes', '-{sh} hours')
          AND TRIM(COALESCE(stale_worker,'')) != ''
          AND TRIM(COALESCE(stale_worker_since,'')) != ''
          AND datetime(stale_worker_since) > datetime('now', '+5 hours', '+30 minutes', '-24 hours')
        """
    ).fetchone()[0] or 0

    # Step 2b: Find leads that are still stale and need assignment
    # Include assignee username so we can notify original owner
    rows = db.execute(
        f"""
        SELECT l.id, COALESCE(u.username, '') AS owner_username
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_user_id
        WHERE l.in_pool=0 AND l.deleted_at=''
          AND l.status NOT IN ('Lost','Converted','Fully Converted','Retarget','Inactive','Seat Hold Confirmed')
          AND datetime(l.updated_at) <= datetime('now', '+5 hours', '+30 minutes', '-{sh} hours')
          AND (
            TRIM(COALESCE(l.stale_worker,'')) = ''
            OR (
              TRIM(COALESCE(l.stale_worker_since,'')) != ''
              AND datetime(l.stale_worker_since) <= datetime('now', '+5 hours', '+30 minutes', '-24 hours')
            )
          )
        ORDER BY l.updated_at ASC
        LIMIT ?
        """,
        (max(1, int(limit)),),
    ).fetchall()

    if not rows:
        return {'assigned': 0, 'skipped': skipped, 'assignments': [], 'worker_counts': {}}

    workers = db.execute(
        """
        SELECT username FROM users
        WHERE role='team' AND status='approved' AND IFNULL(idle_hidden, 0)=0
        ORDER BY total_points DESC, username ASC
        LIMIT ?
        """,
        (top_n,),
    ).fetchall()

    if not workers:
        return {'assigned': 0, 'skipped': len(rows), 'assignments': [], 'worker_counts': {}}

    worker_names = [r['username'] for r in workers]
    now_str = _now_ist().strftime('%Y-%m-%d %H:%M:%S')
    assignments = []
    worker_counts: dict[str, int] = {}

    for i, row in enumerate(rows):
        worker = worker_names[i % len(worker_names)]
        db.execute(
            "UPDATE leads SET stale_worker=?, stale_worker_since=?, stale_worker_by=? WHERE id=?",
            (worker, now_str, actor, row['id']),
        )
        assignments.append((int(row['id']), row['owner_username'], worker))
        worker_counts[worker] = worker_counts.get(worker, 0) + 1
        # Log to lead_assignments
        _w_uid = db.execute("SELECT id FROM users WHERE username=?", (worker,)).fetchone()
        _w_uid_val = int(_w_uid['id']) if _w_uid else None
        if _w_uid_val:
            try:
                db.execute(
                    "INSERT OR IGNORE INTO lead_assignments (lead_id, assigned_to, previous_assigned_to, assigned_by, assign_type, reason, created_at) VALUES (?,?,NULL,?,?,?,?)",
                    (row['id'], _w_uid_val, actor, 'auto_stale', 'auto stale redistribute', now_str),
                )
            except Exception:
                pass

    db.commit()
    return {'assigned': len(rows), 'skipped': skipped, 'assignments': assignments, 'worker_counts': worker_counts}


def admin_weak_members(db, today_iso: str, limit: int = 200) -> list[dict[str, Any]]:
    """Team + leader: conversion vs active load, follow-up debt."""
    fu_ph = ','.join('?' * len(FOLLOWUP_TAGS))
    rows = db.execute(
        f"""
        SELECT u.username, u.role,
            COUNT(l.id) AS total_leads,
            SUM(CASE WHEN l.status IN ('Paid ₹196','Mindset Lock') THEN 1 ELSE 0 END) AS enrollments,
            SUM(CASE WHEN (l.follow_up_date != '' AND date(substr(trim(l.follow_up_date),1,10)) <= date(?))
                      OR l.call_result IN ({fu_ph}) THEN 1 ELSE 0 END) AS fu_pending
        FROM users u
        LEFT JOIN leads l ON l.assigned_user_id = u.id AND l.in_pool=0 AND l.deleted_at=''
          AND l.status NOT IN ('Lost','Retarget','Inactive')
        WHERE u.role IN ('team','leader') AND u.status='approved'
        GROUP BY u.id
        ORDER BY u.username
        LIMIT ?
        """,
        (today_iso, *FOLLOWUP_TAGS, limit),
    ).fetchall()

    out = []
    for r in rows:
        tot = int(r['total_leads'] or 0)
        enr = int(r['enrollments'] or 0)
        fu = int(r['fu_pending'] or 0)
        conv = round(100.0 * enr / tot, 1) if tot else 0.0
        out.append({
            'username': r['username'],
            'role': r['role'],
            'total_leads': tot,
            'enrollments': enr,
            'fu_pending': fu,
            'conv_pct': conv,
        })
    out.sort(key=lambda x: (x['conv_pct'], -x['fu_pending']))
    return out


def admin_leak_map(db) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Status histogram + ordered funnel drop hints (enrollment path)."""
    hist = db.execute(
        """
        SELECT status, COUNT(*) AS c
        FROM leads
        WHERE in_pool=0 AND deleted_at=''
        GROUP BY status
        ORDER BY c DESC
        """
    ).fetchall()
    hist_list = [{'status': r['status'], 'count': int(r['c'] or 0)} for r in hist]
    funnel_order = [
        'New Lead', 'New', 'Contacted', 'Invited', 'Video Sent', 'Video Watched',
        'Paid ₹196', 'Mindset Lock',
    ]
    m = {x['status']: x['count'] for x in hist_list}
    drops = []
    prev = None
    for st in funnel_order:
        c = int(m.get(st, 0))
        if prev is not None:
            drops.append({
                'from_status': prev[0],
                'to_status': st,
                'from_count': prev[1],
                'to_count': c,
                'drop_pct': round(100.0 * (prev[1] - c) / prev[1], 1) if prev[1] else 0.0,
            })
        prev = (st, c)
    return hist_list, drops
