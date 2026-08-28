# Remaining legacy `tests/` failures — triage list

Baseline: `main` had **63 failed**. After the safe fixes in this branch it is
~**49 failed** (count flickers 49–54 due to test-ordering flakiness, see group E).
None of these are caused by the audit-fix PR #539 (verified clean).

The rule we're applying: **current app behaviour is the source of truth.** Each
item below needs one of: (a) update the test's expected value to match current
behaviour, (b) delete the test if it checks a removed feature, or (c) treat as a
real bug. Grouped so you can decide quickly.

---

## A. Feature-gap — test checks behaviour the app no longer has (YOUR CALL: delete vs bug)
- `test_api_v1_workboard.py::test_team_workboard_shows_unassigned_paid_lead_via_creator_fallback`
- `test_api_v1_workboard.py::test_leader_workboard_shows_downline_unassigned_paid_lead_via_creator_fallback`
  → An unassigned "paid"/day1 lead is no longer surfaced to its **creator** (column total = 0). Either the creator-fallback visibility was intentionally removed (delete tests) or leads are wrongly going invisible (bug).
- `test_api_v1_workboard.py::test_slice2_team_workboard_uses_assignment_not_creator`
- `test_api_v1_workboard.py::test_slice2_team_workboard_hides_unassigned_self_created_lead`
  → Team workboard scoping (assignment vs creator) behaviour changed.
- `test_api_v1_analytics.py::test_analytics_activity_log_admin_ok` (admin sees extra login rows)
- `test_api_v1_analytics.py::test_analytics_activity_log_forbidden_leader` (leader now gets 200, test expects 403 → access rule changed)

## B. Count / scope mismatch — likely just update expected numbers to current
- `test_api_v1_team_reports.py::test_team_reports_admin_json_shape` (rows 10 vs 2)
- `test_api_v1_team_reports.py::test_team_reports_admin_gets_all_submitted_rows` (10 vs 2)
- `test_api_v1_team_reports.py::test_team_reports_leader_gets_only_downline_member_rows` (3 vs 1)
- `test_api_v1_team_reports.py::test_team_reports_leader_live_summary_is_scoped_to_downline` (KeyError 'enrolled_today')
- `test_api_v1_team_reports.py::test_team_reports_requires_admin_or_leader`
- `test_api_v1_team_tracking.py::test_team_tracking_admin_overview_uses_canonical_scope_and_server_counts` (10 vs 2)
- `test_api_v1_team_tracking.py::test_team_tracking_leader_scope_is_recursive_downline_only` (3 vs 1)
- `test_api_v1_team_tracking.py::test_team_tracking_team_me_is_self_and_other_member_hidden`
- `test_execution_enforcement_api.py::test_team_funnel_ok`
- `test_execution_enforcement_api.py::test_team_today_stats_ok`
- `test_execution_enforcement_api.py::test_team_today_stats_count_distinct_fresh_calls`
- `test_execution_enforcement_api.py::test_team_cannot_admin_leak_map`
- `test_api_v1_team.py::test_team_members_admin_lists_users` (name 'Leader Budget' vs 'TestLeaderDisplay' — seed/order)

## C. Status/slug rename or flow change — update test to current names/flow
- `test_api_v1_ctcs.py::test_ctcs_action_interested_updates_lead` ('not_called' vs 'video_sent')
- `test_api_v1_ctcs.py::test_ctcs_action_paid_requires_approved_proof`
- `test_api_v1_ctcs.py::test_ctcs_action_not_interested_archives`
- `test_api_v1_payments.py::test_flp_min_billing_flow_keeps_paid_to_mindset_to_day2_to_day3_intact`
- `test_api_v1_payments.py::test_public_payment_proof_upload_reaches_admin_queue`
- `test_api_v1_payments.py::test_payment_approval_restores_missing_assignee_for_workboard_route`
- `test_api_v1_leads.py::test_slice1_team_list_only_creator_not_assignee`
- `test_api_v1_leads.py::test_team_lead_payload_includes_owner_and_leader_metadata`
- `test_api_v1_leads.py::test_mindset_lock_complete_handles_persisted_started_at_after_reconnect_into_day2`
- `test_api_v1_leads.py::test_batch_watch_payload_waits_until_slot_time`

## D. XP logic changed — update expected award values
- `test_api_v1_xp.py::test_converted_xp_goes_to_assignee_and_reverts_cleanly` (50 vs 100)
- `test_api_v1_xp.py::test_lead_contacted_xp_is_one_time_per_lead` (10 vs None)
- `test_api_v1_xp.py::test_ping_login_awards_only_once_per_day`
- `test_api_v1_xp.py::test_team_report_submission_is_locked_to_today`

## D2. Discipline restore-on-login (real logic question)
- `test_api_v1_auth_login.py::test_password_login_restores_same_day_auto_removed_user_on_rollout_start`
- `test_api_v1_auth_login.py::test_password_login_restores_legacy_auto_removed_user_without_removed_at`
  → These verify that a removed user is auto-restored on login under rollout-grandfather rules. Behaviour/date logic needs a look.

## E. Test-isolation flakiness (shared SQLite across tests) — infra, not app
- `test_api_v1_wallet.py::test_wallet_me_requires_auth` / `test_wallet_me_zero_balance` (sqlite "database is locked")
- `test_api_v1_wallet.py::test_wallet_adjustment_admin_then_balance` / `_recharge_responses_include_display_names` / `_recharge_approval_sends_push_notification` (order-dependent)
- `test_api_v1_team.py::test_my_team_team_user_ok`, `test_admin_training_put_forbidden_for_team`, `test_enrollment_requests_forbidden_for_team`, `test_admin_can_manage_member_compliance_controls`, `test_team_can_request_and_cancel_own_grace` (pass alone, fail in full suite — shared dev-user state)
- `test_api_v1_ws.py::test_ws_accepts_cookie_and_receives_broadcast` (websocket pytest-timeout)
- `test_execution_stale_watch_cycle.py::*` (reassign counts 1 vs 2 / 52 vs 53 — order/timing)

---

### Recommendation
- **B, C, D**: mechanical — update expected values to current behaviour.
- **A, D2**: your decision (feature removed vs real bug).
- **E**: fix test isolation (give each test its own DB / transaction rollback, or
  mark serial) — biggest structural win; would also stabilise the flaky count.
