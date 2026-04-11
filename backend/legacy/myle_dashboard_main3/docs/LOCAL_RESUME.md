# Myle Dashboard — local resume (short)

यही फ़ाइल repo में **local** रहती है: `docs/LOCAL_RESUME.md`

---

## Current stage — March 2026

| Item | Detail |
|------|--------|
| **Branch** | `main` — काम शुरू से पहले `git pull` |
| **Focus** | Admin **Command Center** par sirf **do daily KPI** (IST): **Today claimed leads** + **Today enrollments (₹196 path)** |
| **Code** | `app.py` → `admin_dashboard` (`kpi_today_claimed`, `kpi_today_enrolled`, `kpi_today_enrolled_amount`, `pulse`); UI `templates/admin.html` |
| **Claimed (product)** | `claimed_at` = aaj (IST), `in_pool = 0`, `claimed_at` set; active lead जैसा query में है |
| **Enrolled (₹196 path)** | `payment_done = 1`, `updated_at` = aaj (IST), `status IN ('Paid ₹196','Mindset Lock')` |
| **Tests** | `python3 -m pytest -q` |
| **Trap** | `routes/dashboard_routes.py` का `/admin` **wire नहीं** (`register_dashboard_routes` `app.py` में नहीं) — असली handler `app.py` में |

---

## Run

```bash
python app.py
# http://127.0.0.1:5003
```

---

*Commit नंबर यहाँ hardcode नहीं — `git log -1 --oneline` से देख लो।*
