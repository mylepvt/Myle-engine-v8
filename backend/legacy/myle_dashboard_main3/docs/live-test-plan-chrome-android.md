# Live test plan — Chrome + Android (real world)

**Objective:** Verify UI, logic, speed, and behavior on real devices.

**Core rule:** If it is not smooth on mobile, it does not exist in the real world.

---

## Verification status (what we actually checked)

| Area | Automated / CI | Headed Chrome script (`live_chrome_full_plan.py`) | Manual (real phone / DB tweak) |
|------|----------------|---------------------------------------------------|--------------------------------|
| **pytest** (`tests/`) | ✅ 19 passed — API/logic/regression | — | — |
| **Part 1 — claim** | Partial (integration tests) | ✅ Team claim ×2, wallet seed | Production URL |
| **Part 1 — inactivity** | Logic in helpers | ❌ not in script | ✅ Need user with **work** inactivity 24h / 48h / 72h (`activity_log`, not login) |
| **Part 1 — dashboard + AI** | Step 8 unit tests | ✅ Coach visible + copy | Readability on small height |
| **Part 1 — console** | — | ✅ No JS errors in run | Full manual pass |
| **A — mobile UI fit** | — | ✅ 390×844 scroll sample | Rotate / keyboard on device |
| **B — touch** | — | ✅ Dropdown change when present | Finger on device |
| **C — claim mobile** | — | Same as desktop script | Same URL on phone |
| **D — inactivity mobile** | — | ❌ | Same tiers as desktop; must engineer inactive user |
| **E — follow-up** | — | ✅ Date input filled | Keyboard overlay on Android |
| **F — AI** | — | ✅ | Font/size on phone |
| **G — slow network** | — | Partial: **claim** has spinner + disable | Throttle in DevTools / bad 4G |
| **H — back** | — | ❌ | Android back from Leads |
| **I — multi-tap** | — | Partial: **claim** guarded | Spam-tap on device |
| **J — two devices** | — | ❌ | Two browsers = two sessions; **data** same after refresh |

**Bottom line:** Code paths are green in CI; headed Chrome run was **clean (no console errors)** for the automated slice. **D, G (full), H, J** and “perfect” mobile feel still need **your phone + optional DB setup** for inactivity.

---

## Part 1 — Desktop (Chrome)

| Check | What to do | Pass criteria |
|--------|------------|----------------|
| **Claim flow** | Lead Pool → set count → Claim → open My Leads | New leads appear; wallet balance decreases once |
| **Inactivity banners** | Use a test user with controlled work inactivity (see notes below) | **24h** → yellow warning; **48h** → red pool block; **72h+** → strong red; day 2+ of 72h streak → final warning copy |
| **Dashboard counts** | Compare tiles to DB / expectations | Numbers consistent |
| **AI insights** | Open `/dashboard` as team or leader | Coach card: short next action + priority; readable, not a wall of text |
| **Console** | DevTools → Console during main flows | No uncaught errors (red) |

---

## Part 2 — Android live test

### Setup

**Option 1 (simple):** Open the same deployed URL in mobile Chrome.

**Option 2 (LAN, better for local dev):**

- Laptop and phone on the **same Wi‑Fi**.
- Run the app bound to all interfaces, e.g. `flask run --host=0.0.0.0 --port=5000`.
- On the phone: `http://<laptop-LAN-IP>:5000` (e.g. `http://192.168.1.42:5000`).
- Allow the port through the laptop firewall if needed.

### Test matrix

| ID | Focus | Steps | Expected |
|----|--------|--------|----------|
| **A — Mobile UI fit** | Layout | Rotate phone; scroll long pages; check primary actions | No critical buttons clipped; no overlap; bottom nav usable on small screens |
| **B — Touch accuracy** | Tap targets | Claim; call-status dropdown; follow-up date | One deliberate tap → one action; no accidental double open |
| **C — Claim (mobile)** | End-to-end | Claim 2–3 leads | List and wallet update; no duplicate leads from a single intentional claim |
| **D — Inactivity** | Banners | Same tier rules as desktop | Alerts clearly visible on narrow screens; pool shows “claiming paused” when gated |
| **E — Follow-up input** | Keyboard | Edit lead → set `follow_up_date` with keyboard open | Field stays usable; minimal layout jump (see iOS modal notes in `leads.html` if testing Safari) |
| **F — AI insights** | Readability | Dashboard coach card | 1–2 line headline feel; fits without horizontal scroll |
| **G — Slow network** | Feedback | Throttle network (Chrome remote debugging) or weak data; submit claim | Loader / disabled submit on claim form after first tap; user sees “Claiming…” |
| **H — Back button** | Navigation | Open Leads → Android back | Sensible history; no crash; logout only if session invalid or user logs out |
| **I — Multi-tap spam** | Double submit | Tap Claim rapidly many times | **One** successful claim flow; button stays disabled after first submit |
| **J — Session / two devices** | Sync | Log in on phone and desktop (same user) | **Data** matches after refresh on both. Note: each browser has its **own** Flask session cookie — not a single shared “session” object, but the same account |

---

## Part 3 — Critical mobile risks (watch during runs)

- Buttons too small → missed taps.
- Scroll jank → user drops off.
- Slow server response → user spams taps (mitigate with disable + spinner on claim).
- Too many stacked alerts (inactivity + performance + AI) → confusion.

---

## Part 4 — Final validation

- Put **one leader** on **phone only** for a realistic task (claim → update call status → daily report).
- Observe quietly: where they stop, what they misread, what they tap twice.

---

## Codebase notes (Myle Dashboard)

1. **Viewport:** `templates/base.html` — `width=device-width`, `initial-scale=1`, `viewport-fit=cover`.
2. **Inactivity UI:** Tiered banners in `base.html`; pool messaging in `templates/lead_pool.html`.
3. **Work inactivity clock:** Login/logout **do not** reset discipline inactivity; only meaningful work events in `activity_log` (and similar) do. Testing “inactive” users requires accounts with old **work** activity timestamps (or a dev DB).
4. **Claim double-submit:** `lead_pool.html` disables the Claim button and shows a spinner on first submit to reduce duplicate POSTs under slow networks or spam taps.
5. **Call status AJAX:** `templates/leads.html` disables the dropdown while `fetch` is in flight.

---

## Quick checklist (copy for each run)

- [ ] Chrome desktop: claim, dashboard, AI card, console clean  
- [ ] Android: UI fit (A), touch (B), claim (C), inactivity (D), FU date (E), AI (F)  
- [ ] Android: slow network (G), back (H), spam tap (I), two-device refresh (J)  
- [ ] Leader observation session (Part 4)  

**Tester:** _______________ **Date:** _______________ **Build / URL:** _______________

---

## Local headed Chrome (Playwright) — saath-saath dekhna

Ek **alag** SQLite file + port use karo taaki purane DB / port clash na ho.

**Terminal 1 — server:**

```bash
cd /path/to/Myle-Dashboard-main
rm -f /tmp/myle_live_chrome.db
export DATABASE_PATH=/tmp/myle_live_chrome.db
export BOOTSTRAP_ADMIN_PASSWORD='LiveWatch99'
export SECRET_KEY='live-demo-key'
export PORT=5010
export GUNICORN_MULTI_WORKER=1
python3 app.py
```

**Terminal 2 — Chrome khulega (slow motion):**

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5010 \
PLAYWRIGHT_USERNAME=admin \
PLAYWRIGHT_PASSWORD='LiveWatch99' \
python3 scripts/live_chrome_watch.py
```

- Pehle `pip install playwright` aur `python3 -m playwright install chrome` (ya Chromium).
- Browser band hone se pehle rokna ho to: `PLAYWRIGHT_PAUSE=1` bhi set karo.
- Phone se LAN IP se kholna ho to server log me `Running on http://192.168.x.x:5010` dikhega — wahi URL mobile Chrome me.

### Pura plan ek baar Chrome me (desktop + mobile viewport)

**Terminal 1** (example port `5011`, alag DB):

```bash
cd /path/to/Myle-Dashboard-main
rm -f /tmp/myle_live_full.db
export DATABASE_PATH=/tmp/myle_live_full.db
export BOOTSTRAP_ADMIN_PASSWORD='LiveFull99'
export SECRET_KEY='live-full-key'
export PORT=5011
export GUNICORN_MULTI_WORKER=1
python3 app.py
```

**Terminal 2** — **seed + team claim + AI dashboard + admin + 390px mobile** (Chrome headed, slow motion):

```bash
cd /path/to/Myle-Dashboard-main
export DATABASE_PATH=/tmp/myle_live_full.db
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:5011
export PLAYWRIGHT_ADMIN_PASSWORD='LiveFull99'
export PLAYWRIGHT_SLOW_MO=350
python3 scripts/live_chrome_full_plan.py
```

- Script **`liveteam` / `LivePlan99!`** banata hai, wallet + pool leads bharta hai.
- Admin password **`PLAYWRIGHT_ADMIN_PASSWORD`** wahi hona chahiye jo `BOOTSTRAP_ADMIN_PASSWORD` se server pe seed hua.
- Android par dekhne ke liye phone pe `http://<laptop-LAN-IP>:5011` khol kar manually same checks chalao (script sirf desktop Chrome automation hai).
