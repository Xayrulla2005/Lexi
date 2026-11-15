/**
 * XAYRULLA: Mirjalolning CSV jadvallarini tekshiradi.
 * Xatoli qatorlar rad etiladi va hisobotda ko'rsatiladi — tizim buzilmaydi.
 * Ishga tushirish: pnpm import:data
 * TODO: tekshirilgan qatorlarni Prisma orqali bazaga yozish.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ID = /^[a-z0-9_]+$/;

const Agency = z.object({
  id: z.string().regex(ID, "id faqat kichik lotin harf, raqam va _"),
  nomi: z.string().min(2),
  vakolati: z.string().min(2),
  shugullanmaydi: z.string(),
  kanal: z.string(),
  telefon: z.string(),
  javob_muddati: z.string().regex(/^\d*$/, "javob_muddati raqam bo'lishi kerak"),
  manba: z.string(),
});

const TestCase = z.object({
  id: z.string().regex(/^T\d+$/),
  soha: z.string().min(2),
  hikoya: z.string().min(10),
  xavf: z.enum(["qizil", "to'q sariq", "sariq", "yashil"]),
  birinchi_idora: z.string().regex(ID),
  hali_erta: z.string(),
  moddalar: z.string(),
  foydalanuvchi_xatosi: z.string(),
  izoh: z.string(),
});

/** Qo'shtirnoq ichidagi vergullarni hisobga oluvchi oddiy CSV o'quvchi */
function parseCsv(raw: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (q) {
      if (ch === '"' && raw[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function check<T>(file: string, schema: z.ZodType<T>) {
  const rows = parseCsv(readFileSync(join(__dirname, "../raw", file), "utf8"));
  let ok = 0;
  rows.forEach((r, i) => {
    const res = schema.safeParse(r);
    if (res.success) ok++;
    else console.log(`✗ ${file} ${i + 2}-qator: ${res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
  });
  console.log(`✓ ${file}: ${ok}/${rows.length} qator to'g'ri`);
}

check("agencies.csv", Agency);
check("test_cases.csv", TestCase);
