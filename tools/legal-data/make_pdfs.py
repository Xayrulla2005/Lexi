# -*- coding: utf-8 -*-
import json, os, sys
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from xml.sax.saxutils import escape

F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("D", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DB", F + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DI", F + "DejaVuSans-Oblique.ttf"))
from reportlab.lib.fonts import addMapping
addMapping("D", 0, 0, "D"); addMapping("D", 1, 0, "DB"); addMapping("D", 0, 1, "DI"); addMapping("D", 1, 1, "DB")

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "pdf"); os.makedirs(OUT, exist_ok=True)
data = json.load(open(os.path.join(ROOT, "data/problems.json"), encoding="utf8"))
stories = json.load(open(os.path.join(ROOT, "out/stories.json"), encoding="utf8"))
templates = json.load(open(os.path.join(ROOT, "out/templates.json"), encoding="utf8"))
SOH, IDO, PR = data["sohalar"], data["idoralar"], data["muammolar"]

INK, MUTED, ACC = colors.HexColor("#14213D"), colors.HexColor("#4A5568"), colors.HexColor("#B5781A")
st = lambda name, **k: ParagraphStyle(name, **({"fontName": "D", "textColor": INK} | k))
H1 = st("h1", fontSize=18, leading=22, spaceAfter=6, fontName="DB")
H2 = st("h2", fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=4, fontName="DB")
B = st("b", fontSize=9.5, leading=13)
SM = st("sm", fontSize=7.6, leading=9.6)
SMB = st("smb", fontSize=7.6, leading=9.6, fontName="DB")
Q = st("q", fontSize=9.5, leading=13, leftIndent=8)
NOTE = st("n", fontSize=8.5, leading=11, textColor=MUTED)
WARN = st("w", fontSize=8.5, leading=11, textColor=colors.HexColor("#9C4221"))
RISK = dict(red="Qizil", orange="To'q sariq", yellow="Sariq", green="Yashil")
RISKC = dict(red="#C0392B", orange="#D35400", yellow="#B7950B", green="#1E8449")
USLUB = dict(rasmiy="Rasmiy (asl)", qisqa="Qisqa, imlo xatolari bilan", sheva="Sheva", aralash="Ruscha so'zlar aralash", kirill="Kirill yozuvi")
e = lambda s: escape(str(s))

def footer(title):
    def f(c, d):
        c.saveState(); c.setFont("D", 7.5); c.setFillColor(MUTED)
        c.drawString(12 * mm, 8 * mm, title); c.drawRightString(d.pagesize[0] - 12 * mm, 8 * mm, f"{d.page}-bet"); c.restoreState()
    return f

def org_names(ids): return "; ".join(IDO[i]["nomi"] for i in ids)
def org_contacts(ids):
    out = []
    for i in ids:
        o = IDO[i]; bits = [x for x in (o["telefon"], o["havola"]) if x]
        if bits: out.append(f"{o['nomi']}: {', '.join(bits)}" + (" ⚠️" if o["tekshir"] else ""))
    return "<br/>".join(e(x) for x in out)

# 1) Muammolar jadvali
def pdf_table():
    path = os.path.join(OUT, "1-Muammolar-jadvali.pdf")
    doc = SimpleDocTemplate(path, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=12*mm, bottomMargin=14*mm,
                            title="Muammolar jadvali", author="LexHackathon jamoasi")
    el = [Paragraph("Muammolar, qonunlar va murojaat yo'llari", H1),
          Paragraph(f"65 ta muammo turi ({len(SOH)} soha). P01–P50 — do'st jadvali asosida tozalangan; P51–P65 — yangi qo'shilgan. "
                    "⚠️ belgisi — manbada tasdiqlanmagan, lex.uz yoki rasmiy saytda tekshirilsin.", NOTE), Spacer(1, 4)]
    hdr = ["№", "Muammo", "Soha / xavf", "Qonunchilik normasi", "Birinchi qadam", "Ko'rib chiquvchi organ", "Yuqori turuvchi organ"]
    rows = [[Paragraph(h, SMB) for h in hdr]]
    for p in PR:
        warn = "<br/><font color='#9C4221'>⚠️ tekshirish kerak</font>" if p["tekshir"] else ""
        rows.append([Paragraph(p["id"], SMB), Paragraph(e(p["nom"]) + warn, SM),
                     Paragraph(f"{e(SOH[p['soha']])}<br/><font color='{RISKC[p['xavf']]}'>{RISK[p['xavf']]}</font>", SM),
                     Paragraph("<br/>".join(e(q) for q in p["qonunlar"]), SM), Paragraph(e(p["birinchi_qadam"]), SM),
                     Paragraph(org_names(p["organlar"]), SM), Paragraph(org_names(p["eskalatsiya"]), SM)])
    t = Table(rows, colWidths=[11*mm, 44*mm, 30*mm, 50*mm, 58*mm, 44*mm, 40*mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8E4D8")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CFC9B8")),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F6F1")]),
                           ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    el += [t, PageBreak(), Paragraph("Idoralar: telefon va onlayn murojaat", H1)]
    irows = [[Paragraph(h, SMB) for h in ["Kod", "Idora", "Telefon", "Onlayn murojaat", "Izoh"]]]
    for k, o in IDO.items():
        irows.append([Paragraph(k, SM), Paragraph(e(o["nomi"]) + (" ⚠️" if o["tekshir"] else ""), SM), Paragraph(e(o["telefon"]), SM),
                      Paragraph(e(o["havola"]), SM), Paragraph(e(o["izoh"]), SM)])
    it = Table(irows, colWidths=[38*mm, 80*mm, 48*mm, 50*mm, 60*mm], repeatRows=1)
    it.setStyle(t.getStyle() if hasattr(t, "getStyle") else TableStyle([]))
    it.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8E4D8")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CFC9B8"))]))
    el += [it, PageBreak(), Paragraph("Tekshirish kerak bo'lgan joylar", H1)]
    for p in PR:
        if p["tekshir"]:
            el.append(Paragraph(f"<b>{p['id']} · {e(p['nom'])}</b>", B))
            el += [Paragraph("• " + e(x), WARN) for x in p["tekshir"]]
            el.append(Spacer(1, 3))
    doc.build(el, onFirstPage=footer("Muammolar jadvali"), onLaterPages=footer("Muammolar jadvali"))
    return path

# 2) Hikoyalar
def pdf_stories():
    path = os.path.join(OUT, "2-Hikoyalar.pdf")
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm, title="Hikoyalar", author="LexHackathon jamoasi")
    el = [Paragraph("Hikoyalar: rasmiy va jonli variantlar", H1),
          Paragraph("Har bir muammo turi uchun bitta rasmiy hikoya va oddiy odam yozadigandek 3 ta variant: qisqa (imlo xatolari bilan), sheva, "
                    "ruscha so'zlar aralash yoki kirill yozuvida. AI'ni sinash va unga misol berish uchun ishlatiladi. Hikoyalardagi ismlar to'qima.", NOTE), Spacer(1, 6)]
    by = {}
    for s in stories: by.setdefault(s["problem_id"], []).append(s)
    for p in PR:
        block = [Paragraph(f"{p['id']} · {e(p['nom'])}", H2),
                 Paragraph(f"<font color='{RISKC[p['xavf']]}'>{RISK[p['xavf']]}</font> · {e(SOH[p['soha']])} · Birinchi organ: {e(org_names(p['organlar'][:2]))}", NOTE)]
        for s in by[p["id"]]:
            lab = USLUB[s["uslub"]] + (f" ({s['hudud'].capitalize()})" if s["hudud"] else "") + (f" — {e(s['fuqaro'])}" if s["fuqaro"] else "")
            block += [Paragraph(f"<b>{e(lab)}</b>", SM), Paragraph(e(s["matn"]), Q), Spacer(1, 3)]
        el.append(KeepTogether(block))
    doc.build(el, onFirstPage=footer("Hikoyalar"), onLaterPages=footer("Hikoyalar"))
    return path

# 3) Arizalar
def pdf_templates():
    path = os.path.join(OUT, "3-Arizalar.pdf")
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=16*mm, bottomMargin=16*mm, title="Ariza namunalari", author="LexHackathon jamoasi")
    el = [Paragraph("Ariza namunalari (shablonlar)", H1),
          Paragraph("{{fio}}, {{summa}} kabi qavs ichidagi joylarni AI foydalanuvchi ma'lumotlari bilan to'ldiradi; qolgan matn o'zgarmaydi. "
                    "{{malumot_1}} kabi umumiy maydonlar — yonidagi matnga qarab to'ldiriladi.", NOTE)]
    P = {p["id"]: p for p in PR}
    for t in templates:
        p = P[t["problem_id"]]
        body = [Paragraph(f"{t['id']} · {e(p['nom'])}", H2),
                Paragraph(f"<b>Kimga:</b> {e(t['kimga'])}", B), Paragraph("<b>Kimdan:</b> {{fio}}, {{manzil}}, tel.: {{telefon}}", B), Spacer(1, 4),
                Paragraph(f"<para alignment='center'><b>{e(t['sarlavha'])}</b></para>", B), Spacer(1, 3)]
        for para in t["body"].split("\n\n"):
            body.append(Paragraph(e(para).replace("\n", "<br/>"), B)); body.append(Spacer(1, 3))
        el += [KeepTogether(body[:6])] + body[6:] + [Spacer(1, 6)]
    doc.build(el, onFirstPage=footer("Ariza namunalari"), onLaterPages=footer("Ariza namunalari"))
    return path

for f in (pdf_table, pdf_stories, pdf_templates): print(f())
