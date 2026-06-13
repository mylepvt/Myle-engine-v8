# 📸 Guide ke Screenshots kaise banayein

Yeh repo me ek script hai jo **Step by Step Guide** ke saare screenshots
**automatically** bana deti hai — realistic mock leads ke saath (koi real
data ki zaroorat nahi).

## Chalane ka tareeka (laptop pe)

```bash
cd frontend
npm install
npx playwright install chromium     # sirf ek baar
VITE_API_URL= npm run build         # same-origin /api build
npm run capture:guide               # screenshots banao
```

Screenshots yahan ban jaayenge: **`frontend/guide-screenshots/`**

## Kaunsa screenshot kahan lagana hai

| File | WhatsApp guide marker | Kya dikhata hai |
|------|----------------------|-----------------|
| `ss-00-dashboard-home.png` | (bonus) | Dashboard / Mission home |
| `ss-01-leads-list.png` | PART A · SS 1 | Leads list (kai cards) |
| `ss-02-card-fresh.png` | PART A · SS 2-3 | Ek card — green timer + Dial button |
| `ss-06-card-overdue.png` | PART B · SS 6 | Red/overdue **stale** card |
| `ss-07-card-actions.png` | PART B · SS 7 | Follow-up (…) / WhatsApp / Reassign buttons |
| `ss-08-archived.png` | PART B · SS 8 | Archived leads + Restore |

> **Note:** Call status / Lead status dropdown _khula hua_ (SS 4, 5) browser
> screenshot me nahi aata — wo native (OS) dropdown hota hai. Card pe dropdown
> ki pill dikh jaati hai, ya phone se manually screenshot le lena.
>
> WhatsApp wale steps (SS 9, 10) ke liye real WhatsApp chat ka screenshot
> phone se lena — wo app ke andar ka screen nahi hai.

Mock data badalna ho to script ke top me `leadFresh / leadInterested /
leadStale / leadArchived` edit kar do.
