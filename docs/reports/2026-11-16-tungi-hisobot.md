# Tungi hisobot — 2026-11-16/17

Branch: `feat/legal-data`. Push qilinmadi. `.env` ga tegilmadi. Huquqiy matnlar (modda, telefon, muddat) o'zgartirilmadi va qo'shilmadi — hammasi `legal-knowledge/catalog/problems.json` dan so'zma-so'z olinadi.

## Bosqichlar va commit'lar

| Bosqich | Commit | Nima qilindi |
| --- | --- | --- |
| 1 | `e935f8b` | Katalog (P01–P65, 19 soha, 33 idora), T01–T65 shablonlar, TEKSHIRISH.md, PDF'lar, 261 ta test hikoya, `data/agencies.csv` ko'chirildi, `tools/legal-data` arxiv sifatida. Ikkala qoldiq ish (tools/legal-data/README.md, catalog/README.md tepasidagi qator) avvaldan bajarilgan edi — tekshirildi. |
| 2 | `673cbd3` | Katalogga asoslangan contract'lar: `ProblemId`, `LegalDomain` (generatsiya qilinadi), `ReviewStatus`, `Classification.problemId`. |
| 3 | `39ed448` | `loadCatalog()` (zod), `review-status.json`, yangi `DeterministicRoutingEngine`, placeholder route'lar o'chirildi, `reviewStatus`/`reviewNotice`. |
| 4 | `398b147` | API javobida qadamlar, organlar (nomi, telefon, havola), eskalatsiya, qonunlar, reviewStatus, reviewNotice. Veb natija ekrani + sariq ogohlantirish. Bot ham ogohlantirishni ko'rsatadi. Kalit so'z tasnifi `problemId` qaytaradi. |
| 5 | `5f8fb95` | `pnpm eval:ai`: problemId, soha, qizil recall, 1-idora, uslub bo'yicha. Hisobot: `ai/eval/reports/2026-11-17-baseline.json`. |
| 6 | — (kod o'zgarmadi) | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — hammasi o'tdi. API curl bilan tekshirildi va to'xtatildi. |

### 3-bosqich tafsiloti

- `packages/legal-engine/src/catalog.ts`: `loadCatalog(path)` → `LegalCatalog { version, routes: LegalRoute[] (65 ta), emergency, fallback }`.
  - Noma'lum idora id (`organlar`, `eskalatsiya`, `hali_erta`) → `CatalogError: P01.organlar references unknown agency "..."`.
  - `qonunlar` → `LegalReference[]`, hammasi `DRAFT`, `documentId: null`.
  - `tekshir` izohlari `route.reviewNotes` da saqlanadi (foydalanuvchiga ko'rsatilmaydi).
- `legal-knowledge/catalog/review-status.json`: hammasi `DRAFT`, P12, P25, P42, P44 → `VERIFIED_PENDING`. Statuslar faqat shu fayldan o'qiladi.
- Engine qoidalari: risk red → EMERGENCY (iiv, ishonch_1146, tez_yordam); `problemId` → katalog route; `null` → FALLBACK (adliya, advice.uz).
- Testlar (12 ta): 65 route; noma'lum idora → xato; status yo'q → xato; sxema xatosi; red → emergency; P12 birinchi qadam va organlar katalogdagidek; null → fallback; har bir qaror contract'ga mos; determinizm.

### 6-bosqich: curl natijalari

`"3 oydan beri oylik berishmayapti"` → `RULE_BASED`, `P12`, birinchi idora `mehnat_inspeksiyasi`:

1. Ish beruvchiga yozma talabnoma, keyin Davlat mehnat inspeksiyasi; murojaat muddati — 3 oy
2. Qarshi taraf (qarzdor, sotuvchi, ish beruvchi va h.k.)
3. Davlat mehnat inspeksiyasi — 1176; +998 71 200-06-00
4. Fuqarolik ishlari bo'yicha tumanlararo sud — +998 71 207-73-77 (devonxona); +998 71 207-97-37 (ishonch)

Qonunlar: Mehnat kodeksi 253-modda, 333-modda (DRAFT). `reviewStatus: VERIFIED_PENDING`.

`"erim pichoq bilan o'ldiraman deyapti"` → risk `red`, `EMERGENCY`:

1. Hozir hayotingizga xavf bo'lsa, darhol qo'ng'iroq qiling.
2. Tuman (shahar) ichki ishlar organi — 102
3. Xotin-qizlar uchun ishonch telefoni — 1146
4. Tez tibbiy yordam — 103

API `PORT=3099`, `DATABASE_URL` bo'sh holda `dist/main.js` dan ishga tushirildi; tekshiruvdan keyin to'xtatildi, 3000/3001/3099 portlar bo'sh.

## Eval natijalari (kalit so'z tasnifi, boshlang'ich)

| Uslub | Hikoyalar | problemId | Soha | 1-idora | Qizil recall |
| --- | --- | --- | --- | --- | --- |
| **Jami** | 261 | 5.4% | 11.9% | 10.7% | 15% (3/20) |
| rasmiy | 66 | 4.5% | 12.1% | 12.1% | 0% (0/5) |
| qisqa | 65 | 6.2% | 12.3% | 10.8% | 20% (1/5) |
| sheva | 65 | 6.2% | 12.3% | 10.8% | 20% (1/5) |
| aralash | 33 | 0% | 9.1% | 6.1% | 0% (0/3) |
| kirill | 32 | 9.4% | 12.5% | 12.5% | 50% (1/2) |

Kalit so'zlar faqat 4 ta turni qamraydi, shuning uchun umumiy aniqlik past bo'lishi kutilgan. O'sha 4 tur bo'yicha: P12 4/4, P42 4/4, P44 4/4, P25 2/4 (qolgan ikkitasi P42 ga tushdi yoki topilmadi). Xato musbat natijalar: 46 ta (masalan, P49/P60/P61 → P12, chunki u yerda ham "ish haqi" bor; P05/P06/P26 → P44, chunki "qo'shni" bor).

## Men qabul qilgan qarorlar

1. **1- va 2-bosqich alohida commit qilindi**: ma'lumotlar (`e935f8b`) va kod/contract'lar (`673cbd3`).
2. **`loadCatalog` `LegalCatalog` qaytaradi**, faqat `LegalRoute[]` emas: ichida 65 ta route + alohida `emergency` va `fallback`. Shunda "65 route" testi aniq bo'ladi.
3. **`hali_erta` id'lari ham tekshiriladi** (talab faqat `organlar` va `eskalatsiya` edi). Hozir hammasi to'g'ri.
4. **`review-status.json` da EMERGENCY va FALLBACK ham bor** (ikkalasi `DRAFT`) va `catalogVersion` maydoni bor. Katalog versiyasi o'zgarsa, loader xato beradi: statuslar qayta ko'rib chiqilishi kerak. Status yo'q yoki ortiqcha id ham xato.
5. **VERIFIED_PENDING uchun ogohlantirish matni**: "Bu yo'l yurist tekshiruvida, hali tasdiqlanmagan". Veb sariq blokni faqat DRAFT uchun emas, VERIFIED bo'lmagan har qanday holatda ko'rsatadi.
6. **Qadamlar tuzilishi**: 1-qadam = `birinchi_qadam` matni; keyin har bir organ uchun bitta qadam: "nomi — telefon" (telefon bo'lmasa faqat nomi). Eskalatsiya alohida `escalation` maydonida. `shablon_id` → `decision.templateId`. Bundan boshqa matn qo'shilmadi.
7. **FALLBACK'da `agencyId = null`**: adliya faqat kontakt sifatida chiqadi, "Arizani yuborish" tugmasi ko'rinmaydi.
8. **Qonunlar route `VERIFIED_PENDING` bo'lsa ham `DRAFT`** (talabga ko'ra).
9. **Tasnif tartibi**: P12 → P25 → P42 → P44, birinchi mos kelgani olinadi. Sheva/kirill bilan birga ruscha-aralash o'zaklari ham qo'shildi (`zarplat`, `oskorbl`, `sosed`). So'z boshi chegarasi ishlatiladi ("qurdi" → P25 ga tushmaydi). Eski `erim|qaynona → P25` qoidasi olib tashlandi, shuning uchun demo senariy S03 da `problemId` endi `null` (marshrut baribir EMERGENCY).
10. **`normalize`**: `‘` (U+2018) apostrofi ham `'` ga aylantiriladi — test hikoyalarida shu belgi bor.
11. **Eval hisobot nomi mahalliy sana bilan** (`2026-11-17-baseline.json`); `--label` va `--out` parametrlari qo'shildi.
12. **`@lex/legal-engine` ga `zod` va `@types/node` qo'shildi** (offline o'rnatildi, lockfile +6 qator).
13. **Bot** ham katalog qonunlarini va `reviewNotice` ni ko'rsatadi (bot matnlar fayliga tegilmadi).

## TODO va muammolar

- **Qizil xavf recall'i 15% — eng jiddiy muammo.** `ai/pipeline/risk.ts` kalit so'zlari P25, P33 (talonchilik), P34 (bosqinchilik), P35 (badanga shikast), P61 (pasportni olib qo'yish) hikoyalarining ko'pini ushlamaydi. Kalit so'zlarni test to'plamiga moslab o'zgartirmadim: bu o'lchovni soxta qiladi. Yechim: LLM'ning 2-qatlam risk bahosi (`maxRisk(keyword, llm)`) va test to'plamidan tashqaridagi misollar asosida ro'yxatni kengaytirish (Jayhun).
- **Xato musbat natijalar (46 ta)**: "ish haqi", "qo'shni", "haqorat" boshqa turlarda ham uchraydi. Bu muammoni LLM hal qiladi.
- **`problemId: null` bo'lsa soha `davlat_organlari`** bo'lib qoladi, shuning uchun soha aniqligi past.
- **"Qarshi taraf (...)" qadam sifatida** telefonsiz chiqadi va o'qishga noqulay. Uni qadamlardan yashirish yoki boshqacha ko'rsatish kerakmi — Sevinchoy va Mirjalol hal qilsin.
- **Vebda qadamlar va idoralar ro'yxati qisman takrorlanadi** (qadamda ham "nomi — telefon", ro'yxatda ham). Bu dizayn masalasi, Sevinchoy uchun.
- **Veb brauzerda ko'rilmadi** (talabga ko'ra). Faqat `next build`, typecheck va unit testlar o'tdi.
- **Barcha route'lar hali VERIFIED emas**: `requiresHumanReview` doim `true`. Mirjalol `review-status.json` ni yangilashi kerak.
- **P25 (VERIFIED_PENDING)** risk red bo'lganda ko'rinmaydi, chunki red doim EMERGENCY ga o'tadi. P25 route faqat risk orange/yellow bo'lganda ishlaydi.
- Git CRLF ogohlantirishlari bor (Windows, `.gitattributes` yo'q) — zararsiz, lekin keyinroq `.gitattributes` qo'shgan ma'qul.

## Ertangi LLM (Gemini) ulash uchun nima tayyor

- **Natija contract'i**: LLM faqat `{ domain, problemId | null, confidence }` qaytaradi. `ProblemId` va `LegalDomain` katalogdan generatsiya qilingan; `AnalysisResult.parse()` noto'g'ri id'ni o'tkazmaydi. LLM idora yoki marshrut tanlamaydi, buni engine qiladi.
- **Ulanish joyi**: `ai/pipeline/analyze.ts` da `classify(text)` o'rniga LLM chaqiruvi; kalit so'z tasnifi zaxira (offline/CI) sifatida qoladi. Model abstraksiyasi: `ai/models/provider.ts` (`ChatModelProvider`). Gemini uchun yangi provider yozish va `.env.example` ga kalit nomini qo'shish kerak. `.env` ga men tegmadim.
- **Prompt**: `ai/prompts/analysis.prompt.ts` mavjud; unga 65 ta tur ro'yxati (`id` + `nom` + `soha`) katalogdan avtomatik qo'shilishi kerak.
- **Risk**: kalit so'z qatlami har doim ishlaydi; LLM bahosi `maxRisk()` orqali qo'shiladi, past darajaga tushira olmaydi.
- **Solishtirish**: `pnpm eval:ai --label llm-gemini` → `ai/eval/reports/<sana>-llm-gemini.json`; boshlang'ich natija `2026-11-17-baseline.json` da (har bir xato holat ham yozilgan).
- **Muhim**: `uslub = rasmiy` hikoyalarini LLM'ga few-shot misol sifatida bermang, aks holda aniqlik soxta chiqadi (`legal-knowledge/catalog/README.md`).
