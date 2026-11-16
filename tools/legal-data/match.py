import json, re, difflib
rows = [r for r in json.load(open("out/muammo_raw.json")) if r[0] not in ("№","")]
docs = json.load(open("out/docs.json"))
def norm(s):
    s = s.lower().replace("‘","'").replace("’","'").replace("ʻ","'")
    s = re.sub(r"[^a-z' ]", " ", s)
    return " ".join(w[:6] for w in s.split())
def best(title, items, key):
    sc = [(difflib.SequenceMatcher(None, norm(title), norm(it[key])).ratio(), it) for it in items]
    sc.sort(key=lambda x: -x[0]); return sc[0]
res = []
for i, r in enumerate(rows, 1):
    s = best(r[1], docs["stories"], "title"); t = best(r[1], docs["templates"], "title")
    res.append({"row": r[0], "title": r[1], "story": s[1]["n"], "s_score": round(s[0],2), "tpl": t[1]["n"], "t_score": round(t[0],2)})
    print(f'{r[0]:>4} {r[1][:42]:42} S{s[1]["n"]:>2}({s[0]:.2f}) {s[1]["title"][:30]:30} T{t[1]["n"]:>2}({t[0]:.2f}) {t[1]["title"][:30]}')
json.dump(res, open("out/match.json","w"), ensure_ascii=False, indent=1)
