# Simulyatorlar hisoboti — 2026-11-17

Branch: `feat/simulators`. Push qilinmadi. `.env` ga tegilmadi.

**Branch qayerdan ochildi:** `feat/legal-data` hali `main` ga merge qilinmagan, shuning uchun `feat/simulators` `feat/legal-data` (`9a871d5`) dan ochildi. Avval `feat/legal-data` PR'i merge qilinishi kerak, keyin bu branch.

## Commit'lar

| Bosqich | Commit | Nima qilindi |
| --- | --- | --- |
| 1 | `cde27da` | Natija ekrani: "Umumiy yo'l" yozuvi faqat fallback'da chiqadi. Qadamlar: `birinchi_qadam` va "Javob bo'lmasa: <eskalatsiyadagi birinchi idora>". Idoralar faqat "Qayerga murojaat qilish" bo'limida. |
| 3 | `79a082a` | OneID simulyatori: `data/sim/citizens.json` (3 ta to'qima fuqaro), `/kirish` sahifasi, sessiya. `JsonStore` (`data/runtime/*.json`). pdfkit va DejaVu shrifti o'rnatildi. |
| 2 | `397432f` | Ariza: shablon yuklash, maydonlarni to'ldirish, sariq bo'sh joylar, rozilik va uning vaqti, server tomonda PDF. |
| 4 | `52a8ec9` | ERI simulyatori: Ed25519, PDF'ning SHA-256 xeshi imzolanadi, tekshirish va testlar, "ERI bilan imzolash (simulyator)" tugmasi. |
| 5 | `152350a` | AgencyGateway, paket, holatlar, DEMO_SPEED / SIM_RESPONSE_DAYS, OVERDUE → eskalatsiya qoralamasi, `/idora` kabineti, holatni jonli kuzatish, `data/runtime` ga saqlash. |
| 6 | (shu hisobot) | lint, typecheck, test va build o'tdi. To'liq zanjir curl bilan tekshirildi. |

3-bosqich 2-bosqichdan oldin commit qilindi, chunki ariza fio, manzil va telefonni OneID simulyatoridan oladi.

Testlar: contracts 8, legal-engine 12, ai 21, web 7, api 25 (jumladan `tests/integration/simulators.spec.ts`: to'liq zanjir va OVERDUE → eskalatsiya).

## 6-bosqich: curl zanjiri natijasi

API `dist/main.js` dan `PORT=3099`, `DEMO_SPEED=10000` (1 kun = 10 s), `SIM_RESPONSE_DAYS=3` bilan ishga tushirildi. Holat vaqtinchalik papkada saqlandi (`RUNTIME_DIR`).

```
1. OneID kirish: Karimov Jasur Anvarovich, PINFL 00000000000001
2. P12 tahlil -> route P12, idora mehnat_inspeksiyasi
   ariza (T12), bo'sh maydonlar: malumot_1, malumot_2, malumot_3, summa -> to'ldirildi
   rozilik: 2026-11-17T05:43:52Z; imzo Ed25519, tekshiruv: "Imzo haqiqiy"; PDF 13 KB
   yuborildi: SIM-MI-00451, SUBMITTED
3. Kabinet: inbox'da bor; imzo holati "Imzo haqiqiy"; P12, summa=5 000 000
   Qabul qilish -> RECEIVED, Ko'rib chiqilmoqda -> IN_REVIEW, Javob -> ANSWERED
4. Foydalanuvchi: ANSWERED, "Davlat mehnat inspeksiyasidan javob keldi" + javob matni
5. Ikkinchi ariza SIM-MI-00452: javob berilmadi -> 30 s dan keyin OVERDUE
   eskalatsiya qoralamasi: ESCALATION, "Kambag'allikni qisqartirish va bandlik vazirligi",
   rozilik=null, imzo=null, yuborilmagan
```

API qayta ishga tushirildi: ikkala ariza ham holati, javobi va qoralamasi bilan saqlanib qolgan. Sessiya tokeni ham ishlayveradi. Test kalitlari `data/sim/keys/` da yaratildi, git'ga tushmaydi. Tekshiruvdan keyin API to'xtatildi; 3000, 3001 va 3099 portlar bo'sh.

## Qarorlar

1. **Branch `feat/legal-data` dan ochildi**, chunki u hali main'ga merge qilinmagan.
2. **Qadamlar engine'da yasaladi** (`packages/legal-engine`): 1-qadam `birinchi_qadam` (va `documentTemplateId`), 2-qadam "Javob bo'lmasa: <idora nomi>". "Javob bo'lmasa:" matni UI yozuvi; idora nomi katalogdan olinadi. Emergency va fallback qadamlari o'zgarmadi.
3. **Tasdiqlanmagan katalog route'ida yorliq ko'rsatilmaydi.** "Umumiy yo'l" faqat fallback'da, "Yurist tasdiqlagan yo'l" faqat VERIFIED'da chiqadi. Tasdiqlanmaganini sariq ogohlantirish allaqachon aytadi.
4. **Maydon manbalari:** `fio`, `manzil`, `telefon` → OneID simulyatori; `ariza_sanasi` → bugungi sana (Toshkent vaqti, `dd.mm.yyyy`). Qolgan barcha maydonlar qo'lda kiritiladi, jumladan shablonlardagi `pasport_raqami`, `bola_fio` va boshqalar. Foydalanuvchi OneID maydonlarini o'zgartira olmaydi.
5. **Rozilik va imzo uchun barcha maydonlar to'ldirilgan bo'lishi shart.** Bo'sh maydon bilan ariza yuborilmaydi; ko'rinishda va oldindan ko'rish PDF'ida bo'sh joylar belgilanadi.
6. **Rozilik har qanday maydon o'zgarganda bekor bo'ladi.** Imzolangandan keyin hech narsa o'zgarmaydi: imzolangan PDF baytlari saqlanadi va aynan shular yuboriladi. Yuborishda imzo qayta tekshiriladi.
7. **Yuborish uchun uchta shart bor:** so'rov tanasida `consent: true`, saqlangan rozilik vaqti va haqiqiy imzo. Idora faqat routing qaroridan olinadi: asosiy ariza uchun `agencyId`, eskalatsiya uchun `escalation[0]`.
8. **Shablon matni o'zgartirilmaydi.** Faqat boshidagi `<!-- T12 · ... -->` metama'lumot izohi olib tashlanadi. PDF'ning eng pastiga, shablon matnidan tashqarida, "SIMULYATOR: demo hujjat. Haqiqiy davlat idorasiga yuborilmagan." yozuvi qo'shildi.
9. **PDF:** pdfkit va DejaVu Sans (`dejavu-fonts-ttf` paketi). o‘, g‘, ʻ va ’ to'g'ri chiqadi — PDF'dan matn ajratib tekshirildi.
10. **Javob muddati:** katalogda idoralar uchun muddat yo'q (`data/agencies.csv` dagi `javob_muddati` ham bo'sh). Shuning uchun u `SIM_RESPONSE_DAYS` konfiguratsiyasidan olinadi (standart 15). Bu Murojaatlar qonunidagi muddat emas, faqat simulyator sozlamasi; `.env.example` da shunday izoh bor. `DEMO_SPEED` — 1 kundagi millisekundlar soni, avvalgi ma'nosi saqlandi (1000 = 1 kun 1 soniya).
11. **Holatlarni idora kabineti boshqaradi.** Eski avtomatik taymerlar (2 kunda IN_REVIEW, 10 kunda ANSWERED) olib tashlandi. Ruxsat etilgan o'tishlar: RECEIVED faqat SUBMITTED dan; IN_REVIEW SUBMITTED yoki RECEIVED dan. Kech javob (OVERDUE dan ANSWERED ga) qabul qilinadi. ESCALATED holati foydalanuvchi eskalatsiya qoralamasini yuborganda qo'yiladi.
12. **AgencyGateway interfeysi:** so'ralgan 4 ta metoddan (`submit`, `getStatus`, `listInbox`, `respond`) tashqari yana ikkitasi bor: `markEscalated` (mahalliy hisob) va `onStatusChange` (OVERDUE → qoralama uchun). "Qabul qilish" va "Ko'rib chiqilmoqda" faqat `MockAgencyAdapter` da: real adapterda bu holatlarni idoraning o'zi yuboradi. RealAgencyAdapter `agency-gateway.module.ts` da `useExisting` ni almashtirish orqali ulanadi.
13. **Eskalatsiya qoralamasi** avvalgi qo'lda kiritilgan javoblarni qayta ishlatadi. Rozilik va imzo bo'sh bo'ladi, avtomatik yuborilmaydi. Faqat asosiy (PRIMARY) ariza uchun yaratiladi.
14. **Jonli yangilanish polling orqali** (har 2 soniyada). SSE tanlanmadi, chunki `EventSource` sessiya sarlavhasini yubora olmaydi.
15. **Sessiya:** token `x-sim-session` sarlavhasida, brauzerda `sessionStorage` da. Holatni kuzatish va ariza endpoint'lari faqat egasiga ochiq (boshqa fuqaro → 403).
16. **Saqlash:** `JsonStore` — xotirada va `data/runtime/{cases,sessions,applications,submissions}.json` da (gitignore). Jest'da faqat xotirada ishlaydi; `RUNTIME_DIR` bilan boshqa papka berish mumkin. Cases ham saqlanadi.
17. **Bot endi ariza yubormaydi:** imzo va OneID faqat vebda. "Ha" tugmasi vebga yo'naltiruvchi yangi matnni (`sendViaWeb`) ko'rsatadi.
18. **Sevinchoy fayllari:** `texts.uz.ts` ga faqat yangi kalitlar (`application`, `eri`, `tracking`, `cabinet`, `oneid`), `globals.css` ga bitta oldingi yangi o'zgaruvchi. `components/ui/` ga yangi fayllar: `SimBanner.tsx` (bu bosqichda), `Notice.tsx` (avvalgi). Mavjud matnlar o'zgarmadi.
19. **Dizayn:** OneID, ERI va kabinet ekranlarida katta sariq-chiziqli "SIMULYATOR" yozuvi bor. Haqiqiy OneID yoki davlat tizimlarining logotipi, rangi va dizayni ishlatilmagan.

## TODO va muammolar

- **Eskalatsiya arizasi o'sha shablondan yasaladi.** Masalan, T12 da "Kimga: Davlat mehnat inspeksiyasiga" deb yozilgan, lekin qoralama bandlik vazirligiga ketadi. Shablon matnini o'zgartirmadim. Eskalatsiya uchun alohida shablonlar kerak (Mirjalol).
- **T12 shablonining tuzilishi g'alati:** "Men, {{fio}}, lavozimida ishlayman." dan keyin `{{malumot_1}}` alohida qatorda turadi, shuning uchun lavozim gapdan keyin chiqadi. Shablon do'st ma'lumotidan olingan, tuzatish Mirjalolga.
- **Maydon nomlari texnik ko'rinishda** ("malumot 1", "summa"). Har bir shablon uchun tushunarli yorliqlar yoki LLM tavsiyasi kerak.
- **Eskalatsiyaning eskalatsiyasi** (`eskalatsiya[1]` va keyingilari) hali modellanmagan.
- **Idora kabinetida autentifikatsiya yo'q** (faqat demo uchun). Real idoralarga hech qachon ochilmasin.
- **`docs/api/openapi.yaml`** da faqat `/submissions` va `AgencySubmission` yangilandi. Yangi endpoint'lar (`/sim/*`, `/applications/*`) hozircha faqat `docs/api/contracts.md` da.
- **Bot:** ariza va kuzatish yo'q. Bot uchun OneID sessiyasini qanday berish hali hal qilinmagan.
- **Bir marta kuzatilgan osilish:** birinchi curl yugurishda ikkinchi arizani yuborish chaqiruvi taxminan 12 daqiqa kutib qoldi. Ikkinchi yugurishda yuborish 2 soniyada tugadi, xato qayta chiqmadi. Ehtimol, buyruq orqa fonga o'tkazilganda jarayon to'xtab qolgan. Demodan oldin yana bir bor tekshirish kerak.
- **Veb brauzerda ko'rilmadi** (talabga ko'ra). Faqat `next build`, typecheck va unit testlar o'tdi.
- **Demo vaqtida o'tish cheklovi:** muddat qisqa bo'lsa (masalan, `DEMO_SPEED=1000` va 3 kun), idora "Qabul qilish" ni bosguncha ariza OVERDUE bo'lib qolishi mumkin. OVERDUE dan RECEIVED ga o'tish yo'q; faqat javob yozish mumkin.

## Demoda qanday ko'rsatish (qadam-baqadam)

Tayyorlash (alohida terminallarda):

```bash
# API: 1 kun = 2 soniya, javob muddati 15 kun -> 30 soniya
DEMO_SPEED=2000 SIM_RESPONSE_DAYS=15 pnpm dev:api
pnpm dev:web
```

Toza demo uchun oldin `data/runtime/` papkasini o'chiring (eski arizalar ko'rinmasligi uchun).

1. **Brauzerda ikkita oyna oching:** fuqaro — http://localhost:3000, idora — http://localhost:3000/idora.
2. **Kirish:** "Kirish (OneID simulyatori)" → "SIMULYATOR — haqiqiy OneID emas" yozuvini ko'rsating → "Karimov Jasur Anvarovich" → "Shu fuqaro sifatida kirish" → "Bosh sahifaga qaytish".
3. **Muammo:** "3 oydan beri oylik berishmayapti" → Yuborish. Ko'rsating: sariq ogohlantirish, ikkita qadam ("Javob bo'lmasa: ..."), idoralar ro'yxati va qonunlar.
4. **Ariza:** "Arizani yuborish" → ariza ko'rinishi ochiladi. Sariq joylar to'ldirilmagan; fio, manzil, telefon va sana OneID'dan avtomatik tushgan. Maydonlarni to'ldiring: lavozim, tashkilot, oy, summa → Saqlash. "PDF ko'rinishini ochish".
5. **Rozilik:** "Ma'lumotlarim to'g'ri va arizani yuborishga roziman" belgisini qo'ying → rozilik vaqti chiqadi. Belgisiz imzo va yuborish tugmalari faol emasligini ko'rsating.
6. **Imzo:** "ERI bilan imzolash (simulyator)" → Ed25519 va SHA-256 xesh ko'rinadi → "Yuborish".
7. **Idora oynasi:** "Davlat mehnat inspeksiyasi" tanlangan → ariza ro'yxatda → Ochish. Ko'rsating: "✅ Imzo haqiqiy", fuqaro (soxta PINFL), rozilik vaqti, ish ma'lumoti va PDF. "Qabul qilish" → "Ko'rib chiqilmoqda" → javob yozing → "Javobni yuborish".
8. **Fuqaro oynasi:** holat o'zi yangilanadi: Yuborildi → Qabul qilindi → Ko'rib chiqilmoqda → "Davlat mehnat inspeksiyasidan javob keldi" va javob matni.
9. **Muddat o'tishi:** yana bir ariza yuboring, idorada javob bermang. 30 soniyadan keyin "Muddat o'tdi" va "Yuqori turuvchi idoraga yangi ariza qoralamasi tayyor..." chiqadi → "Qoralamani ochish". Qoralamada rozilik va imzo bo'sh: foydalanuvchi yana rozilik berib, imzolab yuboradi. Asl ariza "Yuqori idoraga yuborildi" (ESCALATED) holatiga o'tadi.

Muhim: hamma joyda "SIMULYATOR" yozuvi bor. Haqiqiy davlat tizimiga hech narsa yuborilmaydi. Barcha shaxslar to'qima.
