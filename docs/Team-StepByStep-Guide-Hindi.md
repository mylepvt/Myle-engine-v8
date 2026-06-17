# 📲 Myle App — Step by Step Guide (Aasaan Hindi)

> Yeh guide naye team members ke liye hai. Har cheez asli app ke button ke naam ke saath samjhayi gayi hai.

---

## 🧭 Pehle: Leads kahan milti hain?

App kholo → side/bottom menu se **"Leads" / "Work"** par jao.
Yahan har lead ek **card** ki tarah dikhti hai. Ek card me yeh sab hota hai:

```
┌─────────────────────────────────────────────┐
│  RAHUL SHARMA                  [👤 Assignee] │   ← Naam + kisko mila
│  98765-43210 · Mumbai                        │   ← Phone + City
│                                              │
│  [● Lead status ▾]   [📞 Call status ▾]      │   ← 2 dropdown
│                                              │
│  🕐 02:14:30          📞   💬   …   ⚙        │   ← Timer + buttons
│   remaining          Dial  WA  F/U  Reassign │
└─────────────────────────────────────────────┘
```

- **🕐 Timer (clock)** — lead pe kitna time bacha hai.
- **📞 Dial (green)** — call lagao + log karo.
- **💬 WhatsApp (green)** — WhatsApp chat kholo.
- **… (3 dots)** — Follow-up +24h (timer aage badhao).
- **⚙ Reassign** — sirf leader/admin ko dikhta hai.

---

## 1️⃣ Call kaise karein aur LOG kaise ho?

> Yaad rakho: System actual call count cross-check karta hai, isliye **har call log hona zaroori hai**.

**Steps:**

1. **Leads** page kholo.
2. Jis lead ko call karna hai uska **card** dhundo.
3. **Green 📞 (Dial) button** dabao.
   - Iska title hai: *"Dial — log + outcome"*.
   - Yeh phone dialer khol dega **aur** system call ko apne aap log kar lega. ✅
4. Call khatam hone ke baad card pe **📞 Call status** dropdown kholo aur sahi outcome chuno:

   | Option | Kab chuno |
   |--------|-----------|
   | **Called - No Answer** | Phone uthaya nahi |
   | **Called - Interested** | Interested hai |
   | **Called - Not Interested** | Mana kar diya |
   | **Called - Follow Up** | Baad me baat karni hai |
   | **Called - Busy** | Line busy thi |
   | **Call Back** | Usne wapas call karne ko kaha |

5. Agar lead aage badhi (jaise interested → video bhejna hai) to **● Lead status** dropdown se stage update karo.

✅ **Bas! Call log ho gayi.** Phone na bhi uthe tab bhi **Call status** zaroor set karo.

---

## 2️⃣ "Stale Lead" kya hai aur kaise bachayein?

**Stale lead = thandi/basi lead** jis pe kaafi time se koi action nahi hua.

👉 Har card pe ek **🕐 clock timer** hai:
- **Green/normal** = time hai, sab theek.
- **Red / "SLA" (overdue)** = time khatam, lead thandi pad rahi hai. ⚠️

Jab timer khatam hone wala hota hai, card neeche hint dikhata hai —
*"Find now: …"* ya *"Timer ending: …"* — jisse pata chalta hai lead ab kahan hai.

### Lead ko "garam" kaise rakhein?
Bas us pe **koi action** lo:
- 📞 Call karo (Dial), ya
- 💬 WhatsApp bhejo, ya
- **… (3 dots) "Follow-up +24h"** dabao → timer **24 ghante** aage badh jaata hai.

⚠️ **Agar 24 ghante tak koi action nahi hua → lead archive ho jaati hai** (list se hat jaati hai).

### Archive hui lead wapas kaise laaein?
- Page me neeche **"View archived leads"** link dabao.
- Lead dhundo → **Restore** karo → wapas aapki main list me aa jaayegi.

> Note: Archive = delete nahi. Restore se wapas aa jaati hai. Isliye ghabrao mat — bas time pe action lo.

---

## 3️⃣ Leader ko Update / Escalate kaise karein?

### 👉 Team member ke liye:
- Agar lead handle nahi ho rahi, ya koi dikkat hai (verification, payment proof) → apne **leader ko WhatsApp pe batao** ya app me unhe inform karo.
- **11:00 baje** verification escalations chalti hain — koi task pending ho to leader ko turant bolo taaki clear ho jaye.

### 👉 Leader ke liye (App ka WhatsApp number pe message bhejo):
Leader bas app ke WhatsApp number pe ye **words** bhej de, turant jawab aa jaata hai:

| Type karo | Kya milega |
|-----------|------------|
| `status` | Aaj kitni reports submit hui / kitni missing |
| `missing` | Kin members ne report nahi di (naam list) |
| `top` | Is hafte ke top performers |

### 👉 Leader ko auto-alerts (khud aate hain):
- Naya member approve hua
- Koi member remove hua / grace maanga
- **Raat ~10 baje daily team summary** (kis-kis ne report di, kisne nahi)

### 👉 Lead kisi aur ko dena (sirf leader/admin):
- Card pe **⚙ (Reassign) button** dabao → lead **top performer** ko transfer ho jaati hai.

---

## 🎯 3 Sabse Important Baatein

| # | Baat | Kya karo |
|---|------|----------|
| 1 | **Har call log karo** | Dial button + Call status set karo |
| 2 | **Lead garam rakho** | Timer khatam hone se pehle action/Follow-up +24h |
| 3 | **Report time pe** | Raat 11:59 se pehle daily report submit (+20 points) |

---

*Koi cheez samajh na aaye to leader se pucho — confusion me lead thandi mat hone do.* 😊
