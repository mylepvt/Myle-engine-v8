-- Fix user hierarchy according to strict rules:
-- 1) Admin is ROOT
-- 2) Leaders must have admin as upline
-- 3) Team members must have a leader as upline (never team/admin)
-- 4) Team->team chains are reassigned to nearest leader (fallback: any leader)
-- 5) Invalid upline_fbo_id values are removed

BEGIN TRANSACTION;

-- Canonical admin + fallback leader
DROP TABLE IF EXISTS _hier_admin;
CREATE TEMP TABLE _hier_admin AS
SELECT id, username, COALESCE(NULLIF(TRIM(fbo_id), ''), '') AS fbo_id
FROM users
WHERE role='admin'
ORDER BY id
LIMIT 1;

DROP TABLE IF EXISTS _hier_any_leader;
CREATE TEMP TABLE _hier_any_leader AS
SELECT id, username, COALESCE(NULLIF(TRIM(fbo_id), ''), '') AS fbo_id
FROM users
WHERE role='leader'
ORDER BY id
LIMIT 1;

-- Remove invalid upline_fbo_id references (non-existent FBO)
UPDATE users
SET upline_fbo_id = ''
WHERE TRIM(COALESCE(upline_fbo_id, '')) != ''
  AND NOT EXISTS (
      SELECT 1 FROM users p
      WHERE TRIM(COALESCE(p.fbo_id, '')) = TRIM(users.upline_fbo_id)
  );

-- Build resolved parent username from existing fields
DROP TABLE IF EXISTS _hier_parent;
CREATE TEMP TABLE _hier_parent AS
SELECT
  u.username,
  CASE
    WHEN TRIM(COALESCE(u.upline_username, '')) != ''
         AND EXISTS (SELECT 1 FROM users p WHERE p.username = TRIM(u.upline_username))
      THEN TRIM(u.upline_username)
    WHEN TRIM(COALESCE(u.upline_name, '')) != ''
         AND EXISTS (SELECT 1 FROM users p WHERE p.username = TRIM(u.upline_name))
      THEN TRIM(u.upline_name)
    WHEN TRIM(COALESCE(u.upline_fbo_id, '')) != ''
      THEN (
        SELECT p.username
        FROM users p
        WHERE TRIM(COALESCE(p.fbo_id, '')) = TRIM(u.upline_fbo_id)
        ORDER BY p.id
        LIMIT 1
      )
    ELSE NULL
  END AS parent_username
FROM users u;

-- Leaders: always under admin root
UPDATE users
SET
  upline_username = (SELECT username FROM _hier_admin),
  upline_name     = (SELECT username FROM _hier_admin),
  upline_fbo_id   = (SELECT fbo_id   FROM _hier_admin),
  upline_id       = (SELECT id       FROM _hier_admin)
WHERE role = 'leader';

-- Admin: clear upline fields (root node)
UPDATE users
SET
  upline_username = '',
  upline_name     = '',
  upline_fbo_id   = '',
  upline_id       = NULL
WHERE role = 'admin';

-- Find nearest leader for each team by climbing parent chain
DROP TABLE IF EXISTS _hier_nearest_leader;
CREATE TEMP TABLE _hier_nearest_leader AS
WITH RECURSIVE chain(start_user, cur_user, depth) AS (
  SELECT t.username, t.username, 0
  FROM users t
  WHERE t.role='team'
  UNION ALL
  SELECT c.start_user, hp.parent_username, c.depth + 1
  FROM chain c
  JOIN _hier_parent hp ON hp.username = c.cur_user
  WHERE hp.parent_username IS NOT NULL
    AND c.depth < 30
),
leader_hits AS (
  SELECT
    c.start_user AS team_username,
    c.cur_user   AS leader_username,
    c.depth
  FROM chain c
  JOIN users u ON u.username = c.cur_user
  WHERE u.role='leader'
),
best AS (
  SELECT
    lh.team_username,
    lh.leader_username,
    lh.depth
  FROM leader_hits lh
  JOIN (
    SELECT team_username, MIN(depth) AS min_depth
    FROM leader_hits
    GROUP BY team_username
  ) md
    ON md.team_username = lh.team_username
   AND md.min_depth = lh.depth
)
SELECT team_username, leader_username
FROM best;

-- Team assignment:
-- 1) Keep if parent is already a leader
-- 2) Else nearest leader from chain
-- 3) Else fallback to any leader
UPDATE users
SET
  upline_username = COALESCE(
    (
      SELECT hp.parent_username
      FROM _hier_parent hp
      JOIN users p ON p.username = hp.parent_username
      WHERE hp.username = users.username
        AND p.role = 'leader'
      LIMIT 1
    ),
    (
      SELECT nl.leader_username
      FROM _hier_nearest_leader nl
      WHERE nl.team_username = users.username
      LIMIT 1
    ),
    (SELECT username FROM _hier_any_leader)
  ),
  upline_name = COALESCE(
    (
      SELECT hp.parent_username
      FROM _hier_parent hp
      JOIN users p ON p.username = hp.parent_username
      WHERE hp.username = users.username
        AND p.role = 'leader'
      LIMIT 1
    ),
    (
      SELECT nl.leader_username
      FROM _hier_nearest_leader nl
      WHERE nl.team_username = users.username
      LIMIT 1
    ),
    (SELECT username FROM _hier_any_leader)
  )
WHERE role = 'team';

-- Sync upline_fbo_id + upline_id from resolved upline username
UPDATE users
SET
  upline_fbo_id = COALESCE(
    (
      SELECT COALESCE(NULLIF(TRIM(p.fbo_id), ''), '')
      FROM users p
      WHERE p.username = users.upline_username
      LIMIT 1
    ),
    ''
  ),
  upline_id = (
    SELECT p.id
    FROM users p
    WHERE p.username = users.upline_username
    LIMIT 1
  )
WHERE role IN ('team', 'leader');

-- Final guard: team cannot remain null/blank upline if leaders exist
UPDATE users
SET
  upline_username = (SELECT username FROM _hier_any_leader),
  upline_name     = (SELECT username FROM _hier_any_leader),
  upline_fbo_id   = (SELECT fbo_id   FROM _hier_any_leader),
  upline_id       = (SELECT id       FROM _hier_any_leader)
WHERE role='team'
  AND (
    TRIM(COALESCE(upline_username, '')) = ''
    OR upline_id IS NULL
  )
  AND EXISTS (SELECT 1 FROM _hier_any_leader);

DROP TABLE IF EXISTS _hier_admin;
DROP TABLE IF EXISTS _hier_any_leader;
DROP TABLE IF EXISTS _hier_parent;
DROP TABLE IF EXISTS _hier_nearest_leader;

COMMIT;
