# 🎬 Naye member ke liye Tutorial Video kaise banayein

`frontend/scripts/record-tutorial-video.cjs` app ka ~4 minute ka tutorial
video **automatically** record karta hai — mock data ke saath (koi real lead /
member data nahi), phone-size screen pe, Hinglish captions aur highlight ke saath.

## Chalane ka tareeka (laptop pe)

```bash
cd frontend
npm install
npx playwright install chromium     # sirf ek baar
VITE_API_URL= npm run build         # same-origin /api build
npm run record:tutorial             # ffmpeg install hona chahiye
```

Video yahan banega: **`frontend/tutorial-video/myle-new-member-tutorial.mp4`**
(780×1688, H.264 — WhatsApp pe seedha bhej sakte ho).

## Video me kya hai

| Step | Screen |
|------|--------|
| 1 | Login |
| 2 | App install (Home Screen) + Notifications Allow |
| 3 | Home dashboard, points, neeche ka menu / ☰ menu |
| 4–5 | Calls: lead card, Dial, WhatsApp, Call status, Lead status |
| 6 | Timer / stale lead, Follow-up +24h, 24h me archive |
| 7 | Archived leads → Restore |
| 8 | Lead Pool |
| 9 | Training |
| 10 | Daily report (raat 11:59 se pehle) |
| 11 | Wallet + Leaderboard |
| — | 3 sabse important baatein |

Captions / steps badalne ho to script ke **Scenes** section (`record()`) me
text edit karo. Mock leads / numbers `installMocks()` me hain.
Video me awaaz (voice-over) nahi hai — sirf captions.
