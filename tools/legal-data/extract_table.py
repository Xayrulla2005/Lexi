import pdfplumber, json, sys
src = sys.argv[1]
rows = []
with pdfplumber.open(src) as pdf:
    for p in pdf.pages:
        for t in p.extract_tables():
            for r in t:
                rows.append([ (c or "").replace("\n"," ").strip() for c in r])
json.dump(rows, open(sys.argv[2],"w"), ensure_ascii=False, indent=1)
print(len(rows))
for r in rows[:4]: print(r)
