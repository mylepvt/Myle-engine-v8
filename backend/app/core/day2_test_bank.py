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
            "B": "Job safe hoti hai, business hamesha risky",
            "C": "Job mein low pay hoti hai hamesha",
            "D": "Business mein koi investment nahi chahiye",
        },
        "correct": "A",
    },
    {
        "id": 2,
        "q": "Ek person 2,000 hours/year kaam karta hai. Agar woh 5-member team build kare, combined active hours hongi:",
        "options": {"A": "2,000", "B": "4,000", "C": "8,000", "D": "10,000"},
        "correct": "D",
    },
    {
        "id": 3,
        "q": "Traditional retail business mein startup ke waqt sabse bada unavoidable cost kya hota hai?",
        "options": {
            "A": "Digital marketing spend",
            "B": "Employee salary",
            "C": "Capital — rent, inventory, aur setup cost",
            "D": "Accounting software tools",
        },
        "correct": "C",
    },
    {
        "id": 4,
        "q": "Business mein 'compounding' ka sabse sahi practical example kya hoga?",
        "options": {
            "A": "Bank FD pe interest milna",
            "B": "Team grow hoti hai — income time ke saath accelerate hoti hai",
            "C": "Har mahine ek fixed bonus milna",
            "D": "Savings account balance badhna",
        },
        "correct": "B",
    },
    {
        "id": 5,
        "q": "Agar kisi ne ₹15,000 mein skill seekhi aur 3 mahine mein ₹1,20,000 kamaaye, toh yeh tha:",
        "options": {
            "A": "High-ROI investment",
            "B": "Zyada mehngi course",
            "C": "Sirf luck factor",
            "D": "Short-term gain, long-term mein sustainable nahi",
        },
        "correct": "A",
    },
    {
        "id": 6,
        "q": "'Main pehle free mein seekhunga, phir join karunga' — yeh mindset kya indicate karti hai?",
        "options": {
            "A": "Smart aur frugal thinking",
            "B": "Practical financial planning",
            "C": "Research-oriented approach",
            "D": "Low commitment aur clarity ki kami",
        },
        "correct": "D",
    },
    {
        "id": 7,
        "q": "Business mein 'system duplication' ka matlab kya hota hai?",
        "options": {
            "A": "Same document do baar print karna",
            "B": "Sirf digital backups maintain karna",
            "C": "Ek proven process sikhao — team bhi wahi independently kare",
            "D": "Software se kaam automate karna",
        },
        "correct": "C",
    },
    {
        "id": 8,
        "q": "Ek naukripesh insaan ko 'financial freedom' milna mushkil kyun hoti hai?",
        "options": {
            "A": "Woh mehnat nahi karta",
            "B": "Income time se bound hai — active kaam band toh income band",
            "C": "Market hamesha unstable rehti hai",
            "D": "Tax bahut zyada kaat lete hain",
        },
        "correct": "B",
    },
    {
        "id": 9,
        "q": "Job mein income ceiling kyun hoti hai?",
        "options": {
            "A": "Company structure limited raises deta hai — position se upar jaana aasaan nahi",
            "B": "Government ne salary cap lagayi hui hai",
            "C": "Log khud effort nahi karte",
            "D": "Market slow hone se salary nahi badhti",
        },
        "correct": "A",
    },
    {
        "id": 10,
        "q": "Investment aur expense mein fundamental fark kya hai?",
        "options": {
            "A": "Investment bada hota hai, expense chhota",
            "B": "Investment hamesha bank mein hoti hai",
            "C": "Investment future mein return create karta hai; expense consume hota hai",
            "D": "Dono consume hote hain — fark sirf tax treatment mein hai",
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
            "D": "Financially strong hai, hurry nahi",
        },
        "correct": "B",
    },
    {
        "id": 12,
        "q": "Network business mein 'leverage' practically kis form mein kaam karta hai?",
        "options": {
            "A": "Bank loan lena",
            "B": "Paid advertisements chalana",
            "C": "Social media followers badhana",
            "D": "Team members ki combined effort aur time",
        },
        "correct": "D",
    },
    {
        "id": 13,
        "q": "60 saal ki age mein job se retire hone ke baad main financial challenge kya hogi?",
        "options": {
            "A": "Active income band ho jaayegi — savings pe hi depend rehna padega",
            "B": "Sarkar pension mein extra tax kaategi",
            "C": "Property value automatically giregi",
            "D": "Market zaroor crash hoga us waqt",
        },
        "correct": "A",
    },
    {
        "id": 14,
        "q": "Bina proper training ke business start karne ka primary risk kya hota hai?",
        "options": {
            "A": "Capital zyada lag jaayega",
            "B": "Government license nahi milega",
            "C": "Foundation weak hoga — wrong actions se failure probability high",
            "D": "Competition bahut zyada mil jaayega",
        },
        "correct": "C",
    },
    {
        "id": 15,
        "q": "MYLE mein learning phase kyun zaroori hai consistent success ke liye?",
        "options": {
            "A": "Legal requirement hai certificate ke liye",
            "B": "Bina samjhe system replicate nahi hota — duplication tabhi hogi",
            "C": "Timepass ke liye ek structure diya gaya hai",
            "D": "Coaching fees recover karne ke liye",
        },
        "correct": "B",
    },
    {
        "id": 16,
        "q": "'Mujhe pehle results dikhao, phir join karunga' — yeh response kya indicate karta hai?",
        "options": {
            "A": "Smart due diligence kar raha hai",
            "B": "Financial maturity dikha raha hai",
            "C": "Strong research skills hain",
            "D": "Clarity nahi hai ya fear-based hesitation hai",
        },
        "correct": "D",
    },
    {
        "id": 17,
        "q": "Passive income develop hone ki primary condition kya hoti hai?",
        "options": {
            "A": "Team independently kaam karne lagti hai — system bina aapke chalta rehta hai",
            "B": "Bank balance ₹10 lakh se upar ho jaaye",
            "C": "Company ka stock market mein list ho",
            "D": "Minimum 5 saal regular job karna zaroori hota hai",
        },
        "correct": "A",
    },
    {
        "id": 18,
        "q": "'Calculated risk' aur 'blind risk' mein core difference kya hai?",
        "options": {
            "A": "Calculated risk mein hamesha zyada paisa lagta hai",
            "B": "Blind risk mein guarantee hoti hai result ki",
            "C": "Calculated risk mein information, system aur clarity ke baad decision liya jaata hai",
            "D": "Dono same hain — risk toh risk hi hota hai",
        },
        "correct": "C",
    },
    {
        "id": 19,
        "q": "'Main abhi ready nahi hoon' — yeh statement usually kya represent karta hai?",
        "options": {
            "A": "Practical preparation chal rahi hai",
            "B": "Fear-based avoidance ya clarity ki kami",
            "C": "Genuine skill gap hai",
            "D": "Thoughtful financial planning ho rahi hai",
        },
        "correct": "B",
    },
    {
        "id": 20,
        "q": "Business successfully build karne ke liye sabse pehla step kya hona chahiye?",
        "options": {
            "A": "Social media accounts banana aur followers badhana",
            "B": "Logo aur branding design karna",
            "C": "Bina seekhe seedha selling start karna",
            "D": "System samajhna aur proper foundation banana",
        },
        "correct": "D",
    },
    {
        "id": 31,
        "q": "Apne aap mein invest karna (skill seekhna) sabse zyada return kab deta hai?",
        "options": {
            "A": "Jab seekhi hui skill ko action mein lagaya jaaye",
            "B": "Jab certificate frame karwa ke deewar pe lagaya jaaye",
            "C": "Jab sirf notes bana liye jaayein",
            "D": "Jab dusre ko sikha diya jaaye bina khud kiye",
        },
        "correct": "A",
    },
    {
        "id": 32,
        "q": "'Time freedom' ka business context mein sahi matlab kya hai?",
        "options": {
            "A": "Kaam bilkul nahi karna",
            "B": "Income aapke direct time pe depend karna band kar de",
            "C": "Sirf weekend pe chhutti milna",
            "D": "Office late jaana allowed ho",
        },
        "correct": "B",
    },
    {
        "id": 33,
        "q": "Consistency successful business build karne mein kyun matter karti hai?",
        "options": {
            "A": "Kyunki ek baar ka effort lifetime result deta hai",
            "B": "Kyunki small repeated actions compound hokar bade result banate hain",
            "C": "Kyunki consistency se luck badhta hai",
            "D": "Kyunki company consistency pe salary deti hai",
        },
        "correct": "B",
    },
    {
        "id": 34,
        "q": "Mentor ya upline ka primary role kya hota hai?",
        "options": {
            "A": "Aapke liye saara kaam khud karna",
            "B": "Proven path guide karna taaki galtiyan kam ho",
            "C": "Aapko paisa udhaar dena",
            "D": "Aapki jagah decisions lena",
        },
        "correct": "B",
    },
    {
        "id": 35,
        "q": "'Rejection' ko successful business builder kaise treat karta hai?",
        "options": {
            "A": "Personal insult samajh ke quit kar deta hai",
            "B": "Process ka normal part — har no aapko sahi person ke kareeb le jaata hai",
            "C": "Proof ki business kaam nahi karta",
            "D": "Sign ki product kharab hai",
        },
        "correct": "B",
    },
    {
        "id": 36,
        "q": "Active income aur passive income ko ek line mein kaise distinguish karein?",
        "options": {
            "A": "Active = kaam karo tabhi paisa; Passive = system se paisa aata rahe",
            "B": "Active chhota hota hai, passive bada",
            "C": "Active legal hai, passive illegal",
            "D": "Dono mein koi practical fark nahi",
        },
        "correct": "A",
    },
    {
        "id": 37,
        "q": "Duplication ke bina team-based business scale kyun nahi hota?",
        "options": {
            "A": "Kyunki ek akela insaan limited hours hi de sakta hai",
            "B": "Kyunki company allow nahi karti",
            "C": "Kyunki product khatam ho jaata hai",
            "D": "Kyunki tax zyada lag jaata hai",
        },
        "correct": "A",
    },
    {
        "id": 38,
        "q": "Long-term vision wale builder ka short-term mein behaviour kaisa hota hai?",
        "options": {
            "A": "Turant bade result na milne pe quit kar deta hai",
            "B": "Foundation pe focus karta hai chahe result thoda late dikhe",
            "C": "Sirf easy customers dhoondta hai",
            "D": "Har roz strategy badalta rehta hai",
        },
        "correct": "B",
    },
    {
        "id": 39,
        "q": "'Comfort zone' business growth ke liye problem kyun hai?",
        "options": {
            "A": "Comfort zone mein growth ke liye zaroori naye actions nahi hote",
            "B": "Comfort zone illegal hai",
            "C": "Comfort zone mein zyada paisa lagta hai",
            "D": "Comfort zone se tax badh jaata hai",
        },
        "correct": "A",
    },
    {
        "id": 40,
        "q": "Personal development (books, training) business mein kyun emphasize hota hai?",
        "options": {
            "A": "Business aapki personal growth se zyada nahi badh sakta",
            "B": "Sirf time pass karne ke liye",
            "C": "Certificate dikhane ke liye",
            "D": "Company ko books bechni hain",
        },
        "correct": "A",
    },
    {
        "id": 41,
        "q": "Goal-setting ka practical fayda kya hota hai?",
        "options": {
            "A": "Direction aur measurable target deta hai — random effort nahi rehta",
            "B": "Goal likhne se apne aap result aa jaata hai",
            "C": "Goal sirf motivation ke liye hota hai, kaam ka nahi",
            "D": "Goals se tax bachta hai",
        },
        "correct": "A",
    },
    {
        "id": 42,
        "q": "Ek prospect 'paise nahi hain' bolta hai par mehngi cheezein use karta hai — yeh aksar kya indicate karta hai?",
        "options": {
            "A": "Genuine financial crisis",
            "B": "Priority/value ka issue, paise ka nahi",
            "C": "Woh business ke liye perfect hai",
            "D": "Use turant loan chahiye",
        },
        "correct": "B",
    },
    {
        "id": 43,
        "q": "'Network' ka business value kya hai?",
        "options": {
            "A": "Relationships aur reach se opportunities multiply hoti hain",
            "B": "Sirf phone contacts ki ginti",
            "C": "Social media par likes",
            "D": "Network ka koi business value nahi",
        },
        "correct": "A",
    },
    {
        "id": 44,
        "q": "Daily routine (DMO - Daily Method of Operation) ka kya purpose hai?",
        "options": {
            "A": "Roz ke productive actions ko consistent banana",
            "B": "Time waste karne ka structure",
            "C": "Sirf attendance mark karna",
            "D": "Company ko report bhejna",
        },
        "correct": "A",
    },
    {
        "id": 45,
        "q": "Successful builder apna time kis activity ko sabse zyada deta hai?",
        "options": {
            "A": "Income-producing activities (prospecting, follow-up, team building)",
            "B": "Sirf social media scroll",
            "C": "Sirf meetings ke baare mein sochna",
            "D": "Logo design improve karna",
        },
        "correct": "A",
    },
    {
        "id": 46,
        "q": "'Belief' (vishwaas) sales aur business mein kyun important hai?",
        "options": {
            "A": "Apne product/opportunity pe belief honi chahiye tabhi conviction se baat hoti hai",
            "B": "Belief ka kaam se koi relation nahi",
            "C": "Belief sirf religion ke liye hai",
            "D": "Belief se tax kam hota hai",
        },
        "correct": "A",
    },
    {
        "id": 47,
        "q": "Follow-up sales process mein kyun critical hai?",
        "options": {
            "A": "Zyada tar decisions pehli baat mein nahi hote — follow-up se conversion badhta hai",
            "B": "Follow-up se customer chid jaata hai hamesha",
            "C": "Follow-up illegal hai",
            "D": "Follow-up sirf time waste hai",
        },
        "correct": "A",
    },
    {
        "id": 48,
        "q": "Apni income badhane ka sabse sustainable tareeka kya hai?",
        "options": {
            "A": "Apni value/skill badhao aur duplication create karo",
            "B": "Zyada ghante akela kaam karo bas",
            "C": "Logo se paisa udhaar lo",
            "D": "Lottery pe depend karo",
        },
        "correct": "A",
    },
    {
        "id": 49,
        "q": "Ek system-based business naye person ke liye easy kyun hota hai?",
        "options": {
            "A": "Proven steps already bane hote hain — invent karne ki zaroorat nahi",
            "B": "Kyunki kuch karna hi nahi padta",
            "C": "Kyunki paisa free milta hai",
            "D": "Kyunki koi competition nahi hoti",
        },
        "correct": "A",
    },
    {
        "id": 50,
        "q": "'Main akela hi sab kar lunga, team ki zaroorat nahi' — yeh soch scaling ke liye kyun galat hai?",
        "options": {
            "A": "Ek insaan ke time aur effort ki limit hoti hai — leverage nahi banta",
            "B": "Akela kaam karna illegal hai",
            "C": "Akela kaam karne se product khatam ho jaata hai",
            "D": "Yeh soch bilkul sahi hai",
        },
        "correct": "A",
    },
    {
        "id": 51,
        "q": "Attitude aur skill mein se long-term success ke liye zyada important kya maana jaata hai?",
        "options": {
            "A": "Attitude — kyunki skill seekhi ja sakti hai par right attitude foundation hai",
            "B": "Sirf skill, attitude bekaar hai",
            "C": "Dono ka koi role nahi",
            "D": "Sirf luck",
        },
        "correct": "A",
    },
    {
        "id": 52,
        "q": "Prospect ko opportunity dikhane ka best approach kya hai?",
        "options": {
            "A": "Pressure dalo aur force karo",
            "B": "Clearly samjhao, value dikhao, decision unpe chhodo",
            "C": "Jhooth bolo result ke baare mein",
            "D": "Bina kuch bataye join karwa lo",
        },
        "correct": "B",
    },
    {
        "id": 53,
        "q": "Ek opportunity 'sabke liye' kyun nahi hoti?",
        "options": {
            "A": "Har kisi ki readiness, mindset aur priority alag hoti hai",
            "B": "Kyunki seats limited hain hamesha",
            "C": "Kyunki product mehnga hai",
            "D": "Kyunki company sabko mana karti hai",
        },
        "correct": "A",
    },
    {
        "id": 54,
        "q": "Income aur worth (value) ka relation kya hai?",
        "options": {
            "A": "Aap market ko jitni value dete ho, income usi ke proportion mein aati hai",
            "B": "Income aur value ka koi relation nahi",
            "C": "Value se income ghatti hai",
            "D": "Income sirf umar pe depend karti hai",
        },
        "correct": "A",
    },
    {
        "id": 55,
        "q": "'Big result' chahne wale ko process ke baare mein kya samajhna chahiye?",
        "options": {
            "A": "Bada result chhote consistent steps ka compounded outcome hota hai",
            "B": "Bada result ek hi din mein milta hai",
            "C": "Process matter nahi karta, sirf luck",
            "D": "Bada result bina kaam ke aata hai",
        },
        "correct": "A",
    },
    {
        "id": 56,
        "q": "Ek leader apni team ki growth kaise drive karta hai?",
        "options": {
            "A": "Example set karke aur unhe duplicate karna sikha ke",
            "B": "Sirf orders deke khud kuch na karke",
            "C": "Team se compete karke",
            "D": "Information chhupa ke",
        },
        "correct": "A",
    },
    {
        "id": 57,
        "q": "'Excuses' aur 'results' ka relation successful logon mein kaisa hota hai?",
        "options": {
            "A": "Jितне zyada excuses, utne kam results — dono inversely related",
            "B": "Excuses se results badhte hain",
            "C": "Dono ka koi relation nahi",
            "D": "Results ke liye excuses zaroori hain",
        },
        "correct": "A",
    },
    {
        "id": 58,
        "q": "Learning ke baad 'implementation' kyun zaroori hai?",
        "options": {
            "A": "Knowledge tab tak bekaar hai jab tak action mein convert na ho",
            "B": "Implementation optional hai",
            "C": "Sirf seekhna hi kaafi hai income ke liye",
            "D": "Implementation se confusion badhta hai",
        },
        "correct": "A",
    },
    {
        "id": 59,
        "q": "Ek prospect baar-baar 'kal batata hoon' bolta hai — best handling kya hai?",
        "options": {
            "A": "Clear, specific follow-up time fix karo aur value reinforce karo",
            "B": "Use ignore kar do permanently",
            "C": "Roz 10 baar call karke pareshan karo",
            "D": "Jhooth bolo urgency ke baare mein",
        },
        "correct": "A",
    },
    {
        "id": 60,
        "q": "Self-discipline business mein boss/manager ki jagah kyun leti hai?",
        "options": {
            "A": "Apna business hai — koi force nahi karega, khud ko drive karna padta hai",
            "B": "Discipline ki zaroorat nahi hoti",
            "C": "Company ek manager deti hai har kisi ko",
            "D": "Discipline sirf job mein chahiye",
        },
        "correct": "A",
    },
    {
        "id": 61,
        "q": "Ek skill ek baar seekh kar baar-baar use karna kis concept ko represent karta hai?",
        "options": {
            "A": "Leverage / asset creation",
            "B": "Liability",
            "C": "Expense",
            "D": "Depreciation",
        },
        "correct": "A",
    },
    {
        "id": 62,
        "q": "'Average' result se 'exceptional' result kaise banta hai?",
        "options": {
            "A": "Thoda extra consistent effort daily, jo time ke saath compound hota hai",
            "B": "Sirf ek bada lucky break se",
            "C": "Kabhi nahi ban sakta",
            "D": "Sirf paisa lagane se",
        },
        "correct": "A",
    },
    {
        "id": 63,
        "q": "Customer/prospect ke 'objection' ko sahi mindset se kaise dekha jaata hai?",
        "options": {
            "A": "Objection = interest + missing clarity; samjhane ka mauka",
            "B": "Objection = pakka no, baat khatam",
            "C": "Objection = insult",
            "D": "Objection ka koi matlab nahi",
        },
        "correct": "A",
    },
    {
        "id": 64,
        "q": "Apne 'why' (reason/goal) ko strong rakhna kyun zaroori hai?",
        "options": {
            "A": "Strong why mushkil time mein motivation aur consistency deta hai",
            "B": "Why ka kaam se koi relation nahi",
            "C": "Why sirf shuru mein chahiye",
            "D": "Why se tax bachta hai",
        },
        "correct": "A",
    },
    {
        "id": 65,
        "q": "Ek business builder 'busy' aur 'productive' mein kaise fark karta hai?",
        "options": {
            "A": "Busy = activity; Productive = result-producing activity",
            "B": "Dono ek hi cheez hain",
            "C": "Busy hamesha productive se behtar",
            "D": "Productivity matter nahi karti",
        },
        "correct": "A",
    },
    {
        "id": 66,
        "q": "Team mein ek naya member fail kyun ho jaata hai aksar?",
        "options": {
            "A": "Proven system follow nahi karta ya jaldi quit kar deta hai",
            "B": "System kabhi kaam nahi karta",
            "C": "Company use mana karti hai",
            "D": "Naye members fail nahi hote kabhi",
        },
        "correct": "A",
    },
    {
        "id": 67,
        "q": "'Income goal' set karne ka sahi tareeka kya hai?",
        "options": {
            "A": "Specific number + deadline + required actions define karo",
            "B": "Sirf 'bahut paisa' soch lo",
            "C": "Koi goal mat rakho",
            "D": "Dusron ka goal copy kar lo bina plan ke",
        },
        "correct": "A",
    },
    {
        "id": 68,
        "q": "Skill development aur income growth ka relation kaisa hota hai?",
        "options": {
            "A": "Skill badhne ke saath aapki income capacity badhti hai",
            "B": "Inverse — skill badhne se income ghatti hai",
            "C": "Koi relation nahi",
            "D": "Income sirf time se badhti hai, skill se nahi",
        },
        "correct": "A",
    },
    {
        "id": 69,
        "q": "Ek opportunity ko evaluate karne ka sabse practical tareeka kya hai?",
        "options": {
            "A": "System, support, aur potential ROI ko samajhna — emotion ke bajaye",
            "B": "Sirf doston se puchhna jinhe pata nahi",
            "C": "Random reviews padhke decide karna",
            "D": "Bina samjhe mana kar dena",
        },
        "correct": "A",
    },
    {
        "id": 70,
        "q": "'Main koshish karunga' aur 'main karunga' mein commitment ka fark kya hai?",
        "options": {
            "A": "'Karunga' = decision liya; 'koshish' = exit ka raasta khula rakha",
            "B": "Dono same hain",
            "C": "'Koshish' zyada strong commitment hai",
            "D": "Commitment ka result se relation nahi",
        },
        "correct": "A",
    },
    {
        "id": 71,
        "q": "Ek prospect jo har cheez ko 'scam' bolta hai — uske peeche aksar kya hota hai?",
        "options": {
            "A": "Past experience ya knowledge gap se bana fear/bias",
            "B": "Hamesha woh 100% sahi hota hai",
            "C": "Woh business expert hota hai",
            "D": "Use opportunity samajh aa gayi hai",
        },
        "correct": "A",
    },
    {
        "id": 72,
        "q": "Apne team members ko motivate rakhne ka best long-term tareeka kya hai?",
        "options": {
            "A": "Unki growth, recognition aur unke 'why' pe focus karna",
            "B": "Sirf paise ka laalach dena jhooth bolke",
            "C": "Daraana",
            "D": "Ignore karna",
        },
        "correct": "A",
    },
    {
        "id": 73,
        "q": "'Time' sabse valuable resource kyun maana jaata hai?",
        "options": {
            "A": "Time wapas nahi aata aur sabke paas limited hai — isliye leverage zaroori",
            "B": "Time unlimited hai",
            "C": "Time kharidi ja sakti hai aasaani se",
            "D": "Time ka koi value nahi",
        },
        "correct": "A",
    },
    {
        "id": 74,
        "q": "Ek beginner ko sabse pehle kis cheez pe focus karna chahiye?",
        "options": {
            "A": "Basics seekhna aur proven system follow karna",
            "B": "Advanced strategies pehle din se",
            "C": "Apna naya system invent karna",
            "D": "Result na aane pe turant quit karna",
        },
        "correct": "A",
    },
    {
        "id": 75,
        "q": "'Financial education' job-holder ke liye kyun zaroori hai?",
        "options": {
            "A": "Paisa kaise kaam karta hai samajhke better decisions le paaye",
            "B": "Sirf businessman ke liye useful hai",
            "C": "Financial education se confusion badhta hai",
            "D": "Iska practical fayda kuch nahi",
        },
        "correct": "A",
    },
    {
        "id": 76,
        "q": "Ek mehnti par directionless insaan vs ek focused insaan — fark kya banata hai?",
        "options": {
            "A": "Direction — right actions sahi jagah lagana result deta hai",
            "B": "Mehnat akeli hamesha result deti hai chahe direction kuch bhi ho",
            "C": "Dono ka same result",
            "D": "Direction matter nahi karti",
        },
        "correct": "A",
    },
    {
        "id": 77,
        "q": "Apni progress ko track karna kyun important hai?",
        "options": {
            "A": "Pata chalta hai kya kaam kar raha hai aur kahan improve karna hai",
            "B": "Tracking time waste hai",
            "C": "Tracking se motivation girti hai",
            "D": "Sirf company ke liye useful",
        },
        "correct": "A",
    },
    {
        "id": 78,
        "q": "'Duplication' tabhi kaam karti hai jab system kaisa ho?",
        "options": {
            "A": "Simple, repeatable aur sikhane mein aasaan",
            "B": "Bahut complex aur har baar alag",
            "C": "Secret jise koi na samjhe",
            "D": "Sirf ek hi insaan kar sake",
        },
        "correct": "A",
    },
    {
        "id": 79,
        "q": "Ek prospect ko 'product' se pehle kya bechna zaroori hota hai?",
        "options": {
            "A": "Vision/opportunity ki value aur uska apna future benefit",
            "B": "Sirf price discount",
            "C": "Daar aur pressure",
            "D": "Kuch nahi, seedha paisa maango",
        },
        "correct": "A",
    },
    {
        "id": 80,
        "q": "Successful log 'problems' ko kaise dekhte hain?",
        "options": {
            "A": "Solve karne layak challenges jo growth dete hain",
            "B": "Quit karne ke reasons",
            "C": "Dusron ki galti",
            "D": "Permanent dead-end",
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
            "A": "Cash Credit",
            "B": "Confirmed Customer / Course Credit",
            "C": "Company Commission",
            "D": "Customer Count",
        },
        "correct": "B",
    },
    {
        "id": 23,
        "q": "Assistant Supervisor level ke liye kitne CC required hain?",
        "options": {"A": "1 CC", "B": "2 CC", "C": "5 CC", "D": "3 CC"},
        "correct": "B",
    },
    {
        "id": 24,
        "q": "Supervisor level ke liye kitne CC required hain?",
        "options": {"A": "10 CC", "B": "15 CC", "C": "25 CC", "D": "50 CC"},
        "correct": "C",
    },
    {
        "id": 25,
        "q": "Assistant Manager level ke liye kitne CC required hain?",
        "options": {"A": "75 CC", "B": "50 CC", "C": "100 CC", "D": "60 CC"},
        "correct": "A",
    },
    {
        "id": 26,
        "q": "Manager level ke liye kitne CC required hain?",
        "options": {"A": "75 CC", "B": "100 CC", "C": "120 CC", "D": "150 CC"},
        "correct": "C",
    },
    {
        "id": 27,
        "q": "Assistant Supervisor level pe joining bonus kitna hota hai?",
        "options": {"A": "25%", "B": "20%", "C": "30%", "D": "15%"},
        "correct": "A",
    },
    {
        "id": 28,
        "q": "Supervisor level pe discount/bonus kitna hota hai?",
        "options": {"A": "25%", "B": "30%", "C": "38%", "D": "33%"},
        "correct": "D",
    },
    {
        "id": 29,
        "q": "Manager level pe joining bonus kitna hota hai?",
        "options": {"A": "38%", "B": "43%", "C": "48%", "D": "33%"},
        "correct": "B",
    },
    {
        "id": 30,
        "q": "Ek structured business system mein income kitne types ki hoti hai?",
        "options": {
            "A": "3",
            "B": "5",
            "C": "7",
            "D": "Multiple (layered structured system)",
        },
        "correct": "D",
    },
    {
        "id": 81,
        "q": "MYLE ka business model primary roop se kis cheez par based hai?",
        "options": {
            "A": "Skill development + system duplication se income build karna",
            "B": "Sirf product khareedna",
            "C": "Sirf paisa invest karke baithna",
            "D": "Stock market trading",
        },
        "correct": "A",
    },
    {
        "id": 82,
        "q": "Naya FBO join hone ke baad sabse pehla recommended step kya hota hai?",
        "options": {
            "A": "Proper training/learning complete karna",
            "B": "Seedha bina seekhe sell karna",
            "C": "Apni team se compete karna",
            "D": "Kuch din kuch na karna",
        },
        "correct": "A",
    },
    {
        "id": 83,
        "q": "MYLE system mein upline/mentor aapki kaise madad karta hai?",
        "options": {
            "A": "Guidance, training aur proven path provide karke",
            "B": "Aapka saara kaam khud karke",
            "C": "Aapko paisa deke",
            "D": "Koi madad nahi karta",
        },
        "correct": "A",
    },
    {
        "id": 84,
        "q": "CC (Confirmed Customer) badhne ka aapke level/rank pe kya asar hota hai?",
        "options": {
            "A": "Zyada CC se higher level aur higher bonus unlock hota hai",
            "B": "CC ka level se koi relation nahi",
            "C": "Zyada CC se level girta hai",
            "D": "CC sirf decoration hai",
        },
        "correct": "A",
    },
    {
        "id": 85,
        "q": "Joining bonus % level badhne ke saath kaise change hota hai?",
        "options": {
            "A": "Higher level pe higher bonus % milta hai",
            "B": "Higher level pe bonus ghat jaata hai",
            "C": "Bonus % sabhi levels pe same rehta hai",
            "D": "Bonus % random hota hai",
        },
        "correct": "A",
    },
    {
        "id": 86,
        "q": "MYLE mein 'team building' ka income pe kya effect hota hai?",
        "options": {
            "A": "Team ka combined effort leverage banata hai — income scale hoti hai",
            "B": "Team se income ghatti hai",
            "C": "Team building optional aur useless hai",
            "D": "Team sirf company ke liye useful hai",
        },
        "correct": "A",
    },
    {
        "id": 87,
        "q": "Assistant Supervisor (2 CC) se Supervisor (25 CC) tak pahunchne ka matlab kya hai?",
        "options": {
            "A": "Zyada confirmed customers + bada bonus % + higher rank",
            "B": "Kaam kam ho jaata hai aur bonus same rehta hai",
            "C": "Level down ho jaata hai",
            "D": "Kuch fark nahi padta",
        },
        "correct": "A",
    },
    {
        "id": 88,
        "q": "MYLE mein consistency aur duplication ko itna emphasize kyun kiya jaata hai?",
        "options": {
            "A": "Stable, scalable aur long-term income inhi se banti hai",
            "B": "Sirf company ke rules ke liye",
            "C": "Inka practical fayda kuch nahi",
            "D": "Time pass ke liye",
        },
        "correct": "A",
    },
    {
        "id": 89,
        "q": "Forever Business Owner (FBO) hone ka core matlab kya hai?",
        "options": {
            "A": "Aap apne business ke owner ho — apne effort aur team se grow karte ho",
            "B": "Aap company ke employee ho fixed salary par",
            "C": "Aapko kuch karna nahi padta",
            "D": "Aap sirf customer ho",
        },
        "correct": "A",
    },
    {
        "id": 90,
        "q": "MYLE journey mein 'learning phase' skip karne ka result aksar kya hota hai?",
        "options": {
            "A": "Weak foundation, galat actions aur jaldi failure",
            "B": "Turant zyada success",
            "C": "Koi fark nahi padta",
            "D": "Automatic promotion",
        },
        "correct": "A",
    },
    {
        "id": 91,
        "q": "MYLE mein higher rank achieve karne ke liye sabse important factor kya hai?",
        "options": {
            "A": "Consistent CC aur team duplication",
            "B": "Sirf intezaar karna",
            "C": "Sirf ek baar ka effort",
            "D": "Luck",
        },
        "correct": "A",
    },
    {
        "id": 92,
        "q": "Ek FBO ka income kaise grow karta hai system ke according?",
        "options": {
            "A": "Apni sales + team ki sales ke combined leverage se",
            "B": "Sirf fixed monthly salary se",
            "C": "Sirf joining fee se",
            "D": "Income grow nahi karti",
        },
        "correct": "A",
    },
    {
        "id": 93,
        "q": "MYLE mein training/seekhna 'investment' kyun maana jaata hai expense nahi?",
        "options": {
            "A": "Seekhi hui skill future mein repeated income create karti hai",
            "B": "Kyunki paisa wapas nahi aata",
            "C": "Kyunki yeh ek tax hai",
            "D": "Yeh investment nahi, pure expense hai",
        },
        "correct": "A",
    },
    {
        "id": 94,
        "q": "MYLE mein ek leader ki successful team ka common pattern kya hota hai?",
        "options": {
            "A": "Leader system duplicate karwata hai, members independently grow karte hain",
            "B": "Leader sabka kaam khud karta hai",
            "C": "Members ek dusre se compete karte hain",
            "D": "Koi system follow nahi hota",
        },
        "correct": "A",
    },
    {
        "id": 95,
        "q": "MYLE opportunity present karte waqt sabse important kya hota hai?",
        "options": {
            "A": "Honestly value samjhana aur prospect ka apna why connect karna",
            "B": "Jhoothe income claims karna",
            "C": "Pressure aur force",
            "D": "Information chhupana",
        },
        "correct": "A",
    },
    {
        "id": 96,
        "q": "Manager level (120 CC, 43%) tak pahunchna kya represent karta hai?",
        "options": {
            "A": "Significant team + customer base aur strong leadership",
            "B": "Sirf ek certificate",
            "C": "Kaam ka khatam ho jaana",
            "D": "Kuch khaas nahi",
        },
        "correct": "A",
    },
    {
        "id": 97,
        "q": "MYLE mein 'duplication' ka practical matlab kya hai?",
        "options": {
            "A": "Jo aapne seekha woh team ko sikhao taaki woh bhi independently kar sake",
            "B": "Same product do baar bechna",
            "C": "Documents copy karna",
            "D": "Apna kaam dusron pe daalna",
        },
        "correct": "A",
    },
    {
        "id": 98,
        "q": "MYLE business ko traditional job se alag banane wali sabse badi cheez kya hai?",
        "options": {
            "A": "Income ki ceiling nahi — effort aur team se scale hota hai",
            "B": "Fixed salary guarantee",
            "C": "Boss ka hona",
            "D": "9-to-5 timing zaroori",
        },
        "correct": "A",
    },
    {
        "id": 99,
        "q": "Naye prospect ke 'main soch ke batata hoon' pe MYLE ka recommended approach kya hai?",
        "options": {
            "A": "Doubts clear karo, value reinforce karo, clear follow-up time set karo",
            "B": "Use chhod do permanently",
            "C": "Force karke join karwa lo",
            "D": "Jhooth bolo urgency ke baare mein",
        },
        "correct": "A",
    },
    {
        "id": 100,
        "q": "MYLE mein long-term financial freedom ka primary driver kya hai?",
        "options": {
            "A": "Duplicatable system + growing team = leverage aur passive income",
            "B": "Sirf ek baar ki badi sale",
            "C": "Sirf joining fee",
            "D": "Bina kaam ke automatic paisa",
        },
        "correct": "A",
    },
    {
        "id": 101,
        "q": "MYLE system mein 'rank advancement' ka sahi order kya hai (chhote se bade)?",
        "options": {
            "A": "Assistant Supervisor → Supervisor → Assistant Manager → Manager",
            "B": "Manager → Supervisor → Assistant Supervisor",
            "C": "Supervisor → Manager → Assistant Supervisor",
            "D": "Koi fixed order nahi hota",
        },
        "correct": "A",
    },
    {
        "id": 102,
        "q": "MYLE mein income ka ek hissa 'team performance' se kyun aata hai?",
        "options": {
            "A": "Leverage — akele se zyada combined team effort value create karta hai",
            "B": "Company ki charity hai",
            "C": "Galti se add ho jaata hai",
            "D": "Aisa kuch nahi hota",
        },
        "correct": "A",
    },
    {
        "id": 103,
        "q": "MYLE mein 'consistent daily action' ka rank par kya effect hota hai?",
        "options": {
            "A": "CC aur team steadily badhte hain — rank upar jaata hai",
            "B": "Rank pe koi asar nahi",
            "C": "Rank neeche aata hai",
            "D": "Action se sirf thakaan hoti hai",
        },
        "correct": "A",
    },
    {
        "id": 104,
        "q": "Ek prospect MYLE join karne se pehle Day 1 aur Day 2 sessions mein kya samajhta hai?",
        "options": {
            "A": "Business ka system, mindset aur opportunity ki clarity",
            "B": "Sirf product ki packaging",
            "C": "Kuch bhi useful nahi",
            "D": "Sirf paise dene ka tareeka",
        },
        "correct": "A",
    },
    {
        "id": 105,
        "q": "MYLE mein sabse sustainable success kaunse logon ko milti hai?",
        "options": {
            "A": "Jo seekhte hain, consistently action lete hain aur team ko duplicate karwate hain",
            "B": "Jo sirf join karke baith jaate hain",
            "C": "Jo har hafte strategy badalte hain",
            "D": "Jo bina seekhe sirf sell karte hain",
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
