"""Day 2 business-evaluation question bank (cheat-proof test).

Big pool (100+ Hinglish questions: business/mindset + MYLE-specific facts). Each
attempt draws a random locked subset, options are server-shuffled per session, and
``correct`` keys NEVER leave the server — scoring happens server-side only.

Question shape::

    {"id": int, "q": str, "options": {"A": str, "B": str, "C": str, "D": str}, "correct": "A"}

Test rules (locked):
  - QUESTIONS_PER_ATTEMPT = 30  (random subset from this pool)
  - PASS_MARK            = 24   (80 % — 24 of 30)
  - MAX_ATTEMPTS         = 1    (one shot, prospect's own phone via unique link)
  - TIME_LIMIT_SECONDS   = 1800 (30 min, server-enforced auto-submit)

Option lengths are balanced on purpose: the correct option is spread evenly across
longest / 2nd / 3rd / shortest, so "always pick the longest (or most complete-looking)
option" cannot pass. Keep it that way when editing — see
tests/test_day2_test_bank.py.

Anti-cheat is software-lockdown only: random subset, option shuffle, server timer,
one-question-at-a-time / no-back, tab-switch + copy/paste block & detect, server-side
scoring. The ``correct`` field is stripped before any payload reaches the client.
"""
from __future__ import annotations

QUESTIONS_PER_ATTEMPT: int = 30
PASS_MARK: int = 24
MAX_ATTEMPTS: int = 1
TIME_LIMIT_SECONDS: int = 1800

DAY2_TEST_QUESTIONS: list[dict] = [
    # ── Business concepts & mindset ──────────────────────────────────────────
    {
        "id": 1,
        "q": "Job income aur business income ka sabse bada structural fark kya hai?",
        "options": {
            "A": "Job mein time se income tied hai; business mein system se",
            "B": "Job mein growth fixed hai; business mein sirf luck se hoti hai",
            "C": "Job mein tax zyada lagta hai; business mein tax nahi lagta",
            "D": "Job mein kaam kam hota hai; business mein capital zyada lagta hai",
        },
        "correct": "A",
    },
    {
        "id": 2,
        "q": "Ek person 2,000 hours/year kaam karta hai. Agar woh 5-member team build kare, combined active hours hongi:",
        "options": {
            "A": "2,000",
            "B": "4,000",
            "C": "8,000",
            "D": "10,000",
        },
        "correct": "D",
    },
    {
        "id": 3,
        "q": "Traditional retail business mein startup ke waqt sabse bada unavoidable cost kya hota hai?",
        "options": {
            "A": "Digital marketing aur online ads ka monthly spend",
            "B": "Staff salary aur unki training ka kharcha",
            "C": "Capital — rent, inventory, aur setup cost",
            "D": "Accounting, billing aur software tools ka cost",
        },
        "correct": "C",
    },
    {
        "id": 4,
        "q": "Business mein 'compounding' ka sabse sahi practical example kya hoga?",
        "options": {
            "A": "Har saal salary mein ek fixed increment milte rehna",
            "B": "Team grow hoti hai — income time ke saath accelerate hoti hai",
            "C": "Har mahine target poora karne pe ek fixed bonus milna",
            "D": "Savings account mein har mahine thoda paisa jodte rehna",
        },
        "correct": "B",
    },
    {
        "id": 5,
        "q": "Agar kisi ne ₹15,000 mein skill seekhi aur 3 mahine mein ₹1,20,000 kamaaye, toh yeh tha:",
        "options": {
            "A": "High-ROI investment",
            "B": "Mehnga course tha — itna paisa skill pe nahi lagana chahiye",
            "C": "Sirf luck tha — har kisi ke saath aisa nahi hota",
            "D": "Short-term gain hai, long-term mein sustainable nahi",
        },
        "correct": "A",
    },
    {
        "id": 6,
        "q": "'Main pehle free mein seekhunga, phir join karunga' — yeh mindset kya indicate karti hai?",
        "options": {
            "A": "Smart aur frugal thinking — pehle paisa bachana",
            "B": "Practical financial planning ka sahi tareeka",
            "C": "Research-oriented approach jo risk kam karta hai",
            "D": "Low commitment aur clarity ki kami",
        },
        "correct": "D",
    },
    {
        "id": 7,
        "q": "Business mein 'system duplication' ka matlab kya hota hai?",
        "options": {
            "A": "Har kaam ka backup rakhna taaki data kabhi lose na ho",
            "B": "Ek hi product ko do alag market mein ek saath bechna",
            "C": "Proven process jo team bhi independently kare",
            "D": "Software aur apps se saare repetitive kaam automate karke time bachana",
        },
        "correct": "C",
    },
    {
        "id": 8,
        "q": "Ek naukripesh insaan ko 'financial freedom' milna mushkil kyun hoti hai?",
        "options": {
            "A": "Woh utni mehnat nahi karta jitni business owner karta hai",
            "B": "Income time se bound hai — active kaam band toh income band",
            "C": "Market hamesha unstable rehta hai isliye savings nahi banti",
            "D": "Salary ka bada hissa tax aur EMI mein chala jaata hai",
        },
        "correct": "B",
    },
    {
        "id": 9,
        "q": "Job mein income ceiling kyun hoti hai?",
        "options": {
            "A": "Company structure mein raise limited hote hain",
            "B": "Government ne har industry mein salary ki upper limit fix ki hai",
            "C": "Employees khud extra effort nahi karte isliye unki salary kabhi nahi badhti",
            "D": "Market slow rehne se companies salary badhana band kar deti hain",
        },
        "correct": "A",
    },
    {
        "id": 10,
        "q": "Investment aur expense mein fundamental fark kya hai?",
        "options": {
            "A": "Investment amount mein bada hota hai, expense hamesha chhota hota hai",
            "B": "Investment sirf bank ya share market mein hi ki ja sakti hai",
            "C": "Investment future mein return create karta hai; expense consume hota hai",
            "D": "Dono consume hote hain — fark sirf tax treatment mein hota hai",
        },
        "correct": "C",
    },
    {
        "id": 11,
        "q": "Kisi ne opportunity samjhi, sab explain kiya, phir bhi decision delay kar diya 'sochne ke liye' — yeh kya indicate karta hai?",
        "options": {
            "A": "Wise aur careful decision-making",
            "B": "Fear ya clarity ki kami",
            "C": "Deep research kar raha hai",
            "D": "Financially strong hai, isliye use koi jaldi nahi hai — aaraam se decide karega",
        },
        "correct": "B",
    },
    {
        "id": 12,
        "q": "Network business mein 'leverage' practically kis form mein kaam karta hai?",
        "options": {
            "A": "Bank loan lekar business ko tez grow karna",
            "B": "Paid advertisements se zyada leads lana",
            "C": "Social media followers aur reach badhana",
            "D": "Team members ki combined effort aur time",
        },
        "correct": "D",
    },
    {
        "id": 13,
        "q": "60 saal ki age mein job se retire hone ke baad main financial challenge kya hogi?",
        "options": {
            "A": "Active income band ho jaayegi — savings pe hi depend rehna padega",
            "B": "Pension par sarkar extra tax laga degi jo bachat kha jaayega",
            "C": "Ghar aur property ki value retirement ke baad gir jaayegi",
            "D": "Us waqt market crash hone se saari savings doob jaayegi",
        },
        "correct": "A",
    },
    {
        "id": 14,
        "q": "Bina proper training ke business start karne ka primary risk kya hota hai?",
        "options": {
            "A": "Zyada capital lagega kyunki galtiyon ka kharcha badhta hai",
            "B": "Government license aur registration milne mein dikkat hogi",
            "C": "Weak foundation aur galat actions",
            "D": "Market mein competition bahut zyada hoga aur shuruaat mein customer nahi milenge",
        },
        "correct": "C",
    },
    {
        "id": 15,
        "q": "MYLE mein learning phase kyun zaroori hai consistent success ke liye?",
        "options": {
            "A": "Certificate ke liye yeh company ki ek legal requirement hai",
            "B": "Bina samjhe system replicate nahi hota — duplication tabhi hogi",
            "C": "Naye logon ko busy rakhne ke liye ek structure diya gaya hai",
            "D": "Training ki fees aur coaching ka kharcha recover karne ke liye",
        },
        "correct": "B",
    },
    {
        "id": 16,
        "q": "'Mujhe pehle results dikhao, phir join karunga' — yeh response kya indicate karta hai?",
        "options": {
            "A": "Smart due diligence kar raha hai, jo sahi approach hai",
            "B": "Financial maturity dikha raha hai, jo achhi baat hai",
            "C": "Strong research skills hain aur data pe decide karta hai",
            "D": "Clarity nahi hai ya fear-based hesitation hai",
        },
        "correct": "D",
    },
    {
        "id": 17,
        "q": "Passive income develop hone ki primary condition kya hoti hai?",
        "options": {
            "A": "Team aur system bina aapke chalte rahein",
            "B": "Bank balance ₹10 lakh se upar ho jaaye aur interest aaye",
            "C": "Company stock market mein list ho aur dividend milne lage",
            "D": "Kam se kam 5 saal regular job karke savings ban jaaye",
        },
        "correct": "A",
    },
    {
        "id": 18,
        "q": "'Calculated risk' aur 'blind risk' mein core difference kya hai?",
        "options": {
            "A": "Calculated risk mein hamesha zyada paisa lagaya jaata hai",
            "B": "Blind risk mein result ki guarantee hoti hai, calculated mein nahi",
            "C": "Calculated risk mein information aur clarity ke baad decision hota hai",
            "D": "Dono same hain — risk toh risk hi hota hai, naam alag hai",
        },
        "correct": "C",
    },
    {
        "id": 19,
        "q": "'Main abhi ready nahi hoon' — yeh statement usually kya represent karta hai?",
        "options": {
            "A": "Practical preparation abhi chal rahi hai",
            "B": "Fear-based avoidance ya clarity ki kami",
            "C": "Genuine skill gap hai jo pehle bharna hai",
            "D": "Thoughtful financial planning ho rahi hai",
        },
        "correct": "B",
    },
    {
        "id": 20,
        "q": "Business successfully build karne ke liye sabse pehla step kya hona chahiye?",
        "options": {
            "A": "Social media accounts banana aur followers badhana",
            "B": "Logo aur branding design karwa lena pehle",
            "C": "Bina seekhe seedha selling start kar dena",
            "D": "System aur foundation samajhna",
        },
        "correct": "D",
    },
    {
        "id": 31,
        "q": "Apne aap mein invest karna (skill seekhna) sabse zyada return kab deta hai?",
        "options": {
            "A": "Jab seekhi hui skill ko action mein lagaya jaaye",
            "B": "Jab certificate frame karwa ke deewar pe lagaya jaaye",
            "C": "Jab har lesson ke detailed notes bana liye jaayein",
            "D": "Jab dusron ko sikha diya jaaye bina khud kiye",
        },
        "correct": "A",
    },
    {
        "id": 32,
        "q": "'Time freedom' ka business context mein sahi matlab kya hai?",
        "options": {
            "A": "Bilkul kaam na karna aur poora din aaram karna",
            "B": "Income aapke time se tied na rahe",
            "C": "Har weekend aur festival pe pakki chhutti milna",
            "D": "Office ka koi fixed time na hona, jab mann kare tab jaana aur late aana allowed",
        },
        "correct": "B",
    },
    {
        "id": 33,
        "q": "Consistency successful business build karne mein kyun matter karti hai?",
        "options": {
            "A": "Kyunki ek baar ka bada effort lifetime ka result de deta hai",
            "B": "Kyunki small repeated actions compound hokar bade result banate hain",
            "C": "Kyunki consistent rehne se luck apne aap saath dene lagta hai",
            "D": "Kyunki company consistency dekh ke hi monthly payment karti hai",
        },
        "correct": "B",
    },
    {
        "id": 34,
        "q": "Mentor ya upline ka primary role kya hota hai?",
        "options": {
            "A": "Aapke liye prospecting aur selling ka kaam khud karna",
            "B": "Proven path guide karna taaki galtiyan kam ho",
            "C": "Shuruaat mein zaroorat pade to paisa udhaar dena",
            "D": "Aapki jagah business ke saare decisions lena",
        },
        "correct": "B",
    },
    {
        "id": 35,
        "q": "'Rejection' ko successful business builder kaise treat karta hai?",
        "options": {
            "A": "Personal insult samajh ke us prospect se rishta tod deta hai aur aage nahi badhta",
            "B": "Process ka normal part",
            "C": "Proof maanta hai ki yeh business model kaam nahi karta",
            "D": "Sign maanta hai ki product ya price mein hi kami hai",
        },
        "correct": "B",
    },
    {
        "id": 36,
        "q": "Active income aur passive income ko ek line mein kaise distinguish karein?",
        "options": {
            "A": "Active = kaam karo tabhi paisa; Passive = system se paisa aata rahe",
            "B": "Active income hamesha chhoti hoti hai, passive hamesha badi",
            "C": "Active salary se aati hai, passive sirf property ke rent se",
            "D": "Dono mein koi practical fark nahi, bas naam alag hai",
        },
        "correct": "A",
    },
    {
        "id": 37,
        "q": "Duplication ke bina team-based business scale kyun nahi hota?",
        "options": {
            "A": "Kyunki ek akela insaan limited hours hi de sakta hai",
            "B": "Kyunki company ek limit ke baad naye members allow nahi karti",
            "C": "Kyunki market mein product ki demand khatam ho jaati hai",
            "D": "Kyunki team badhne par tax aur kharche zyada lag jaate hain",
        },
        "correct": "A",
    },
    {
        "id": 38,
        "q": "Long-term vision wale builder ka short-term mein behaviour kaisa hota hai?",
        "options": {
            "A": "Turant bade result na milne pe doosri opportunity dhoondta hai",
            "B": "Foundation pe focus, result late bhi chale",
            "C": "Sirf easy customers dhoondta hai jo jaldi haan bol dein",
            "D": "Har roz nayi strategy try karta hai taaki jaldi result aaye",
        },
        "correct": "B",
    },
    {
        "id": 39,
        "q": "'Comfort zone' business growth ke liye problem kyun hai?",
        "options": {
            "A": "Growth ke naye actions wahan nahi hote",
            "B": "Comfort zone mein rehne se company penalty laga deti hai",
            "C": "Comfort zone mein bina wajah zyada paisa kharch hota hai",
            "D": "Comfort zone se sirf health aur fitness kharab hoti hai, business pe koi asar nahi",
        },
        "correct": "A",
    },
    {
        "id": 40,
        "q": "Personal development (books, training) business mein kyun emphasize hota hai?",
        "options": {
            "A": "Business aapki personal growth se zyada nahi badh sakta",
            "B": "Free time ko productive tareeke se pass karne ke liye",
            "C": "Certificate aur achievements profile pe dikhane ke liye",
            "D": "Kyunki company ko apni books aur courses bechne hote hain",
        },
        "correct": "A",
    },
    {
        "id": 41,
        "q": "Goal-setting ka practical fayda kya hota hai?",
        "options": {
            "A": "Direction aur measurable target deta hai — random effort nahi rehta",
            "B": "Goal likh dene se result apne aap aane lagta hai, kaam ke bina",
            "C": "Goal sirf motivation ke liye hota hai, planning ke liye nahi",
            "D": "Goal se dusron ko impress karna aasaan ho jaata hai",
        },
        "correct": "A",
    },
    {
        "id": 42,
        "q": "Ek prospect 'paise nahi hain' bolta hai par mehngi cheezein use karta hai — yeh aksar kya indicate karta hai?",
        "options": {
            "A": "Genuine financial crisis jo abhi chal raha hai",
            "B": "Priority/value ka issue, paise ka nahi",
            "C": "Woh business ke liye bilkul perfect candidate hai",
            "D": "Use pehle loan ya EMI ki zaroorat hai",
        },
        "correct": "B",
    },
    {
        "id": 43,
        "q": "'Network' ka business value kya hai?",
        "options": {
            "A": "Relationships se opportunities multiply hoti hain",
            "B": "Phone mein kitne contacts save hain, bas wahi ginti",
            "C": "Social media pe likes aur followers ki total sankhya",
            "D": "Network sirf personal life ke liye hai, business ke liye nahi",
        },
        "correct": "A",
    },
    {
        "id": 44,
        "q": "Daily routine (DMO - Daily Method of Operation) ka kya purpose hai?",
        "options": {
            "A": "Productive actions ko daily consistent banana",
            "B": "Din bhar ka time table banake har ghante report karna",
            "C": "Sirf daily attendance aur login mark karna",
            "D": "Company ko roz ki activity report bhejna",
        },
        "correct": "A",
    },
    {
        "id": 45,
        "q": "Successful builder apna time kis activity ko sabse zyada deta hai?",
        "options": {
            "A": "Income-producing activities (prospecting, follow-up, team building)",
            "B": "Social media pe content dekhna aur trends follow karna",
            "C": "Meetings plan karna aur unke baare mein sochte rehna",
            "D": "Logo, visiting card aur branding ko perfect banana",
        },
        "correct": "A",
    },
    {
        "id": 46,
        "q": "'Belief' (vishwaas) sales aur business mein kyun important hai?",
        "options": {
            "A": "Khud belief ho tabhi conviction se baat hoti hai",
            "B": "Belief se zyada sirf script yaad karna zaroori hai",
            "C": "Belief sirf personal life ka hissa hai, kaam ka nahi",
            "D": "Prospect ka belief chahiye, apna belief zaroori nahi",
        },
        "correct": "A",
    },
    {
        "id": 47,
        "q": "Follow-up sales process mein kyun critical hai?",
        "options": {
            "A": "Zyada tar decisions pehli baat mein nahi hote",
            "B": "Follow-up se customer hamesha irritate hokar mana kar deta hai",
            "C": "Pehli baat mein na bole to dobara baat nahi karni chahiye",
            "D": "Follow-up sirf company ke records ke liye kiya jaata hai",
        },
        "correct": "A",
    },
    {
        "id": 48,
        "q": "Apni income badhane ka sabse sustainable tareeka kya hai?",
        "options": {
            "A": "Value/skill badhao + duplication",
            "B": "Har din zyada ghante akele kaam karte raho, bina kisi system ya team ke",
            "C": "Logon se udhaar lekar naya kaam shuru karo",
            "D": "Ek bada lucky break aane ka intezaar karo",
        },
        "correct": "A",
    },
    {
        "id": 49,
        "q": "Ek system-based business naye person ke liye easy kyun hota hai?",
        "options": {
            "A": "Proven steps already bane hote hain — invent karne ki zaroorat nahi",
            "B": "Kyunki system mein kuch karna hi nahi padta, sab automatic hai",
            "C": "Kyunki system join karte hi paisa turant aana shuru hota hai",
            "D": "Kyunki system-based business mein koi competition nahi hoti",
        },
        "correct": "A",
    },
    {
        "id": 50,
        "q": "'Main akela hi sab kar lunga, team ki zaroorat nahi' — yeh soch scaling ke liye kyun galat hai?",
        "options": {
            "A": "Ek insaan ke time ki limit hoti hai",
            "B": "Akela kaam karne par company commission dena band kar deti hai",
            "C": "Akele kaam karne se product ka stock jaldi khatam ho jaata hai",
            "D": "Yeh soch bilkul sahi hai — team banane se sirf jhagde aur problems badhti hain",
        },
        "correct": "A",
    },
    {
        "id": 51,
        "q": "Attitude aur skill mein se long-term success ke liye zyada important kya maana jaata hai?",
        "options": {
            "A": "Attitude — skill seekhi ja sakti hai, attitude foundation hai",
            "B": "Skill — attitude ka business result pe koi asar nahi hota",
            "C": "Dono barabar, aur dono janam se hi aate hain",
            "D": "Na skill na attitude — sirf sahi time aur luck",
        },
        "correct": "A",
    },
    {
        "id": 52,
        "q": "Prospect ko opportunity dikhane ka best approach kya hai?",
        "options": {
            "A": "Thoda pressure dalo taaki woh usi din decide kare",
            "B": "Samjhao, value dikhao, decision unka",
            "C": "Result ko thoda badha-chadha ke batao taaki interest aaye",
            "D": "Pehle join karwa lo, details baad mein samjha dena",
        },
        "correct": "B",
    },
    {
        "id": 53,
        "q": "Ek opportunity 'sabke liye' kyun nahi hoti?",
        "options": {
            "A": "Sabki readiness aur priority alag hoti hai",
            "B": "Kyunki har city mein seats hamesha limited hoti hain aur jaldi bhar jaati hain",
            "C": "Kyunki product sabke budget mein nahi aa sakta",
            "D": "Kyunki company sirf graduates ko join karne deti hai",
        },
        "correct": "A",
    },
    {
        "id": 54,
        "q": "Income aur worth (value) ka relation kya hai?",
        "options": {
            "A": "Market ko jitni value doge, income usi proportion mein aayegi",
            "B": "Income sirf degree aur experience ke saal se tay hoti hai",
            "C": "Value dene se income ghatti hai kyunki sabko free chahiye",
            "D": "Income sirf umar aur seniority pe depend karti hai",
        },
        "correct": "A",
    },
    {
        "id": 55,
        "q": "'Big result' chahne wale ko process ke baare mein kya samajhna chahiye?",
        "options": {
            "A": "Chhote consistent steps ka compounded result",
            "B": "Bada result ek bade decision se ek hi din mein milta hai, process se nahi",
            "C": "Process matter nahi karta, sahi time pe sahi jagah hona chahiye",
            "D": "Bada result tabhi aata hai jab shuru mein bada paisa lagao",
        },
        "correct": "A",
    },
    {
        "id": 56,
        "q": "Ek leader apni team ki growth kaise drive karta hai?",
        "options": {
            "A": "Example set karke aur unhe duplicate karna sikha ke",
            "B": "Sirf targets aur orders deke, khud field mein na jaake",
            "C": "Team members ke saath compete karke unse aage reh ke",
            "D": "Important information apne paas rakh ke control banake",
        },
        "correct": "A",
    },
    {
        "id": 57,
        "q": "'Excuses' aur 'results' ka relation successful logon mein kaisa hota hai?",
        "options": {
            "A": "Zyada excuses = kam results",
            "B": "Excuses se pressure kam hota hai aur results badhte hain",
            "C": "Excuses aur results ka aapas mein koi relation nahi hai",
            "D": "Results ke liye kuch excuses zaroori hain, warna burnout hota hai",
        },
        "correct": "A",
    },
    {
        "id": 58,
        "q": "Learning ke baad 'implementation' kyun zaroori hai?",
        "options": {
            "A": "Bina action knowledge bekaar hai",
            "B": "Implementation optional hai, pehle saal bhar seekhna zaroori hai",
            "C": "Sirf seekhna hi kaafi hai, income apne aap aa jaati hai",
            "D": "Implementation se confusion badhta hai, isliye ruk ke karo",
        },
        "correct": "A",
    },
    {
        "id": 59,
        "q": "Ek prospect baar-baar 'kal batata hoon' bolta hai — best handling kya hai?",
        "options": {
            "A": "Clear, specific follow-up time fix karo aur value reinforce karo",
            "B": "Use list se hata do — jo kal bole woh kabhi nahi aata",
            "C": "Din mein kai baar call karke yaad dilaate raho",
            "D": "Bolo ki offer aaj raat khatam ho raha hai, chahe na ho",
        },
        "correct": "A",
    },
    {
        "id": 60,
        "q": "Self-discipline business mein boss/manager ki jagah kyun leti hai?",
        "options": {
            "A": "Khud ko drive karna padta hai, koi boss nahi",
            "B": "Business mein discipline ki zaroorat nahi, freedom hoti hai",
            "C": "Company har member ko ek personal manager deti hai jo roz kaam track karta hai",
            "D": "Discipline sirf job mein chahiye kyunki wahan boss hota hai",
        },
        "correct": "A",
    },
    {
        "id": 61,
        "q": "Ek skill ek baar seekh kar baar-baar use karna kis concept ko represent karta hai?",
        "options": {
            "A": "Leverage / asset creation",
            "B": "Liability / recurring cost",
            "C": "Expense / one-time spend",
            "D": "Depreciation / value loss",
        },
        "correct": "A",
    },
    {
        "id": 62,
        "q": "'Average' result se 'exceptional' result kaise banta hai?",
        "options": {
            "A": "Thoda extra consistent effort daily, jo time ke saath compound hota hai",
            "B": "Ek bada lucky break jo sahi time pe mil jaaye",
            "C": "Shuru mein hi bahut bada paisa invest karne se",
            "D": "Talent se — jo exceptional hai woh janam se hota hai",
        },
        "correct": "A",
    },
    {
        "id": 63,
        "q": "Customer/prospect ke 'objection' ko sahi mindset se kaise dekha jaata hai?",
        "options": {
            "A": "Interest + missing clarity; samjhane ka mauka",
            "B": "Objection = pakka 'no', aage baat karna bekaar hai",
            "C": "Objection = prospect insult kar raha hai, ignore karo",
            "D": "Objection = product mein kami hai, isliye turant doosra product dikhana chahiye",
        },
        "correct": "A",
    },
    {
        "id": 64,
        "q": "Apne 'why' (reason/goal) ko strong rakhna kyun zaroori hai?",
        "options": {
            "A": "Strong why mushkil time mein motivation aur consistency deta hai",
            "B": "Why sirf presentation mein bolne ke liye hota hai",
            "C": "Why sirf shuruaat mein chahiye, baad mein zaroorat nahi",
            "D": "Why se zyada important sirf skill hoti hai, why nahi",
        },
        "correct": "A",
    },
    {
        "id": 65,
        "q": "Ek business builder 'busy' aur 'productive' mein kaise fark karta hai?",
        "options": {
            "A": "Busy = activity; productive = result",
            "B": "Busy aur productive dono ek hi cheez ke do naam hain",
            "C": "Jitna zyada busy, utna zyada productive — hamesha, chahe result aaye ya na aaye",
            "D": "Productive matlab kam kaam, busy matlab zyada kaam",
        },
        "correct": "A",
    },
    {
        "id": 66,
        "q": "Team mein ek naya member fail kyun ho jaata hai aksar?",
        "options": {
            "A": "Proven system follow nahi karta ya jaldi quit kar deta hai",
            "B": "System sirf purane members ke liye kaam karta hai",
            "C": "Company naye members ko leads aur support nahi deti",
            "D": "Naye member ki city mein market already saturated hota hai",
        },
        "correct": "A",
    },
    {
        "id": 67,
        "q": "'Income goal' set karne ka sahi tareeka kya hai?",
        "options": {
            "A": "Number + deadline + actions",
            "B": "Bas 'bahut paisa kamana hai' soch lo, number aur plan ki zaroorat nahi, ho jaayega",
            "C": "Goal mat rakho, jitna aaye utna theek hai",
            "D": "Upline ka goal copy kar lo bina apna plan banaye",
        },
        "correct": "A",
    },
    {
        "id": 68,
        "q": "Skill development aur income growth ka relation kaisa hota hai?",
        "options": {
            "A": "Skill badhne ke saath aapki income capacity badhti hai",
            "B": "Skill badhne se income ghatti hai kyunki demand kam hoti hai",
            "C": "Skill aur income ka aapas mein koi relation nahi hai",
            "D": "Income sirf time aur seniority se badhti hai, skill se nahi",
        },
        "correct": "A",
    },
    {
        "id": 69,
        "q": "Ek opportunity ko evaluate karne ka sabse practical tareeka kya hai?",
        "options": {
            "A": "System, support, aur potential ROI ko samajhna — emotion ke bajaye",
            "B": "Doston aur rishtedaaron se poochna, chahe unhe pata na ho",
            "C": "Online random reviews padh ke turant decide karna",
            "D": "Agar thoda bhi doubt ho to bina samjhe mana kar dena",
        },
        "correct": "A",
    },
    {
        "id": 70,
        "q": "'Main koshish karunga' aur 'main karunga' mein commitment ka fark kya hai?",
        "options": {
            "A": "'Karunga' = decision; 'koshish' = exit khula",
            "B": "Dono same hain, bas bolne ka tareeka alag hai",
            "C": "'Koshish' zyada strong commitment hai kyunki usme humility aur realistic soch hai",
            "D": "Commitment ke shabd ka result pe koi asar nahi padta",
        },
        "correct": "A",
    },
    {
        "id": 71,
        "q": "Ek prospect jo har cheez ko 'scam' bolta hai — uske peeche aksar kya hota hai?",
        "options": {
            "A": "Past experience ya knowledge gap se bana fear/bias",
            "B": "Woh hamesha 100% sahi hota hai, uski baat maan lo",
            "C": "Woh business expert hai jo sab pehle se jaanta hai, isliye uski baat sahi hai",
            "D": "Use opportunity poori tarah samajh aa gayi hai",
        },
        "correct": "A",
    },
    {
        "id": 72,
        "q": "Apne team members ko motivate rakhne ka best long-term tareeka kya hai?",
        "options": {
            "A": "Unki growth, recognition aur unke 'why' pe focus karna",
            "B": "Sirf bade paise ke sapne dikhana, chahe sach na ho",
            "C": "Target miss hone par daant ke aur dara ke",
            "D": "Unhe akela chhod dena taaki khud seekhein",
        },
        "correct": "A",
    },
    {
        "id": 73,
        "q": "'Time' sabse valuable resource kyun maana jaata hai?",
        "options": {
            "A": "Time wapas nahi aata aur sabke paas limited hai",
            "B": "Kyunki time se hi salary aur bonus calculate hota hai",
            "C": "Kyunki time paise se aasaani se kharida ja sakta hai",
            "D": "Kyunki ameer logon ke paas hamesha zyada time hota hai",
        },
        "correct": "A",
    },
    {
        "id": 74,
        "q": "Ek beginner ko sabse pehle kis cheez pe focus karna chahiye?",
        "options": {
            "A": "Basics seekhna aur proven system follow karna",
            "B": "Pehle din se advanced strategies aur shortcuts seekhna",
            "C": "Apna khud ka naya system invent karna",
            "D": "Result na aaye to turant doosra plan try karna",
        },
        "correct": "A",
    },
    {
        "id": 75,
        "q": "'Financial education' job-holder ke liye kyun zaroori hai?",
        "options": {
            "A": "Paisa kaise kaam karta hai samajhke better decisions le paaye",
            "B": "Sirf tax bachane ke tareeke jaanne ke liye",
            "C": "Financial education se sirf confusion badhta hai",
            "D": "Salary fixed hai to financial education ka koi practical fayda nahi hota job mein",
        },
        "correct": "A",
    },
    {
        "id": 76,
        "q": "Ek mehnti par directionless insaan vs ek focused insaan — fark kya banata hai?",
        "options": {
            "A": "Direction — right actions sahi jagah lagana result deta hai",
            "B": "Mehnat akeli hamesha result deti hai chahe direction kuch bhi ho",
            "C": "Dono ka result same hota hai, bas time alag lagta hai",
            "D": "Kismat — dono mein se jiska luck achha ho",
        },
        "correct": "A",
    },
    {
        "id": 77,
        "q": "Apni progress ko track karna kyun important hai?",
        "options": {
            "A": "Pata chalta hai kya kaam kar raha hai aur kahan improve karna hai",
            "B": "Tracking time waste hai — jo kaam karta hai woh bina gine bhi aage badhta hai",
            "C": "Tracking se motivation girti hai isliye mat karo",
            "D": "Tracking sirf company ke records ke liye useful hai",
        },
        "correct": "A",
    },
    {
        "id": 78,
        "q": "'Duplication' tabhi kaam karti hai jab system kaisa ho?",
        "options": {
            "A": "Simple, repeatable aur sikhane mein aasaan",
            "B": "Bahut detailed aur har member ke liye alag customised",
            "C": "Secret ho taaki sirf top leaders ko pata ho",
            "D": "Sirf experienced log hi chala sakein",
        },
        "correct": "A",
    },
    {
        "id": 79,
        "q": "Ek prospect ko 'product' se pehle kya bechna zaroori hota hai?",
        "options": {
            "A": "Vision aur uska apna future benefit",
            "B": "Sirf price discount aur limited-time offer",
            "C": "Darr ki agar abhi join nahi kiya to sab chhoot jaayega aur mauka kabhi nahi milega",
            "D": "Company ka naam aur uski badi buildings",
        },
        "correct": "A",
    },
    {
        "id": 80,
        "q": "Successful log 'problems' ko kaise dekhte hain?",
        "options": {
            "A": "Solve karne layak challenges jo growth dete hain",
            "B": "Quit karne ka clear signal ki yeh kaam mere liye nahi",
            "C": "Dusron ki galti jiska blame unpe daalna chahiye",
            "D": "Permanent dead-end jahan se aage raasta nahi",
        },
        "correct": "A",
    },

    # ── MYLE-specific factual questions ──────────────────────────────────────
    {
        "id": 21,
        "q": "FBO ka full form kya hai?",
        "options": {
            "A": "Forever Business Owner",
            "B": "Franchise Business Owner",
            "C": "Fixed Business Operator",
            "D": "Fast Bonus Owner",
        },
        "correct": "A",
    },
    {
        "id": 22,
        "q": "Is system mein 'CC' ka matlab kya hai?",
        "options": {
            "A": "Cash Credit / Commission Count",
            "B": "Confirmed Customer / Course Credit",
            "C": "Company Commission / Client Code count",
            "D": "Customer Count / Contact Card",
        },
        "correct": "B",
    },
    {
        "id": 23,
        "q": "Assistant Supervisor level ke liye kitne CC required hain?",
        "options": {
            "A": "1 CC",
            "B": "2 CC",
            "C": "5 CC",
            "D": "3 CC",
        },
        "correct": "B",
    },
    {
        "id": 24,
        "q": "Supervisor level ke liye kitne CC required hain?",
        "options": {
            "A": "10 CC",
            "B": "15 CC",
            "C": "25 CC",
            "D": "50 CC",
        },
        "correct": "C",
    },
    {
        "id": 25,
        "q": "Assistant Manager level ke liye kitne CC required hain?",
        "options": {
            "A": "75 CC",
            "B": "50 CC",
            "C": "100 CC",
            "D": "60 CC",
        },
        "correct": "A",
    },
    {
        "id": 26,
        "q": "Manager level ke liye kitne CC required hain?",
        "options": {
            "A": "75 CC",
            "B": "100 CC",
            "C": "120 CC",
            "D": "150 CC",
        },
        "correct": "C",
    },
    {
        "id": 27,
        "q": "Assistant Supervisor level pe joining bonus kitna hota hai?",
        "options": {
            "A": "25%",
            "B": "20%",
            "C": "30%",
            "D": "15%",
        },
        "correct": "A",
    },
    {
        "id": 28,
        "q": "Supervisor level pe discount/bonus kitna hota hai?",
        "options": {
            "A": "25%",
            "B": "30%",
            "C": "38%",
            "D": "33%",
        },
        "correct": "D",
    },
    {
        "id": 29,
        "q": "Manager level pe joining bonus kitna hota hai?",
        "options": {
            "A": "38%",
            "B": "43%",
            "C": "48%",
            "D": "33%",
        },
        "correct": "B",
    },
    {
        "id": 30,
        "q": "Ek structured business system mein income kitne types ki hoti hai?",
        "options": {
            "A": "Sirf 1 (direct product margin)",
            "B": "2 (sales + joining fee)",
            "C": "Fixed 3 (direct, team aur leadership — har level pe same)",
            "D": "Multiple (layered structured system)",
        },
        "correct": "D",
    },
    {
        "id": 81,
        "q": "MYLE ka business model primary roop se kis cheez par based hai?",
        "options": {
            "A": "Skill development + system duplication se income build karna",
            "B": "Product khareed ke apne istemaal ke liye stock rakhna",
            "C": "Ek baar paisa invest karke monthly return ka intezaar karna",
            "D": "Sirf apni personal sales se commission kamana",
        },
        "correct": "A",
    },
    {
        "id": 82,
        "q": "Naya FBO join hone ke baad sabse pehla recommended step kya hota hai?",
        "options": {
            "A": "Proper training/learning complete karna",
            "B": "Seedha bina seekhe apne contacts ko sell karna",
            "C": "Pehle din se apni team se compete karna",
            "D": "Kuch din ruk ke dekhna ki dusre kya karte hain",
        },
        "correct": "A",
    },
    {
        "id": 83,
        "q": "MYLE system mein upline/mentor aapki kaise madad karta hai?",
        "options": {
            "A": "Guidance, training aur proven path provide karke",
            "B": "Aapka prospecting, follow-up aur selling ka saara kaam khud karke dete hain",
            "C": "Shuruaat mein aapko paisa ya stock deke",
            "D": "Sirf monthly meeting mein target batake",
        },
        "correct": "A",
    },
    {
        "id": 84,
        "q": "CC (Confirmed Customer) badhne ka aapke level/rank pe kya asar hota hai?",
        "options": {
            "A": "Zyada CC = higher level + higher bonus",
            "B": "CC ka level se koi relation nahi, level time se badhta hai",
            "C": "Zyada CC se level girta hai kyunki target badh jaata hai",
            "D": "CC sirf report ke liye hai, rank pe asar nahi",
        },
        "correct": "A",
    },
    {
        "id": 85,
        "q": "Joining bonus % level badhne ke saath kaise change hota hai?",
        "options": {
            "A": "Higher level pe higher bonus % milta hai",
            "B": "Higher level pe bonus % ghat jaata hai kyunki team badi hoti hai",
            "C": "Bonus % sabhi levels pe same rehta hai",
            "D": "Bonus % har mahine company decide karti hai",
        },
        "correct": "A",
    },
    {
        "id": 86,
        "q": "MYLE mein 'team building' ka income pe kya effect hota hai?",
        "options": {
            "A": "Team ka combined effort leverage banata hai — income scale hoti hai",
            "B": "Team badhne se income bant jaati hai aur ghatti hai",
            "C": "Team building optional hai, income sirf apni sales se",
            "D": "Team sirf company ki sales badhati hai, aapki income nahi",
        },
        "correct": "A",
    },
    {
        "id": 87,
        "q": "Assistant Supervisor (2 CC) se Supervisor (25 CC) tak pahunchne ka matlab kya hai?",
        "options": {
            "A": "Zyada CC + bada bonus % + higher rank",
            "B": "Kaam kam ho jaata hai aur bonus % same rehta hai",
            "C": "Level reset ho jaata hai aur dobara shuru karna padta hai",
            "D": "Sirf naam badalta hai, income ya bonus mein fark nahi",
        },
        "correct": "A",
    },
    {
        "id": 88,
        "q": "MYLE mein consistency aur duplication ko itna emphasize kyun kiya jaata hai?",
        "options": {
            "A": "Stable, scalable aur long-term income inhi se banti hai",
            "B": "Sirf company ke rules follow karwane ke liye",
            "C": "Taaki members busy rahein, iska income se lena-dena nahi",
            "D": "Kyunki duplication se product jaldi bikta hai, bas",
        },
        "correct": "A",
    },
    {
        "id": 89,
        "q": "Forever Business Owner (FBO) hone ka core matlab kya hai?",
        "options": {
            "A": "Aap apne business ke owner ho — apne effort aur team se grow karte ho",
            "B": "Aap company ke employee ho jo fixed salary pe kaam karta hai",
            "C": "Aap ek baar join karke bina kuch kiye forever kamaate ho",
            "D": "Aap sirf customer ho jo discount pe product leta hai",
        },
        "correct": "A",
    },
    {
        "id": 90,
        "q": "MYLE journey mein 'learning phase' skip karne ka result aksar kya hota hai?",
        "options": {
            "A": "Weak foundation, galat actions aur jaldi failure",
            "B": "Turant zyada success kyunki time bachta hai",
            "C": "Koi fark nahi padta, kyunki baad mein kaam karte-karte bhi seekh sakte hain",
            "D": "Automatic promotion kyunki jaldi start kiya",
        },
        "correct": "A",
    },
    {
        "id": 91,
        "q": "MYLE mein higher rank achieve karne ke liye sabse important factor kya hai?",
        "options": {
            "A": "Consistent CC aur team duplication",
            "B": "Purana member hona — time ke saath rank apne aap",
            "C": "Ek baar ka bada effort aur phir aaram",
            "D": "Upline ki recommendation aur luck",
        },
        "correct": "A",
    },
    {
        "id": 92,
        "q": "Ek FBO ka income kaise grow karta hai system ke according?",
        "options": {
            "A": "Apni + team ki sales ka combined leverage",
            "B": "Company ki taraf se fixed monthly salary se",
            "C": "Sirf naye logon ki joining fee se",
            "D": "Sirf apni personal sales ke margin se, team ki sales ka koi hissa nahi",
        },
        "correct": "A",
    },
    {
        "id": 93,
        "q": "MYLE mein training/seekhna 'investment' kyun maana jaata hai expense nahi?",
        "options": {
            "A": "Seekhi hui skill future mein repeated income create karti hai",
            "B": "Kyunki training ka paisa kabhi wapas nahi aata",
            "C": "Kyunki yeh company ki ek compulsory fee hai",
            "D": "Yeh investment nahi, pure expense hai jo ek baar mein consume ho jaata hai",
        },
        "correct": "A",
    },
    {
        "id": 94,
        "q": "MYLE mein ek leader ki successful team ka common pattern kya hota hai?",
        "options": {
            "A": "Leader duplicate karwata hai, members khud grow",
            "B": "Leader har member ka kaam khud karta hai taaki result aaye",
            "C": "Members ek dusre se compete karte hain aur leader sirf judge karke winner chunta hai",
            "D": "Har member apna alag system banata hai jo use theek lage",
        },
        "correct": "A",
    },
    {
        "id": 95,
        "q": "MYLE opportunity present karte waqt sabse important kya hota hai?",
        "options": {
            "A": "Honestly value samjhana aur prospect ka apna why connect karna",
            "B": "Bade income claims dikhana taaki prospect turant impress ho",
            "C": "Pressure banana ki seats aaj hi khatam ho jaayengi",
            "D": "Sirf positive baatein batana, mehnat wali baat chhupana",
        },
        "correct": "A",
    },
    {
        "id": 96,
        "q": "Manager level (120 CC, 43%) tak pahunchna kya represent karta hai?",
        "options": {
            "A": "Significant team + customer base aur strong leadership",
            "B": "Sirf ek certificate aur title milta hai, income ya responsibility mein koi fark nahi",
            "C": "Kaam khatam — iske baad kuch karne ki zaroorat nahi",
            "D": "Sirf purana member hone ka reward, performance ka nahi",
        },
        "correct": "A",
    },
    {
        "id": 97,
        "q": "MYLE mein 'duplication' ka practical matlab kya hai?",
        "options": {
            "A": "Seekha hua team ko sikhana taaki woh khud kare",
            "B": "Same product ek customer ko do baar bechna",
            "C": "Upline ke messages aur documents copy-paste karna",
            "D": "Apna saara kaam team members pe daal ke khud free ho jaana aur aaram karna",
        },
        "correct": "A",
    },
    {
        "id": 98,
        "q": "MYLE business ko traditional job se alag banane wali sabse badi cheez kya hai?",
        "options": {
            "A": "Income ki koi ceiling nahi",
            "B": "Fixed salary ki guarantee aur paid chhuttiyan",
            "C": "Boss hota hai jo har din kaam assign karta hai",
            "D": "9-to-5 timing, fixed office aur roz attendance zaroori hona, job ki tarah",
        },
        "correct": "A",
    },
    {
        "id": 99,
        "q": "Naye prospect ke 'main soch ke batata hoon' pe MYLE ka recommended approach kya hai?",
        "options": {
            "A": "Doubts clear, value reinforce, follow-up fix",
            "B": "Use chhod do — jo 'soch ke batata hoon' bolta hai woh kabhi join nahi karta",
            "C": "Usi waqt force karke join karwa lo",
            "D": "Bolo ki seats aaj raat khatam ho rahi hain",
        },
        "correct": "A",
    },
    {
        "id": 100,
        "q": "MYLE mein long-term financial freedom ka primary driver kya hai?",
        "options": {
            "A": "Duplicatable system + growing team = leverage aur passive income",
            "B": "Ek baar ki badi sale jisse lifetime income aaye",
            "C": "Naye members ki joining fee se aane wala paisa",
            "D": "Join karte hi bina kaam ke automatic paisa",
        },
        "correct": "A",
    },
    {
        "id": 101,
        "q": "MYLE system mein 'rank advancement' ka sahi order kya hai (chhote se bade)?",
        "options": {
            "A": "Assistant Supervisor → Supervisor → Assistant Manager → Manager",
            "B": "Supervisor → Assistant Supervisor → Manager → Assistant Manager",
            "C": "Assistant Supervisor → Assistant Manager → Supervisor → Senior Manager",
            "D": "Supervisor → Assistant Manager → Assistant Supervisor → Manager",
        },
        "correct": "A",
    },
    {
        "id": 102,
        "q": "MYLE mein income ka ek hissa 'team performance' se kyun aata hai?",
        "options": {
            "A": "Leverage — akele se zyada combined team effort value create karta hai",
            "B": "Company ki taraf se loyalty ke liye di gayi charity hai",
            "C": "Team ki joining fee ka ek fixed hissa seedha upline ko milta hai, bas isliye",
            "D": "Aisa kuch nahi hota, income sirf apni sales se hai",
        },
        "correct": "A",
    },
    {
        "id": 103,
        "q": "MYLE mein 'consistent daily action' ka rank par kya effect hota hai?",
        "options": {
            "A": "CC aur team badhte hain, rank upar jaata hai",
            "B": "Rank pe koi asar nahi, rank sirf time se badhta hai",
            "C": "Zyada action se target badh jaata hai aur rank girta hai",
            "D": "Daily action ka asar sirf pehle mahine tak rehta hai",
        },
        "correct": "A",
    },
    {
        "id": 104,
        "q": "Ek prospect MYLE join karne se pehle Day 1 aur Day 2 sessions mein kya samajhta hai?",
        "options": {
            "A": "Business ka system, mindset aur opportunity ki clarity",
            "B": "Sirf product ki packaging aur uske features",
            "C": "Sirf company ka history, office ka address aur founders ki story",
            "D": "Sirf paise dene ka tareeka aur payment process",
        },
        "correct": "A",
    },
    {
        "id": 105,
        "q": "MYLE mein sabse sustainable success kaunse logon ko milti hai?",
        "options": {
            "A": "Seekhne, roz action aur duplication wale",
            "B": "Jo jaldi join karke bina kuch kiye intezaar karte hain",
            "C": "Jo har hafte nayi strategy try karke dekhte rehte hain",
            "D": "Jo bina seekhe pehle din se zyada se zyada logon ko sell karna shuru kar dete hain",
        },
        "correct": "A",
    },
]

DAY2_TEST_BY_ID: dict[int, dict] = {q["id"]: q for q in DAY2_TEST_QUESTIONS}


def public_question(question_id: int, option_order: list[str]) -> dict:
    """Return a client-safe question payload — ``correct`` stripped, options reordered.

    ``option_order`` is a list of original keys (e.g. ["C","A","D","B"]) defining the
    shuffled display order. The client sees positional choices 0..3 and only the server
    knows which display position maps back to the original correct key.
    """
    q = DAY2_TEST_BY_ID[question_id]
    return {
        "id": q["id"],
        "q": q["q"],
        "options": [q["options"][k] for k in option_order],
    }


def is_choice_correct(question_id: int, option_order: list[str], chosen_index: int) -> bool:
    """Server-side scoring: map the chosen display index back to the original key."""
    if chosen_index is None or chosen_index < 0 or chosen_index >= len(option_order):
        return False
    chosen_key = option_order[chosen_index]
    return chosen_key == DAY2_TEST_BY_ID[question_id]["correct"]
