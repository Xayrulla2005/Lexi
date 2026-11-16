import re, json, sys
def blocks(path, footer):
    txt = open(path, encoding="utf8").read()
    txt = re.sub(footer + r"\s*\d+", "", txt)
    txt = txt.replace("\f", "\n")
    lines = [l.rstrip() for l in txt.split("\n")]
    out, cur = [], None
    for l in lines:
        m = re.match(r"^\s*(\d+)\.\s+(.+)$", l)
        if m and not l.strip().startswith(tuple(f"{i}." for i in range(1,4))+("1.","2.","3.")) or (m and len(l) < 120 and not out_body_line(l)):
            pass
        if m and is_header(l):
            cur = {"n": int(m.group(1)), "title": m.group(2).strip(), "lines": []}
            out.append(cur)
        elif cur is not None:
            cur["lines"].append(l)
    return out
def out_body_line(l): return False
def is_header(l):
    s = l.strip()
    # sarlavha: raqam + nuqta + bosh harf, qisqa, nuqta bilan tugamaydigan yoki sarlavhaga o'xshash
    return bool(re.match(r"^\d{1,2}\.\s+[A-ZÀ-ÿʻ’'O‘G‘]", s)) and len(s) < 110 and not s.endswith(",")
st = blocks("out/hikoya.txt", "Hikoyalar")
ar = blocks("out/ariza.txt", "Arizalar namunalari")
def clean(lines):
    t = "\n".join(lines)
    t = t.replace("Написание текста", "")
    t = re.sub(r"\n?[IVX]+\.\s+[A-Z][^\n]*\n", "\n", t)   # bo'lim sarlavhalari
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    return t
stories = []
for b in st:
    t = clean(b["lines"])
    m = re.match(r"(?:(.*?)\n)?\s*Fuqaro:\s*(.+?)\n(.*)", t, re.S)
    extra, name, body = (m.group(1) or "", m.group(2).strip(), m.group(3)) if m else ("", "", t)
    title = (b["title"] + " " + extra).strip()
    body = re.sub(r"\s*\n\s*", " ", body).strip()
    stories.append({"n": b["n"], "title": title, "fuqaro": name, "text": body})
templates = []
for b in ar:
    t = clean(b["lines"])
    m = re.match(r"(?:(.*?)\n)?\s*Kimga:\s*(.+?)\n(.*)", t, re.S)
    extra, kimga, body = (m.group(1) or "", m.group(2).strip(), m.group(3)) if m else ("", "", t)
    # Kimga ikki qatorga cho'zilgan bo'lishi mumkin
    body = body.strip()
    if not body.startswith("ARIZA"):
        first, _, rest = body.partition("\n"); 
        if "ARIZA" in rest: kimga += " " + first.strip(); body = rest.strip()
    title = (b["title"] + " " + extra).strip()
    templates.append({"n": b["n"], "title": title, "kimga": kimga, "body": body})
json.dump({"stories": stories, "templates": templates}, open("out/docs.json","w"), ensure_ascii=False, indent=1)
print(len(stories), len(templates))
for s in stories: print("S", s["n"], s["title"][:60], "|", s["fuqaro"], "|", len(s["text"]))
for t in templates: print("T", t["n"], t["title"][:60], "|", t["kimga"][:50], "|", len(t["body"]))
