#!/usr/bin/env python3
"""
Migration: old Flask/SQLite app → new FastAPI/PostgreSQL app.
Run on NEW Render shell:
  DATABASE_URL=<postgres_url> python3 migrate_from_old_app.py
"""
import csv, io, os, sys, re
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values
from passlib.context import CryptContext

# ── Config ─────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DEFAULT_PASSWORD = "Karan@5911"

if not DATABASE_URL:
    sys.exit("ERROR: set DATABASE_URL env var")

# normalise postgres:// → postgresql://
db_url = DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = "postgresql://" + db_url[len("postgres://"):]
# strip asyncpg if present
db_url = db_url.replace("+asyncpg", "").replace("+psycopg2", "")

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Status mapping ─────────────────────────────────────────────────────────
STATUS_MAP = {
    "new": "new_lead",
    "New": "new_lead",
    "Lost": "lost",
    "Inactive": "inactive",
    "Contacted": "contacted",
    "Retarget": "retarget",
    "Video Watched": "video_watched",
    "Video Sent": "video_sent",
    "Invited": "invited",
    "Paid ₹196": "paid",
    "Day 1": "day_1",
    "Day 2": "day_2",
    "Day 3": "day_3",
}

def map_status(s: str) -> str:
    return STATUS_MAP.get(s.strip(), s.strip().lower().replace(" ", "_"))

# ── Parse gender from notes field ─────────────────────────────────────────
def parse_gender(notes_raw: str) -> str | None:
    m = re.search(r"Gender:\s*(Male|Female)", notes_raw or "")
    return m.group(1).lower() if m else None

def parse_notes(notes_raw: str) -> str | None:
    # strip "Gender: X | Submit Time: ..." part
    cleaned = re.sub(r"Gender:\s*(Male|Female)\s*\|?\s*", "", notes_raw or "").strip()
    cleaned = re.sub(r"Submit Time:.*", "", cleaned).strip(" |")
    return cleaned or None

# ── Leads data (embedded) ─────────────────────────────────────────────────
LEADS_CSV = """10854,Khushali dangar,+919274506116,,,101,Lost,Dhoraji,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10855,Chhoti kumari,+919263504492,,,101,Inactive,Khunti,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10856,priyanshi mishra,+917415645629,,,101,Lost,Rewa m.p.,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10857,Amit Kumar,+919661767033,,,101,Retarget,852114,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10858,Sidharth Kumar hela,+919635561198,,,101,Lost,Asansol,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10859,Priyanka badoni,+919172172304,,,96,Lost,Tehri Uttarakhand,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10860,Kanchan kumari,+919708517101,,,96,Contacted,Patna,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10861,Archita Acharya,+917894299674,,,96,Lost,Odisha,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10862,Kanchan Parteki,+917697924975,,,96,Lost,Nagpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10863,Vidhi singh,+917991448664,,,96,Lost,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10864,Siddhika Krishna pagare,+917400241568,,,96,Lost,Mumbai,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10865,Sneha Gaikwad,+919920851528,,,96,Contacted,Mumbai,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10866,Amman khan,+918736853671,,,96,Lost,Tilhar,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10867,Komal Kumari,+919534336193,,,96,Lost,Indian,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10868,Himanshu Yadav,+918209639758,,,96,Contacted,Jaipur,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10869,Aman Paswan,+916290934314,,,96,Contacted,Bihar,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10870,Angrej Singh,+919888416294,,,96,Lost,Ludhiana,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10871,Neha,+919211597965,,,100,Lost,Gurgaon,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10872,Ishan Pinjani,+919730394795,,,90,Lost,Amravati,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10873,Aditya,+919243017992,,,90,Lost,Dewas Madhya Pradesh,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10874,Juhi,+919355141305,,,90,Lost,Kapashera new Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10875,Manisha Chauhan,+917249516523,,,90,Lost,Ahmedabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10876,Narinder kaur,+917696614997,,,90,Lost,zirakpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10877,Sakchi Kujur,+919153049673,,,90,Lost,Lohardaga,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10878,Pratik Shelke,+918956560731,,,90,Lost,Sinnar Nashik,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10879,Archismani sahoo,+917854010205,,,90,Lost,Bhubaneswar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10880,Shalu,+918287455982,,,90,Lost,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10881,Vaishnavi,+918882546251,,,90,Inactive,Dheli,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10882,Varsha,+918685073020,,,90,Inactive,Varsha,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10883,Shifa,+919219858734,,,90,Lost,Up,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10884,Richa,+919931167373,,,90,Lost,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10885,Jaswant Singh,+919459070033,,,90,Lost,Mandi,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10886,Pushpa Kharka,+918920526876,,,90,Lost,Noida,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10887,Swastik Gaykwad,+918459984080,,,90,Lost,Wardha,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10888,Dinesh Kumar,+918864913069,,,90,Lost,Fhirozabad ..,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10889,Priya,+917880920905,,,90,Lost,Jaunpur utter pradesh,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10890,Riteeka Koiri,+917980103328,,,98,Lost,Kolkata,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10891,Sati devi,+918890640167,,,98,Lost,Barmer,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10892,Dinesh Kumar,+919193276285,,,98,Lost,Fhirozabad,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10893,Riya jaiswal,+917007047937,,,98,Lost,Kangra,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10894,Puja das,+916371739733,,,98,Lost,Odisha,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10895,Shivani,+916399852058,,,98,Lost,Bareilly,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10896,Kirti khamkar,+917387247658,,,15,New,Pune,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10897,Deepak Kumar,+917818885136,,,15,Paid ₹196,Chandausi,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10898,Priyanshu Kannaujiya,+918468077518,,,15,Lost,Varanasi,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10899,Alsunika marandi,+916382029819,,,15,Lost,Bihar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10900,Dhruv Singh,+919399407255,,,15,Lost,Rau Circle,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10901,Tanya,+919810691746,,,15,Invited,New delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10902,Reena saini,+919521051103,,,15,Lost,Jaipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10903,Sanjana raval,+919376498128,,,15,Lost,Sirohi Rajasthan,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10904,Madhuri singh,+919799330358,,,15,New,Jaipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10905,Kinjal laheri,+919265549443,,,15,New,Juna savar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10906,Amrin khan,+919784681269,,,15,New,Churu,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10907,Anjali Singh,+917903175397,,,15,New,Chapra (Bihar),"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10908,Krishna Dutta,+919998308194,,,15,New,Ankleshwar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10909,Anuradha Gupta,+918700878044,,,15,New,Ghaziabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10910,Sangeeta Patel,+917400145720,,,15,New,Mumbai,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10911,Ravya sharma,+919259058515,,,12,Contacted,Jagner,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10912,Jaya Kiran,+919170124566,,,12,Contacted,Varanasi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10913,Ritika saraswat,+917906212729,,,12,Video Watched,Mathura,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10914,Annu,+918210752233,,,12,Video Sent,Dhanbad Jharkhand,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10915,Sonia,+919053485722,,,12,Contacted,Haryana,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10916,Anchal kashyap,+918368213317,,,12,Lost,Ghaziabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10917,Anshu Rana,+918210481903,,,12,Contacted,Bhagalpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10918,Neha kumari,+919279600229,,,12,Contacted,Samstipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10919,Anvi,+918882294720,,,12,Lost,Ghaziabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10920,Anjali gour,+919368351974,,,12,Lost,Khurja,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10921,Arpita kalal,+918005998037,,,12,Video Sent,Udaipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10922,Jayanti,+917380598816,,,12,Video Watched,Lucknow,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10923,Varun Thakur,+917018953462,,,12,Contacted,Himachal pradesh,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10924,Banti rawat,+919425759716,,,12,Contacted,Sabalagarh,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10925,Kavya,+919899590686,,,12,Contacted,New Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10926,Sapna,+917347634178,,,12,Paid ₹196,Ludhiana,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10927,Rishika bandejiya,+918923181709,,,12,Invited,Agra,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10928,Nandani Kumari,+919693365557,,,12,Invited,Bhagalpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10929,Anushka Gupta,+916306917133,,,94,Day 1,Gorakhpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10930,Aditi,+917827473452,,,94,Contacted,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10931,Ritika Chambyal,+919103160508,,,94,Contacted,Kathua,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10932,Priyanshu Sajwan,+917983678423,,,94,Contacted,Dehradun,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10933,Mohani Kumari,+917320013724,,,94,Lost,Muzaffarpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10934,Smita Kujur,+917478747855,,,34,Contacted,Mumbai,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10935,Anjali singh,+918933997023,,,34,Contacted,Ballia jila,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10936,Khushi verma,+917869530227,,,34,Contacted,Indore,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10937,Garima sharma,+917590936764,,,34,Contacted,Shimla,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10938,Priyanka Dubey,+919330199368,,,34,Video Sent,Kolkata,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10939,Siddhi,+919643502535,,,14,Lost,Delhi kamla nagar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10940,Alakhh,+916281174170,,,14,Video Watched,Mumbai,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10941,Saloni kashyap,+918445166843,,,14,Lost,Meerut (UP),"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10942,Aryan,+918171371172,,,14,Contacted,Saharanpur,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10943,Ritika yadav,+919792030976,,,14,Lost,Ballia,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10944,Shukra Mantra,+919548147064,,,14,Contacted,Hf,"Gender: Male | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10945,Neha,+916367542820,,,14,Lost,Bhiwadi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10946,Goldi tiwari,+918052186479,,,14,Lost,Gonda Uttar Pradesh,"Gender: Female | Submit Time: 16/04/26",2026-04-16 07:47:06,,0
10947,Nida khan,+919343179382,,,18,Lost,Bhopal,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10948,Pooja,+919896157952,,,18,Lost,Haryana,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10949,Prince gupta,+917757957452,,,18,Lost,Maharashtra,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10950,Nidakhan,+919399352940,,,18,Lost,Bhopal,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10951,Rohit Pal,+918850937908,,,18,Lost,Pubjab,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10952,Suhana Fatima,+919232038207,,,18,Lost,Chhatarpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10953,Sakshi raju berad,+918767022667,,,18,Lost,Ahamadnsgar bhingar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10954,Tanishq Maji,+916289379017,,,18,Lost,Kolkata,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10955,Gayatri Raut,+919673422580,,,18,Lost,Goregaon,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10956,Diyaba shinol,+919274908538,,,15,Inactive,Ahmedabad Gujarat,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10957,Vandana Tyagi,+916397384818,,,18,Lost,Meerut,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10958,Pratima Bairagi,+919529239172,,,18,Lost,Nashik,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10959,Himanshi gaidhane,+917498950028,,,18,Lost,Saoner,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10960,Mehak,+919238607559,,,18,Lost,Bhopal,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10961,K Priya,+919229543982,,,18,Lost,Patna,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10962,Alok Nishad,+919335866259,,,30,Lost,12345,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10963,Rima Minji,+919002335689,,,30,Contacted,Berhampore,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10964,Monika saini,+917906124366,,,30,Lost,Fatehpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10965,Tanishi gupta,+918707059947,,,30,Contacted,Mirzapur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10966,Nayaka truptiben gopalbhai,+918320228645,,,30,Contacted,Jambughoda,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10967,Shabnam parween,+917631061565,,,30,Contacted,Jharkhand,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10968,Abhilasha kurmi,+919201038036,,,30,Lost,Garahakot,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10969,Nikhil,+919265195502,,,30,Contacted,Kheda,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10970,devash254,+919027561079,,,30,Lost,Gandhidham Kutch Gujarat,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10971,Bhavya Saini,+917906890152,,,30,Lost,Meerut,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10972,Ravi Ranjan Singh,+917762993129,,,30,Contacted,Muzaffapur,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10973,Neha mishra,+919648464873,,,30,Lost,Vsranasi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10974,asha Kumari,+919162577768,,,30,Contacted,Nagochhiya,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10975,Mukesh Jamre,+917089924532,,,30,Contacted,Akoliya Pithampur Dhar,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10976,Sandhya rani Giri,+917381446701,,,30,Contacted,Balasore,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10977,Shivani Kumari,+918002925469,,,53,Contacted,Gopalganj,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10978,Saurabh Kumar,+917054930080,,,53,New,Nibawar darauta lalpur,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10979,Raj bhai,+919875222152,,,53,Lost,India,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10980,Ankita yadav,+919329084286,,,53,Video Watched,Chhatarpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10981,Neha chouchan,+918447646922,,,53,Video Sent,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10982,Madhani anjali,+919638708214,,,53,Lost,Wankaner,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10983,Avi rawat,+916397210445,,,53,Video Sent,Bilaspur,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10984,Simmi Tomar,+919953805301,,,53,New,Ghaziabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10985,Jignaben Ugharejiya,+917862091870,,,53,Video Sent,Chotila,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10986,Madhani riddhi,+916352756908,,,53,Lost,Wankaner,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10987,Ankit sahu,+917256847509,,,53,New,Ghaziabad,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10988,Chetna Bisht,+916398659721,,,53,Lost,Haldwani,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10989,Abhilasha kumari,+917903737769,,,53,Contacted,Muzaffarpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10990,Priyanka shekhawat,+916375356742,,,53,Video Watched,Jaipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10991,Vaidavi Naik,+918767515793,,,53,Contacted,Goa,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10992,Monu Sankhla,+919928844770,,,7,Contacted,Jodhpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10993,Jaspreet kaur,+919814073656,,,7,Contacted,Makhu,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10994,pallavi bhati,+918824505076,,,7,Contacted,Jaipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10995,Khushi Singh,+919334360191,,,7,Contacted,Ranchi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10996,Suhani Rai,+918176919906,,,7,Contacted,Mau,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10997,Roshni,+919960961932,,,7,Video Sent,Bhiwandi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10998,Sameer,+917999100195,,,7,Video Sent,Bhopal,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
10999,Vala bhavisha,+919265048965,,,7,Invited,Botad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11000,Priya rajput,+918679496148,,,7,Contacted,Tentigaon,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11001,Renu,+917982690235,,,7,Invited,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11002,Vaishnavi Shukla,+916351326084,,,7,Inactive,Ahemdabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11003,Roshni Gupta,+917003634775,,,7,Contacted,Ghaziabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11004,P Bhumika,+918260325455,,,7,Invited,Odisha Koraput,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11005,Shivani Sharma,+919313720369,,,7,Lost,Ahmedabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11006,Riya Patel,+919586972006,,,7,Lost,Aklacha,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11007,Sanaya roy,+917668230585,,,34,Contacted,Firozabad,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11008,Muskan Prajapat,+919929847654,,,34,Contacted,Baran,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11009,Shrushti more,+918828505941,,,34,Contacted,Navi Mumbai,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11010,Kiran kumari,+917427851189,,,34,Contacted,Patna,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11011,Anish,+919810993299,,,34,Contacted,Ghaziabad,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11012,Gyarsi dangi,+919303240714,,,34,Contacted,Kashikhedi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11013,Anjali Gupta,+919517312529,,,34,Contacted,Prayagraj,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11014,Sonam yadav,+919250667994,,,34,Contacted,Uttar pradesh,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11015,Rukhsar,+916299391035,,,34,Contacted,Bahadurganj,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11016,Rubina khan,+918815146896,,,34,Contacted,Mumbai,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11017,Chanchal kaushik,+917974594733,,,8,Invited,Jaipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11018,Seemu,+916375077003,,,8,Contacted,Swm,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11019,Chetan maheshwari,+917985092603,,,8,Contacted,Surat,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11020,Madhan Singh,+918265919156,,,8,Contacted,Etah,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11021,Anchaldeep kaur,+919855669713,,,8,Contacted,Kharar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11022,Aarti Chaudhari,+919818394205,,,8,Lost,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11023,Asmita,+919260985394,,,8,New,Home,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11024,Roma Bhadauria,+917376784331,,,8,Contacted,Kanpur Nagar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11025,Aamna Khan,+918273850340,,,8,Contacted,Saharanpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11026,Anuradha pandey,+919241567885,,,8,Contacted,patna,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11027,Palakdeep kaur,+919877946676,,,8,New,Panchkula,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11028,Nikita ahirwar,+919244305985,,,8,New,Ganj basoda,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11029,pari Verma,+917014100280,,,8,Contacted,Alwar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11030,Anjali,+919336780081,,,8,New,Kanpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11031,Parul patel,+919713573936,,,8,Contacted,Sidhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11032,Manju,+919034525728,,,8,Contacted,Tohana,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11033,Sandhya Chaudhary,+917506119331,,,8,New,Jaipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11034,Monisha Das,+916204906564,,,8,New,Jamtara Jharkhand,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11035,Palak Sonkar,+919616638573,,,34,Contacted,Varanasi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11036,Soumya Jani,+917877226927,,,34,Contacted,Anand,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11037,Swapan Kumar,+919334655127,,,34,Contacted,Jamshedpur,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11038,Lande Vaishnavi mohan,+918010983026,,,34,Contacted,Ahilyanagar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11039,Saniya,+917217830184,,,34,Contacted,Shimla,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11040,Tarun Kumar,+919719601979,,,24,Lost,Chandpur,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11041,Rina parvin,+919220737693,,,24,Lost,noida,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11042,Sneha jain,+918356972457,,,24,Lost,Mumbai,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11043,Mansi Raturi,+918532920882,,,24,Lost,Rishikesh,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11044,Akash dhakad,+917566583905,,,24,Lost,Aron,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11045,Tanya Verma,+919508034368,,,24,Lost,Ranchi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11046,Richa tripathi,+918890066246,,,24,Lost,Bhopal,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11047,Siya,+916375446891,,,24,Lost,Bhiwadi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11048,Puja,+919873044148,,,14,Lost,Delhi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11049,Khushi maurya,+919427967389,,,25,Contacted,Surat,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11050,Priyanka Meena,+918000371732,,,25,Contacted,Alwar,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11051,Kapoor,+919317955124,,,25,Contacted,Hp,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11052,Munia Sultana,+919863911790,,,25,Contacted,Kumarghat,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11053,Palak Athwani,+918103789081,,,25,Contacted,Raipur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11054,Khushi,+918470881200,,,25,Contacted,Jaunpur,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11055,Rehnuma,+919520402018,,,25,Contacted,Amroha,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11056,Shalini yadav,+918305761299,,,25,Contacted,Indore,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11057,Kajal dubey,+918738889800,,,25,Contacted,Mirzapur uttar Pradesh,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11058,Palak gadhvi,+919274507822,,,25,Contacted,Gujrat,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11059,Sehnajparveen,+919229608076,,,95,Lost,Panchkula,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11060,Khushi,+918209762292,,,95,Lost,Bhilwara,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11061,Reman,+918307875121,,,95,Day 2,Hansi,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11062,Shreya Phatak,+919022803849,,,95,Lost,Pen,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11063,Paras,+919646806709,,,95,Lost,Pathankot,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11064,Arti Shaw,+919334946550,,,95,Lost,Gaya,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11065,Karan Ambala,+918591266214,,,26,Lost,Mumbai,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11066,Vinita Rajput,+917440959634,,,27,Contacted,Madhya Pradesh,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11067,Laxmi,+917877828146,,,27,Retarget,Siwana,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11068,Komal ydav,+917379718701,,,27,Video Sent,Up,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11069,Sakshi Ravindra Rajput,+919309282165,,,27,Retarget,Pune,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11070,Nihal Tirkey,+918102683635,,,27,Contacted,Ranchi,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11071,Priyanka Dharmadhikari,+919923635453,,,27,Contacted,Pune,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11072,Chetna raut,+918788931296,,,27,Contacted,Parsioni,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11073,Muskan,+917068116466,,,27,Lost,Gkp,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11074,Jiya,+919805713207,,,27,Video Sent,Shimla,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11075,Harshit,+918953220551,,,27,Video Sent,Noida,"Gender: Male | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11076,Chhaya,+918755428381,,,27,Contacted,Aligarh,"Gender: Female | Submit Time: 16/04/26",2026-04-16 08:55:50,,0
11077,Sanjnana Singh,9608455936,,,66,Lost,Lucknow,,2026-04-16 09:19:07,,0
11078,Sangita Kumari,6204753163,,,66,Lost,Narkatiaganj bihar,,2026-04-16 09:19:07,,0
11079,Smita anil shinde,8421323377,,,66,Lost,Pune,,2026-04-16 09:19:07,,0
11080,Sakshi,9671571270,,,66,Lost,Sonipat,,2026-04-16 09:19:07,,0
11081,Shreya Singh,9956598893,,,66,Lost,Meerut,,2026-04-16 09:19:07,,0
11082,Ankit Jaiswal,6388826602,,,66,Lost,Gorakhpur,,2026-04-16 09:19:07,,0
11083,Ambika,9217066179,,,66,Contacted,Noida,,2026-04-16 09:19:36,,0
11084,disha,6284713228,,,66,Lost,Kharar,,2026-04-16 09:19:36,,0
11085,Rani Tiwari,9584977072,,,66,Lost,,,2026-04-16 09:19:36,,0
11086,Shital Prashant narute,8600946382,,,66,Lost,Baramati,,2026-04-16 09:19:36,,0
11087,Shreya Singh,7897983304,,,66,Lost,Meerut,,2026-04-16 09:19:36,,0
11088,Aditya Gautam,8219478342,,,66,Lost,Kullu,,2026-04-16 09:19:36,,0
11089,Himanshu,9588957247,,,66,Video Sent,Ganganagar,,2026-04-16 09:20:02,,0
11090,Siha poonam Khairnar,7738049092,,,66,Lost,Mumbai,,2026-04-16 09:20:02,,0
11091,Radhika Rajput,8287810705,,,66,Lost,Faridabad,,2026-04-16 09:20:02,,0
11092,Keshav,9873325844,,,66,Contacted,Delhi,,2026-04-16 09:20:02,,0
11093,Pardeep kaur,8360450406,,,66,Lost,Punjab,,2026-04-16 09:20:02,,0
11094,Rashmi Taral,7775980770,,,66,Lost,Pune,,2026-04-16 09:20:02,,0
11095,Fiza Rangrez,9711432106,,,77,Lost,Gaziyabaad,,2026-04-16 09:44:55,,0
11096,Prabh,8826269893,,,77,Lost,Delhi,,2026-04-16 09:44:55,,0
11097,Tamanna Kumari,9113436396,,,77,Lost,Patna,,2026-04-16 09:44:55,,0
11098,Amol Jayram Demase,7218863278,,,77,Lost,Nashik,,2026-04-16 09:44:55,,0
11099,Arman katoch,8091826513,,,77,Lost,Jaisinghpur,,2026-04-16 09:44:55,,0
11100,Bhuva Ajay,8128038825,,,77,Lost,Keshod,,2026-04-16 09:44:55,,0
11101,Vishwanath,7839705141,,,77,Lost,Ayodhya,,2026-04-16 09:45:14,,0
11102,Pooja Rasane,9322868664,,,77,Lost,Sangamner,,2026-04-16 09:45:14,,0
11103,Nikita,7015421410,,,77,Lost,Sirsa,,2026-04-16 09:45:14,,0
11104,Saloni,8920703096,,,77,Lost,Gurugram,,2026-04-16 09:45:14,,0
11105,Mahima Badhrotiya,7820940406,,,77,Lost,Nagpur,,2026-04-16 09:45:14,,0
11106,Pooja ghode,7387699082,,,77,Lost,Nashik,,2026-04-16 09:45:14,,0
11107,Vohra Adnan,8128242301,,,77,Lost,Nadiad,,2026-04-16 09:45:25,,0
11108,Rani Sharma,9310689301,,,77,Lost,Haryana,,2026-04-16 09:45:25,,0
11109,Khushi,7088573188,,,77,Lost,Moradabad,,2026-04-16 09:45:25,,0
11110,Rohit sohi,9813371043,,,77,Lost,Kurukshetra,,2026-04-16 09:45:25,,0
11111,Nandini,9084383302,,,77,Lost,Haridwar,,2026-04-16 09:45:25,,0
11112,Kabita Hembrom,9707266312,,,77,Lost,Silchar,,2026-04-16 09:45:25,,0
11191,Rakhi choudhary,+917376914815,,,100,New,Jhansi,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11192,Rahat upadhyay,+918445383968,,,29,Contacted,Shikohabad,"Gender: Male | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11193,Priya,+919528168372,,,29,Contacted,Muzaffarnagar,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11194,Sabi Fatima,+918687254847,,,29,Contacted,Sitapur,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11195,Gautam Kumar,+918340595499,,,29,Contacted,Patna,"Gender: Male | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11196,Priyanka,+919817324859,,,29,Contacted,Ballabhgarhe faridabad,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11197,Simmi madeshiya,+919324174901,,,29,Video Sent,Mumbai,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11198,Jiya roy,+919301037238,,,29,Contacted,Bagdona,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11199,Sumaira,+919170746613,,,29,Retarget,Shajhnapur,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11200,Ganga,+918272066482,,,29,Contacted,Uttrakhand,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11201,Yogita Gola,+917017032141,,,29,Contacted,Agra,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11202,Satyam Tiwari,+917678549480,,,29,Contacted,Noida,"Gender: Male | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11203,Himanshi Bhatt,+919012750636,,,29,Contacted,Pithoragarh,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11204,Rajveeer kaur,+917814675257,,,100,Contacted,Sirhind,"Gender: Female | Submit Time: 17/04/26",2026-04-17 08:33:26,,0
11430,Pawan Kumar,+917347843457,,,100,Contacted,Bisalpur,"Gender: Male | Submit Time: 17/04/26",2026-04-17 11:19:27,,0
11567,Simran Sharma,+918420691107,,,100,Day 1,Howrah,"Gender: Female | Submit Time: 17/04/26",2026-04-18 08:04:07,,0
11736,THOMBARE VISHWANATH,+917083196412,,,100,Lost,Basmath,"Gender: Male | Submit Time: 18/04/26",2026-04-18 08:04:07,,0
11737,Ankit Hora,+917503956605,,,100,Contacted,Delhi,"Gender: Male | Submit Time: 18/04/26",2026-04-18 08:04:07,,0
"""

# ── Connect ─────────────────────────────────────────────────────────────────
print("Connecting to PostgreSQL...")
conn = psycopg2.connect(db_url)
conn.autocommit = False
cur = conn.cursor()

# ── Load existing users (fbo_id → new DB id) ───────────────────────────────
cur.execute("SELECT id, fbo_id, username FROM users")
existing = {row[1]: row[0] for row in cur.fetchall()}
existing_by_username = {}
cur.execute("SELECT id, username FROM users WHERE username IS NOT NULL")
for row in cur.fetchall():
    existing_by_username[row[1].lower()] = row[0]

print(f"Existing users in new DB: {len(existing)}")

# ── Read /tmp/users_export.csv ─────────────────────────────────────────────
USERS_CSV_PATH = "/tmp/users_export.csv"
users_inserted = 0
old_id_to_new_id: dict[int, int] = {}

# Map existing users first
for fbo_id, new_id in existing.items():
    # we'll complete old→new mapping after reading CSV
    pass

if os.path.exists(USERS_CSV_PATH):
    print(f"Reading {USERS_CSV_PATH}...")
    with open(USERS_CSV_PATH) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    print(f"  {len(rows)} users in CSV")

    hashed_pw = pwd_ctx.hash(DEFAULT_PASSWORD)

    # First pass: insert users (no upline yet)
    for row in rows:
        old_id = int(row["id"])
        fbo_id = row["fbo_id"].strip().lower()
        username = row["username"].strip() if row["username"].strip() else None
        role = row["role"].strip() or "member"
        email = row["email"].strip() or f"{fbo_id}@myle.app"
        phone = row["phone"].strip() or None
        name = username
        training_req = row.get("training_required", "0").strip() in ("1", "True", "true")
        training_status = row.get("training_status", "not_required").strip() or "not_required"
        joining_date = row.get("joining_date", "").strip() or None

        if fbo_id in existing:
            old_id_to_new_id[old_id] = existing[fbo_id]
            print(f"  Skip existing: {fbo_id}")
            continue

        try:
            cur.execute("""
                INSERT INTO users (fbo_id, username, email, role, hashed_password,
                    training_required, training_status, name, phone, joining_date,
                    registration_status, discipline_status, access_blocked)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'approved', 'active', false)
                ON CONFLICT (fbo_id) DO NOTHING
                RETURNING id
            """, (fbo_id, username, email, role, hashed_pw,
                  training_req, training_status, name, phone, joining_date or None))
            result = cur.fetchone()
            if result:
                new_id_val = result[0]
                old_id_to_new_id[old_id] = new_id_val
                existing[fbo_id] = new_id_val
                users_inserted += 1
            else:
                # conflict — fetch id
                cur.execute("SELECT id FROM users WHERE fbo_id=%s", (fbo_id,))
                r = cur.fetchone()
                if r:
                    old_id_to_new_id[old_id] = r[0]
        except Exception as e:
            print(f"  ERROR inserting user {fbo_id}: {e}")
            conn.rollback()
            continue

    conn.commit()
    print(f"Users inserted: {users_inserted}")

    # Second pass: update upline_user_id
    upline_updated = 0
    for row in rows:
        old_id = int(row["id"])
        upline_username = row.get("upline_username", "").strip()
        if not upline_username:
            continue
        new_user_id = old_id_to_new_id.get(old_id)
        upline_new_id = existing_by_username.get(upline_username.lower())
        if not upline_new_id:
            # try re-fetching
            cur.execute("SELECT id FROM users WHERE LOWER(username)=%s", (upline_username.lower(),))
            r = cur.fetchone()
            upline_new_id = r[0] if r else None
        if new_user_id and upline_new_id:
            cur.execute("UPDATE users SET upline_user_id=%s WHERE id=%s AND upline_user_id IS NULL",
                       (upline_new_id, new_user_id))
            upline_updated += 1
    conn.commit()
    print(f"Uplines set: {upline_updated}")
else:
    print(f"WARNING: {USERS_CSV_PATH} not found — skipping user migration, using existing users only")
    cur.execute("SELECT id, fbo_id FROM users")
    for row in cur.fetchall():
        old_id_to_new_id[row[0]] = row[0]  # fallback: new id = new id (not old)

# ── Parse and insert leads ─────────────────────────────────────────────────
print("\nMigrating leads...")

# We need a fallback owner for leads whose old_user_id can't be mapped
cur.execute("SELECT id FROM users WHERE role='admin' LIMIT 1")
admin_row = cur.fetchone()
admin_id = admin_row[0] if admin_row else 1

leads_rows = []
reader = csv.reader(io.StringIO(LEADS_CSV.strip()))
skipped = 0
for row in reader:
    if len(row) < 9:
        continue
    try:
        old_lead_id = int(row[0])
        name = row[1].strip()
        phone_raw = str(row[2]).strip()
        old_user_id = int(row[5]) if row[5].strip() else 0
        status_raw = row[6].strip()
        city = row[7].strip() or None
        notes_raw = row[8].strip()
        created_at_str = row[9].strip()

        # phone normalise
        phone = re.sub(r'\s+', '', phone_raw)
        if not phone.startswith('+') and len(phone) == 10:
            phone = '+91' + phone
        phone = phone[:20] if phone else None

        gender = parse_gender(notes_raw)
        notes = parse_notes(notes_raw)
        status = map_status(status_raw)

        # map owner
        new_owner_id = old_id_to_new_id.get(old_user_id, admin_id)

        # parse created_at
        try:
            created_at = datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except Exception:
            created_at = datetime.now(timezone.utc)

        if not name:
            skipped += 1
            continue

        leads_rows.append((
            name, phone, city, gender, status,
            new_owner_id, new_owner_id,  # created_by, assigned_to
            created_at, notes,
        ))
    except Exception as e:
        print(f"  Row parse error: {e} | row={row[:4]}")
        skipped += 1

print(f"  Leads to insert: {len(leads_rows)} (skipped: {skipped})")

if leads_rows:
    execute_values(cur, """
        INSERT INTO leads
            (name, phone, city, gender, status,
             created_by_user_id, assigned_to_user_id,
             created_at, notes)
        VALUES %s
    """, leads_rows, page_size=200)
    conn.commit()
    print(f"  Leads inserted: {len(leads_rows)}")

cur.close()
conn.close()
print("\nMigration complete.")
