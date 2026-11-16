# -*- coding: utf-8 -*-
"""Hamma ma'lumotni yig'ib, data/ papkasini yaratadi."""
import csv, json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from catalog import SOHALAR, IDORALAR
from problems_base import BASE
from problems_new import NEW, P50_STORY
from variants import V

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data")
os.makedirs(os.path.join(OUT, "templates"), exist_ok=True)
docs = json.load(open(os.path.join(ROOT, "out/docs.json"), encoding="utf8"))
S = {s["n"]: s for s in docs["stories"]}
TPL = {t["n"]: t for t in docs["templates"]}

def apo(s):  # apostroflarni bir xil qilish
    return s.replace("’", "'").replace("‘", "'").replace("ʻ", "'").replace("ʼ", "'").replace("`", "'")

def tpl_from_pdf(t):
    """Ariza namunasini maydonli shablonga aylantirish."""
    body = t["body"]
    kimga = t["kimga"]
    lines = body.split("\n")
    # sarlavha (ARIZA / DA'VO ARIZASI / MUROJAAT) dan oldingi qatorlar Kimga davomi
    head_i = next((i for i, l in enumerate(lines) if l.strip() and l.strip().upper() == l.strip() and len(l.strip()) < 30 and re.search(r"[A-Z]", l)), 0)
    if head_i:
        kimga = (kimga + " " + " ".join(l.strip() for l in lines[:head_i])).strip()
    sarlavha = lines[head_i].strip()
    text = "\n".join(lines[head_i + 1:])
    # PDF qator ko'chishlarini birlashtirish: bo'sh qator — yangi xatboshi
    paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n|\n(?=Ilova:|Sana:|Jumladan|Mazkur|Holat|Ushbu|Vaziyat|Natijada|Qarz|Biroq)", text) if p.strip()]
    text = "\n\n".join(paras)
    n = {"i": 0}
    def gen(_m):
        n["i"] += 1
        return "{{malumot_%d}}" % n["i"]
    rules = [
        (r"Men,\s*_+", "Men, {{fio}}"),
        (r"\d{4}-yil\s*-?\s*_*\s*kuni", "{{sana}} kuni"),
        (r"_+\s*(so[‘'’]m)", r"{{summa}} \1"),
        (r"(fuqaro)\s*_+", r"\1 {{qarshi_taraf}}"),
        (r"_+\s*(manzil)", r"{{manzil}} \1"),
        (r"_+\s*(joyda)", r"{{joy}} \1"),
        (r"_+\s*(ismli)", r"{{shaxs}} \1"),
        (r"Sana:\s*_+\s*Imzo:\s*_+", "Sana: {{ariza_sanasi}}    Imzo: @IMZO@"),
    ]
    for a, b in rules:
        text = re.sub(a, b, text)
    text = re.sub(r"_{3,}", gen, text)
    text = text.replace("@IMZO@", "__________")
    # o'zbek qo'shimchasi maydonga yopishadi: "{{x}} ga" -> "{{x}}ga"
    text = re.sub(r"\}\}\s+(ga|dan|ning|ni|da|ning)\b", r"}}\1", text)
    return dict(kimga=kimga.rstrip("."), sarlavha=sarlavha, body=text)

def header(kimga, sarlavha):
    return f"Kimga: {kimga}\nKimdan: {{{{fio}}}}, {{{{manzil}}}}, tel.: {{{{telefon}}}}\n\n{sarlavha}\n\n"

problems, stories, templates = [], [], []
for b in BASE:
    t = tpl_from_pdf(TPL[b["tpl"]])
    tid = f"T{b['id'][1:]}"
    templates.append(dict(id=tid, problem_id=b["id"], **t))
    st = [S[k] for k in b["stories"]] if b["stories"] else [dict(fuqaro=P50_STORY["fuqaro"], text=P50_STORY["text"])]
    for i, s in enumerate(st, 1):
        stories.append(dict(id=f"{b['id']}-A{i}", problem_id=b["id"], uslub="rasmiy", hudud="", manba="do'st" if b["stories"] else "yangi", fuqaro=s["fuqaro"], matn=s["text"]))
    problems.append({k: v for k, v in b.items() if k not in ("stories", "tpl")} | {"shablon_id": tid, "manba": "do'st jadvali"})
for x in NEW:
    tid = f"T{x['id'][1:]}"
    templates.append(dict(id=tid, problem_id=x["id"], **x["template"]))
    stories.append(dict(id=f"{x['id']}-A1", problem_id=x["id"], uslub="rasmiy", hudud="", manba="yangi", fuqaro=x["story"]["fuqaro"], matn=x["story"]["text"]))
    problems.append({k: v for k, v in x.items() if k not in ("story", "template")} | {"shablon_id": tid, "manba": "yangi"})

for p in problems:
    for i, (uslub, hudud, matn) in enumerate(V[p["id"]], 1):
        stories.append(dict(id=f"{p['id']}-V{i}", problem_id=p["id"], uslub=uslub, hudud=hudud, manba="yangi", fuqaro="", matn=matn))

# --- tekshiruvlar
ids = {p["id"] for p in problems}
assert len(ids) == len(problems) == 65, len(problems)
for p in problems:
    assert p["soha"] in SOHALAR, p
    for o in p["organlar"] + p["eskalatsiya"] + p["hali_erta"]:
        assert o in IDORALAR, (p["id"], o)
    assert p["id"] in V and len(V[p["id"]]) == 3, p["id"]

# --- yozish
P = {p["id"]: p for p in problems}
json.dump(dict(versiya="2026-11-15", sohalar=SOHALAR,
               idoralar={k: dict(nomi=v[0], telefon=v[1], havola=v[2], izoh=v[3], tekshir=v[4]) for k, v in IDORALAR.items()},
               muammolar=problems), open(os.path.join(OUT, "problems.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)

with open(os.path.join(OUT, "agencies.csv"), "w", encoding="utf8", newline="") as f:
    w = csv.writer(f); w.writerow(["id","nomi","vakolati","shugullanmaydi","kanal","telefon","javob_muddati","manba"])
    for k, v in IDORALAR.items():
        w.writerow([k, v[0], v[3], "", v[2], v[1], "", "⚠️ tekshirilsin" if v[4] else ""])

risk_uz = dict(red="qizil", orange="to'q sariq", yellow="sariq", green="yashil")
with open(os.path.join(OUT, "test_cases.csv"), "w", encoding="utf8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["id","soha","hikoya","xavf","birinchi_idora","hali_erta","moddalar","foydalanuvchi_xatosi","izoh","problem_id","uslub","hudud"])
    for s in stories:
        p = P[s["problem_id"]]
        first = next((o for o in p["organlar"] if o != "qarshi_taraf"), p["organlar"][0])
        mistake = next((t for t in p["tekshir"] if "Haqiqat ko'zgusi" in t), "")
        w.writerow([s["id"].replace("-", "_"), p["soha"], s["matn"], risk_uz[p["xavf"]], first, ";".join(p["hali_erta"]),
                    "; ".join(p["qonunlar"]), mistake, s["manba"], p["id"], s["uslub"], s["hudud"]])

for t in templates:
    p = P[t["problem_id"]]
    md = f"<!-- {t['id']} · {p['nom']} -->\n" + header(t["kimga"], t["sarlavha"]) + t["body"].strip() + "\n"
    open(os.path.join(OUT, "templates", f"{t['id']}.md"), "w", encoding="utf8").write(md)

json.dump(stories, open(os.path.join(ROOT, "out/stories.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
json.dump(templates, open(os.path.join(ROOT, "out/templates.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)

# --- tekshirish ro'yxati
lines = ["# Tekshirish ro'yxati (Mirjalol uchun)", "",
         "Bu ro'yxatdagi har bir band lex.uz yoki rasmiy saytda tekshirilishi kerak. Tekshirilgach, `problems.json` dagi `tekshir` maydonidan o'chiriladi.", "",
         "## Umumiy", "",
         "- [ ] Do'st jadvalidagi barcha telefon raqamlari va havolalar rasmiy saytlarda tekshirilsin (ba'zi havolalarda `utm_source=chatgpt.com` bor edi — ma'lumot ChatGPT'dan olingan bo'lishi mumkin).",
         "- [ ] Fuqarolik sudlari uchun berilgan +998 71 207-73-77 va +998 71 207-97-37 raqamlari qaysi sudga tegishli ekanini aniqlash.",
         "- [ ] P51–P65 (yangi turlar) uchun aniq modda raqamlarini qo'shish.", "",
         "## Muammo turlari bo'yicha", ""]
for p in problems:
    if p["tekshir"]:
        lines.append(f"### {p['id']} · {p['nom']}")
        lines += [f"- [ ] {t}" for t in p["tekshir"]]
        lines.append("")
lines += ["## Idoralar", ""]
lines += [f"- [ ] `{k}` — {v[0]}: telefon/havola" for k, v in IDORALAR.items() if v[4]]
open(os.path.join(OUT, "TEKSHIRISH.md"), "w", encoding="utf8").write("\n".join(lines) + "\n")

print("muammolar:", len(problems), "| hikoyalar:", len(stories), "| shablonlar:", len(templates))
from collections import Counter
print(Counter(s["uslub"] for s in stories))
print(Counter(p["soha"] for p in problems))
