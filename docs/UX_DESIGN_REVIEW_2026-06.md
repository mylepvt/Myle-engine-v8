# Myle Engine v8 — Brutal UX Design Review

**Review date:** 2026-06-03
**Panel (personas):** Former Apple HIG Designer · Former Airbnb Product Designer · Nielsen Norman Group UX Researcher · Enterprise SaaS Product Designer
**Scope:** Cognitive overload · Navigation · User journeys · First-time experience · Mobile usability · Conversion paths · Leader workflow · Team-member workflow
**Method:** Code-grounded walkthrough of the live React app (`frontend/src`) — routing registry, navigation, FTUE, and the journey-critical screens. Code quality intentionally ignored.

> Tone is deliberately harsh per the brief. The goal is to expose the gap between "feature-complete" and "usable." This app is feature-complete and, for a first-time user, close to unusable without a human trainer. That is the headline.

---

## 0. The one-sentence verdict

**You have built an internal operations *console* for power users who already know the jargon, and you are shipping it to field salespeople, brand-new recruits, and their team leaders as if it were a consumer app.** Every cross-cutting problem below flows from that single mismatch.

---

## 1. Cross-cutting findings (read this before the per-screen sections)

These repeat on almost every screen, so they're stated once here and referenced later.

### 1.1 Catastrophic navigation overload
From `dashboard-registry.ts` + `dashboard-route-roles.json`, the sidebar is organized into **7 sections** (`main, work, finance/Wallet, team, other/Community, system, settings`) and exposes, *per role*:

- **Team member:** ~18–19 destinations
- **Leader:** ~26–27 destinations
- **Admin:** ~40 destinations

NN/g's research puts comfortable top-level navigation at **5–7 items**. A brand-new salesperson lands on **~18**. This is 3× the threshold, with no progressive disclosure, no "pinned/recent," and no search over navigation (the only search is "Search leads").

The **Work** section alone contains, for a single user, an alphabet soup of overlapping lead buckets:
`Calling Board · Workboard · Follow-ups · Retarget · Archived Leads · Lead Pool · Lead Flow · Recycle Bin · Pending AS Process`.
That is **9 different places a "lead" can live**, with no map explaining the difference between *Lead Pool*, *Lead Flow*, *Calling Board*, and *Workboard*. Even a senior designer reading the source had to infer it.

### 1.2 Duplicate and inconsistent labels
- **"Training" appears twice** in the same sidebar — `system/training` (label "Training") *and* `other/training` (label "Training") — both visible to team, leader, and admin. Two identically named nav items is a textbook IA failure.
- The same concept is named **three different ways**: *Calling Board* (sidebar) vs *Calls* (mobile tab) vs the underlying "leads"; *Min. FLP Billing* (sidebar) vs *Min. FLP Billed* (team home hero) vs *Today's FLP approvals* (admin home). Users cannot build a stable mental model when the label mutates per screen.

### 1.3 Jargon wall — no plain language anywhere
FBO, FLP, AS Process, CC / Sale Approvals, Pending AS, Retarget, Lead Flow, Leader OS, "Min. FLP Billing," "basics streak." None of these are explained in-product. A first-time user has **zero** affordance to learn what any of it means without a human. This is the single biggest FTUE failure.

### 1.4 Language mixing (English ↔ Hinglish)
`LeaderOSPage` ships production warning copy like:
> "Team ne {n} din se daily call target miss kiya hai. Account lock ho gaya — admin se restore karwao."

…directly next to English UI ("Target Progress," "Team Performance"). Whether or not Hinglish is right for the audience, **mixing two languages inside one screen, only on the scary/punitive messages**, reads as unfinished and erodes trust at the exact moment (account lock) where trust matters most. Pick one voice and localize properly.

### 1.5 Gamification interleaved with money work
XP badges and an XP leaderboard (`XpBadge`, `XpLeaderboard`) are stacked *in the middle of* the revenue dashboard, between KPI cards and "Recent leads." Mixing slot-machine mechanics with "₹ billed today" and account-lock warnings is tonally incoherent and pushes the real work below the fold.

### 1.6 Mobile = a 4-slot tab bar in front of an 18-destination app
`DashboardMobileTabBar` exposes only **Home, Calls, Board, + one role-dependent tab, + "More."** So on a phone — the device field salespeople actually use — **~14 of ~18 destinations are hidden behind a "More" drawer.** The primary navigation surface for the primary device exposes <25% of the app.

On top of that, the tab bar is a custom **drag-to-switch "liquid-glass" control** (pointer capture, `touchAction: 'none'`, a 10px tap-vs-drag threshold, spring morphing width). This is over-engineered novelty that (a) hijacks native scroll/swipe gestures, (b) is not discoverable, (c) has no accessibility story for the drag, and (d) will feel "broken" to anyone who taps near a boundary. Apple's own tab bars don't do this for a reason.

---

## 2. First-Time User Experience & Conversion

### 2.1 Register (`RegisterPage.tsx`)

**Why users get confused**
- Seven fields across three ceremony-titled sections — *Account*, *Network details*, *Joining info* — for what is conceptually "sign up."
- The recruit must enter an **Upline FBO ID** they almost certainly don't have memorized ("Ask your leader for their FBO ID"). Upline is validated **on blur**, but the failure only surfaces as a generic error **on submit** — so a user can fill everything, hit submit, and *then* learn the most important field is wrong.
- "FBO ID" (chosen by user) vs "Display name" vs "Upline FBO ID" — three ID-shaped fields, one of which is someone else's. High confusion, high error rate.
- "New Joining" + "first time onboarding track (7-day training program)" is internal jargon presented as a casual checkbox.

**The conversion killer:** registration ends in *"Your account is pending admin approval… You can sign in after an admin approves your account."* There is **no instant value, no preview, no progress, no ETA.** The motivated new recruit hits a dead wall and closes the tab. For a growth-driven MLM/sales org, a manual-approval gate with no self-serve path is the highest-leverage conversion leak in the entire product.

1. **Confused because:** too many ID fields, the most critical one (upline) depends on external knowledge and fails late, and success = "go away and wait."
2. **Remove:** the three-section ceremony headers; the "New Joining" checkbox (infer it); the post-submit dead end.
3. **Merge:** "FBO ID" + "Display name" into a single first step (auto-suggest an FBO ID; let display name default to it). Collapse to a 2-step flow: *Who's your leader → Your details.*
4. **Automate:** upline resolution via the invite link (`?upline=`/`?ref=` is already supported — make link-based signup the *primary* path so the field is pre-filled and verified, and the user never types an ID). Auto-approve link-verified signups; reserve manual approval for cold signups only.
5. **Redesign completely:** invite-link-first onboarding. Leader shares a link → recruit lands pre-bound to that leader → one screen of details → **immediate** access to a guided "Day 0" training stub while any approval happens in the background. Never end signup on "wait for an admin."

### 2.2 Login (`LoginPage.tsx`)

**Why users get confused**
- **Two parallel sign-in mechanisms on one card:** a "Quick Access — Select role" dropdown (admin/leader/team) + "Continue," *and* an FBO-ID/password form. The role-picker dev login is gated by `auth_dev_login_enabled`, but it is rendered in the production component and is one config flag away from shipping a "log in as Admin" dropdown to end users. That is a security-grade UX hazard, not just clutter.
- FBO ID vs username ambiguity is pushed onto the user: *"If you used a username before, enter it in this field instead of FBO."* The app is asking the human to resolve its own identity-model debt.
- **"Forgot password?"** expands to *"Contact your leader or admin to reset your password."* There is no self-serve reset. Every forgotten password becomes a human support ticket and a blocked user.
- After a successful login, a **`TerminalBootOverlay`** ("hacker terminal boot" animation) plays before the dashboard, *then* a location-consent modal. Two interstitials between "I logged in" and "I can work."

1. **Confused because:** two login paths, identity ambiguity, no password recovery, and theatrical delays before value.
2. **Remove:** the dev role-picker from the production bundle entirely (move behind a build flag, not a runtime flag); the terminal-boot animation (it adds latency, nothing else).
3. **Merge:** one identity field that accepts FBO ID *or* legacy username transparently — resolve server-side, don't make the user choose.
4. **Automate:** real self-serve password reset (email/OTP). "Contact your leader" is not a recovery flow.
5. **Redesign completely:** single field + password + biometric/"remember me" for the returning mobile user (who is 95% of logins). Login should be one tap for a returning field rep, not a sequence of overlays.

---

## 3. Team-Member Workflow

### 3.1 Team Home (`TeamDashboardHomeModern.tsx`)

**Why users get confused**
- The **hero stat is "Min. FLP Billed"** — the most jargon-dense metric in the app — given the biggest, most prominent treatment, with a cryptic "{x}% from claimed" subline. A new rep has no idea what this means or whether it's good.
- **Layout bug that signals low polish:** the stats grid is `grid-cols-3` but renders only **two** children ("Today's leads," "Calls") — so there's a permanently empty third column. On a hard-coded `max-w-[430px]` container this is visible and looks broken.
- A card literally labeled **"Primary action"** — meta-labeling the UI instead of just showing the action. Users don't think "I'd like to perform my primary action;" they think "I want to call my leads."
- Heavy decorative gradient/grid/blur layering competes with the data for attention.
- Hard-coded `max-w-[430px]` means on a tablet or desktop the whole "modern" home is a lonely phone-width column floating in space.

1. **Confused because:** the loudest number is the least understood, the framing is abstract ("Primary action"), and there's a visible empty column.
2. **Remove:** the "Primary action" meta-label (just show the action with a verb); the empty grid column; one or two layers of decorative gradient.
3. **Merge:** "Today's leads," "Calls," "Min. FLP Billed" into one honest "Today" strip with plain labels (*Leads worked · Calls made · Enrollments*) and a single progress-to-goal bar.
4. **Automate:** surface the *next best action* with real data ("3 follow-ups due now → Start") instead of a static "Primary action" tile. Let the app decide what's primary based on the rep's actual queue.
5. **Redesign completely:** a single-question home — *"What should I do right now?"* — answered with one CTA and today's goal progress. Everything else (recent leads, XP, handed-off) is secondary scroll, not co-equal hero content.

### 3.2 Lead Pool (`LeadPoolWorkPage.tsx`) — where a rep "gets work"

**Why users get confused**
- This single screen fuses a **team member's "claim a lead" action with an admin import/console**: wallet balance, per-lead **pay-to-claim**, a "free pool" with its own batch count, batch-claim-by-count, CSV import, default-price inputs, test-lead tools — ~10 distinct interactive states in one view.
- The **mental model of paying (wallet ₹) to claim a lead** is enormous and is presented as just another button. There's no explanation of why a lead costs money, what you get, or what happens if it's a dud.
- "Pool" vs "Free pool" vs "Lead Flow" vs "Calling Board" — the rep cannot tell where to go to simply *start working*.

1. **Confused because:** a money-spending decision, an admin import tool, and a "start my day" queue are all stacked on one page with no hierarchy.
2. **Remove (from the team-member view):** CSV import, default-price inputs, and test-lead tooling — these are admin functions leaking into the rep surface. Gate them out of the team role entirely.
3. **Merge:** "Pool" and "Free pool" into one list with a clear "Free" vs "₹ N" tag per item. One claim flow, not two parallel ones.
4. **Automate:** auto-allocate a starter batch of free leads to new reps so the empty-wallet rep is never blocked from working on day one; pre-fill price from policy.
5. **Redesign completely:** split into (a) a dead-simple **"Claim leads"** card for reps (balance, "Claim N — ₹X," done) and (b) a separate **admin "Pool management"** console. A rep's first money decision deserves a confirmation that explains the value exchange, not a raw button among nine others.

### 3.3 Workboard (`WorkboardPage.tsx`) — the 1,700-line monster

**Why users get confused**
- One screen carries: batch slots (Morning/Afternoon/Evening "M/A/E" toggles), a **Day-1 pipeline**, a **Day-2 pipeline**, payment-proof upload with amount entry, status columns, search, and per-lead task lists. It is an entire application masquerading as a page.
- The **"M/A/E" toggles** and "Push to Day 2 →" encode a process (a multi-day onboarding cadence) that is *never explained* on the screen. The user is asked to operate a state machine they can't see.
- "Day 1 / Day 2," "batch slots," "Pre-Day 1 ✓" — heavy process jargon with no legend.

1. **Confused because:** an opaque multi-day state machine is exposed as raw toggles with no explanation of the cadence or what "Day 2" unlocks.
2. **Remove:** simultaneous Day-1 *and* Day-2 detail on one screen; the manual "Push to Day 2" button (it should be a consequence, not a chore).
3. **Merge:** the M/A/E batch toggles into a single "Today's touchpoints: 2/3 done" control with one tap to log the next one.
4. **Automate:** stage progression. When the three Day-1 touchpoints are complete, advance to Day 2 automatically (or with one confirm) — don't make the human be the workflow engine.
5. **Redesign completely:** a **guided, one-lead-at-a-time "do the next thing"** flow (call → log → schedule next) instead of a god-view board. The board view is a manager's tool; reps need a queue, not a spreadsheet.

---

## 4. Leader Workflow

### 4.1 Leader OS (`LeaderOSPage.tsx`)

**Why users get confused**
- The leader score is shown **three redundant ways at once**: a giant `42` number, a circular ring rendering "42%", and a tier label ("Strong/Average/At Risk"). Three encodings of one value is noise, and "score /100" shown as "%" conflates two different scales.
- The **account-lock consequence** — the single most important thing on the screen — is a small card *at the very bottom*, after the member table, in Hinglish, and only when a streak threshold is crossed. The scariest, most actionable information has the weakest placement.
- Four KPI tiles (Active Members, Calls, Activations, Today Billing) + two progress bars + a member table + up to four conditional alert banners = a dense wall with no clear "so what do I do."

1. **Confused because:** the headline number is triplicated, the consequences are buried and bilingual, and there's no single prioritized action.
2. **Remove:** two of the three score encodings (keep the number + tier; drop the redundant ring "%"); the decorative duplication.
3. **Merge:** the four KPI tiles + two progress bars into one "Team vs target today" panel — leaders care about the gap to goal, not six separate counters.
4. **Automate:** the alerts into actions. "2 members below call target" should carry a one-tap **"Send reminder"** / **"Reassign leads"** button inline (the copy literally says "send reminder or reassign leads" — but offers no button to do it).
5. **Redesign completely:** lead with **one prioritized action list** — "Who needs me right now and what do I press" — backed by the score. Put the account-lock risk *at the top* in plain language with a clear remedy, not at the bottom in Hinglish.

### 4.2 Leader/Admin Home (`DashboardHomePage.tsx`)

**Why users get confused**
- Four KPI cards where **two of them ("Converted," "New leads") link to the same `/work/leads`** destination — different labels, same place. "Active leads" links to Workboard, "Converted" links to leads. Inconsistent target mapping breaks the "a card is a doorway" expectation.
- The page is a long vertical stack: Leader-OS banner → 4 KPIs → **XP badge → XP leaderboard** → Quick actions → Recent leads. The gamification sits between the business metrics and the work, pushing "Recent leads" far below the fold.
- "Quick actions" duplicates destinations already in the sidebar *and* in the KPI cards *and* (on mobile) the tab bar — the same handful of links appear up to four times.

1. **Confused because:** cards with different names point to the same screen, and the real work is buried under gamification and redundant link clusters.
2. **Remove:** the XP block from the primary work dashboard (move to a profile/rewards area); duplicate "Quick actions" that just mirror the sidebar.
3. **Merge:** the "Converted" and "New leads" cards (same destination) into one funnel snapshot; unify all "go to leads" entry points.
4. **Automate:** make the KPI cards deep-link to the *filtered* view they describe (Converted → leads filtered to converted), so the number and the destination actually match.
5. **Redesign completely:** one above-the-fold answer to "is my team on track today, and what's the one thing to fix," then progressive detail. Not a scrollable museum of widgets.

---

## 5. Global Navigation Shell

### 5.1 Sidebar (`DashboardSidebar.tsx`) + Header (`DashboardHeader.tsx`) + Mobile tabs

**Why users get confused**
- 7 sections / up to 40 flat items, no search-over-nav, no recents, no favorites (covered in §1.1–1.2).
- The **global header** spends prime top-left real estate on an admin **"view as role"** dropdown (Admin/Leader/Team preview) — a power feature sitting in the most valuable pixels for *every* admin session, ahead of anything task-related.
- **Two settings entry points** that go to the same place: a gear icon *and* the avatar both link to `/dashboard/settings/profile`. Redundant targets, wasted header space.
- Header search is hard-scoped to "Search leads" only — so the obvious "I'll just search for the page I want" instinct fails silently.
- The mobile tab bar's drag-gesture novelty (covered in §1.6) actively fights the OS.

1. **Confused because:** there are too many destinations, no way to search to them, redundant entry points, and a header optimized for admin previewing rather than for getting work done.
2. **Remove:** one of the two settings entry points; the dev role-picker from login; the bespoke drag behavior on the mobile tab bar.
3. **Merge:** the 9 overlapping "Work" lead surfaces into **2–3** ("My queue," "Team board," "Pool") with filters replacing separate routes; collapse redundant header icons.
4. **Automate:** role- and usage-based nav — show a new rep only the ~5 things they need, reveal the rest progressively as they're used or as the role earns them. Make global search cover navigation, not just leads.
5. **Redesign completely:** adopt a strict **5–7 item** primary nav per role with a command-palette / search for the long tail. Mobile tab bar = 4 *standard, tappable* tabs + More, no gesture games. Move "view as role" into an admin-only menu, out of the global header.

---

## 6. Priority order (what to fix first)

Ranked by impact-to-effort, from the panel:

| # | Fix | Why it's #1-worthy | Primary lens |
|---|-----|--------------------|--------------|
| 1 | **Invite-link-first signup + kill the "wait for approval" dead end** | Largest measurable conversion leak; recruits drop at the door | Conversion / FTUE |
| 2 | **Collapse the 9 "Work" lead surfaces into 2–3 + filters** | Removes the deepest source of daily confusion for every role | Cognitive load / Nav |
| 3 | **Real mobile nav (4 tappable tabs + searchable More), drop the drag gesture** | Phone is the field rep's only device; today <25% of app is reachable | Mobile |
| 4 | **Plain-language pass + remove duplicate "Training" / unify mutating labels** | Cheap, instantly lifts comprehension for new users | FTUE / IA |
| 5 | **Self-serve password reset + single identity field** | Every forgotten password is currently a blocked user + support ticket | FTUE |
| 6 | **De-jargon + de-triplicate Leader OS; turn alerts into one-tap actions** | Leaders are the retention engine; make their daily action obvious | Leader workflow |
| 7 | **Pull XP/gamification out of the money dashboards** | Restores focus to revenue work; fixes tonal whiplash | Cognitive load |
| 8 | **Split Lead Pool (rep claim) from admin import/console** | Stops a money decision from sharing a screen with admin tooling | Team workflow |

---

## 7. Closing note from the panel

The engineering here is ambitious — role-aware routing, real-time data, a deep operational model. **That is exactly the problem.** The team has externalized its full internal complexity onto users who should never have to see it. The most valuable design work from here is **subtraction**: fewer destinations, fewer words, fewer decisions per screen, and *zero* dead ends in the first five minutes. Build for the brand-new recruit on a phone with one bar of signal who has never heard the word "FBO." If that person can claim a lead and make a call in under two minutes without asking a human, you've won.
