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

- ~~Eskalatsiya arizasi o'sha shablondan yasaladi, "Kimga:" eski idorani ko'rsatadi.~~ **Hal qilindi** (`75da02a`): "Kimga:" qatori va bitta faktik qator avtomatik. Shablon tanasi (masalan, "Davlat mehnat inspeksiyasi" haqidagi so'rov qismi) baribir asl idoraga mo'ljallangan — alohida eskalatsiya shablonlari kerakmi, Mirjalol hal qilsin.
- **T12 shablonining tuzilishi g'alati:** "Men, {{fio}}, lavozimida ishlayman." dan keyin `{{malumot_1}}` alohida qatorda turadi, shuning uchun lavozim gapdan keyin chiqadi. Shablon do'st ma'lumotidan olingan, tuzatish Mirjalolga.
- **Maydon nomlari texnik ko'rinishda** ("malumot 1", "summa"). Har bir shablon uchun tushunarli yorliqlar yoki LLM tavsiyasi kerak.
- **Eskalatsiyaning eskalatsiyasi** (`eskalatsiya[1]` va keyingilari) hali modellanmagan.
- **Idora kabinetida autentifikatsiya yo'q** (faqat demo uchun). Real idoralarga hech qachon ochilmasin.
- **`docs/api/openapi.yaml`** da faqat `/submissions` va `AgencySubmission` yangilandi. Yangi endpoint'lar (`/sim/*`, `/applications/*`) hozircha faqat `docs/api/contracts.md` da.
- **Bot:** ariza va kuzatish yo'q. Bot uchun OneID sessiyasini qanday berish hali hal qilinmagan.
- **12 daqiqalik osilish:** 20 marta yugurishda qayta chiqmadi. Tafsilot va himoya choralari pastdagi "Tuzatishlar" bo'limida.
- **Veb brauzerda ko'rilmadi** (talabga ko'ra). Faqat `next build`, typecheck va unit testlar o'tdi.
- ~~Demo vaqtida qisqa muddat ariza OVERDUE bo'lib qolardi.~~ **Hal qilindi** (`2c08539`): standart rejimda vaqt faqat "⏩" tugmasi bilan siljiydi. `DEMO_SPEED` berilsa, eski cheklov saqlanadi: OVERDUE dan RECEIVED ga o'tish yo'q.
- **Diqqat: `.env` da `DEMO_SPEED` bo'lsa** (eski `.env.example` dan nusxa olingan bo'lsa, `DEMO_SPEED=1000` turibdi), API avtomatik rejimda ishlaydi. Qo'lda rejim uchun shu qatorni `.env` dan olib tashlang. `.env` ga men tegmadim.

## Demoda qanday ko'rsatish (qadam-baqadam)

Tayyorlash (alohida terminallarda). `.env` da `DEMO_SPEED` bo'lmasin — vaqt faqat tugma bilan siljiydi:

```bash
pnpm dev:api
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
9. **Muddat o'tishi:** yana bir ariza yuboring. Idora oynasida uning yonidagi "⏩ Vaqtni oldinga surish (+15 kun)" tugmasini bosing → "Simulyatsiya vaqti: 15 / 15 kun", holat "Muddat o'tdi". Fuqaro oynasida "Yuqori turuvchi idoraga yangi ariza qoralamasi tayyor..." chiqadi → "Qoralamani ochish". Ko'rsating: "Kimga: Kambag'allikni qisqartirish va bandlik vazirligi" va imzodan oldingi "Avvalgi murojaat: № SIM-MI-…, …, Davlat mehnat inspeksiyasiga yuborilgan; belgilangan muddatda javob olinmadi." qatori. Qoralamada rozilik va imzo bo'sh: foydalanuvchi yana rozilik berib, imzolab yuboradi. Asl ariza "Yuqori idoraga yuborildi" (ESCALATED) holatiga o'tadi.

Muhim: hamma joyda "SIMULYATOR" yozuvi bor. Haqiqiy davlat tizimiga hech narsa yuborilmaydi. Barcha shaxslar to'qima.

## Tuzatishlar (2-qism, 2026-11-17)

| # | Commit | Nima qilindi |
| --- | --- | --- |
| 1 | `e9089d3` | Yuborish zanjirida har bir qadam uchun vaqt logi (`[timing] sign …`, `[timing] submit …`). Har bir fayl va tashqi operatsiyaga 5 s timeout (`OP_TIMEOUT_MS`). Timeout bo'lsa HTTP 504 "Qayta urinib ko'ring". Atomik va navbatli fayl yozish. Vebda so'rovga 15 s chegara va "Qayta urinib ko'ring" xabari. |
| 2 | `75da02a` | Eskalatsiya qoralamasi: "Kimga:" qatori maqsadli idoraning katalogdagi nomi bilan almashtiriladi; imzodan oldin bitta faktik qator qo'shiladi. Qolgan matn o'zgarmaydi (65 ta shablonning hammasida test qilindi). |
| 3 | `2c08539` | Demo soati: `DEMO_SPEED` berilmasa — qo'lda rejim (faqat "⏩ Vaqtni oldinga surish (+15 kun)" tugmasi). Berilsa — eski avtomatik rejim. |

Tekshiruv: lint, typecheck, test va build o'tdi (contracts 8, legal-engine 12, ai 21, web 7, api 32). Build qilingan API qo'lda rejimda curl bilan tekshirildi: yuborishdan 3 s keyin ham `SUBMITTED`, `dueAt=null`. "+15 kun" → `OVERDUE`, `simulatedDays=15`. Qoralama matni "Kimga: Kambag'allikni qisqartirish va bandlik vazirligi" bilan boshlanadi va "Sana/Imzo" qatoridan oldin "Avvalgi murojaat: № SIM-MI-00451, 17.11.2026, Davlat mehnat inspeksiyasiga yuborilgan; belgilangan muddatda javob olinmadi." turibdi.

### 12 daqiqalik osilish: 20 marta yugurish natijasi

Zanjir (kirish → case → xabar → tahlil → ariza → maydonlar → rozilik → imzo → PDF → yuborish → holat) curl bilan **20 marta ketma-ket** o'tkazildi. API `dist` dan ishga tushirildi, holat vaqtinchalik papkada saqlandi.

Klient vaqti (curl `time_total`, faqat 2xx javoblar), ms:

| Chaqiruv | n | mediana | p95 | max | o'rtacha |
| --- | --- | --- | --- | --- | --- |
| login | 21 | 27 | 68 | 93 | 31 |
| case | 21 | 26 | 51 | 55 | 29 |
| message | 21 | 28 | 56 | 57 | 30 |
| analyze | 21 | 44 | 154 | 315 | 56 |
| application | 21 | 30 | 78 | 96 | 38 |
| fields | 20 | 27 | 100 | 104 | 36 |
| consent | 20 | 31 | 52 | 56 | 33 |
| **sign** | 20 | **109** | 256 | **534** | **146** |
| pdf (yuklab olish) | 20 | 95 | 238 | 248 | 122 |
| submit | 20 | 48 | 116 | 116 | 58 |
| track | 20 | 32 | 92 | 93 | 36 |

Server qadamlari (`[timing]` log, 21 ta sign va 21 ta submit):

| Qadam | o'rtacha, ms | max, ms |
| --- | --- | --- |
| **sign.pdf** (PDF yasash, pdfkit) | **89** | **378** |
| sign.persist (applications.json yozish) | 33 | 131 |
| sign.eri (kalit + Ed25519) | 3 | 66 (birinchi marta kalit o'qiladi) |
| sign.save / load | ≤ 1 | 7 |
| submit.persist | 16 | 63 |
| submit.gateway | 4 | 17 |
| submit.verify / pdf / load / save | ≤ 2 | 12 |
| sign jami | 127 | 498 |
| submit jami | 25 | 69 |

**Xulosa:**
- **Eng sekin qadam — imzolashdagi PDF yasash** (`sign.pdf`, o'rtacha 89 ms, eng ko'pi 378 ms). Ikkinchi o'rinda fayl yozish (`persist`, eng ko'pi 131 ms). Yuborish (`submit`) eng ko'pi 116 ms.
- 20 yugurishda bironta ham HTTP chaqiruv 0.6 s dan oshmadi. **12 daqiqalik osilish qayta chiqmadi.**
- Bitta yugurishning umumiy vaqti esa 5–25 s (mediana 10 s), garchi HTTP vaqtlari yig'indisi ~0.6 s bo'lsa ham. Farq klient tomonda: bu Windows/Git Bash muhitida har bir jarayon ishga tushishi (curl, sed) ~0.4–1 s oladi. Bitta `sed` chaqiruvi 0.45 s ekanini alohida o'lchadim.
- **Sabab haqida.** Birinchi hodisada server logida 12 daqiqa davomida hech narsa yo'q edi, ariza esa server so'rovni olgan paytdagi vaqt bilan saqlangan (`submittedAt` = 05:40:43). Bu kechikish klient tomonda bo'lganiga ishora qiladi: curl/Git Bash jarayoni to'xtab qolgan, ehtimol buyruq orqa fonga o'tkazilganda. Lekin buni 100% isbotlab bo'lmaydi. O'shanda server sinxron `writeFileSync` + `renameSync` ishlatgani uchun event loop'ning bloklanishini ham inkor eta olmayman.
- **Ikkala holatga qarshi himoya qo'yildi.** Serverda endi bironta sinxron fayl operatsiyasi so'rov ichida yo'q (faqat ishga tushishdagi o'qish). Har bir operatsiya 5 s bilan cheklangan va timeout'da 504 "Qayta urinib ko'ring" qaytaradi. Brauzer 15 s dan ko'p kutmaydi.
- **Qo'shimcha kuzatuv:** yopiq portga `localhost` orqali ulanish Windows'da ~2–2.5 s davom etadi (curl avval `::1`, keyin `127.0.0.1` ni sinaydi). API ishlamay turganda bu ham "sekinlik" bo'lib ko'rinadi.

O'lchovdagi kamchilik: o'lchov boshida avvalgi (to'xtatilgan) benchmark jarayoni tirik qolib, 1–6-yugurishlar paytida parallel ishlagan. Undan qolgan 400/404 javoblar jadvaldan chiqarildi. Parallel yuk vaqtlarni biroz oshirgan bo'lishi mumkin.

### Qarorlar (2-qism)

1. **Timeout 5 s** (`OP_TIMEOUT_MS` bilan o'zgartiriladi). U so'rovni kutishdan ozod qiladi, lekin fayl yozishning o'zini to'xtatmaydi. Shuning uchun navbat buzilmaydi: bir vaqtda bitta yozuv, keyingisi oldingisi haqiqatan tugagandan keyin boshlanadi.
2. **Atomik yozish:** har safar noyob temp fayl (`.<nom>.<pid>.<n>.tmp`) yoziladi, keyin `rename` qilinadi. Yozish paytidagi o'zgarishlar keyingi yozuvga birlashtiriladi.
3. **Barcha o'zgartiruvchi endpoint'lar** (case, xabar, tahlil, ariza, maydon, rozilik, imzo, yuborish, idora amallari, login) javobdan oldin faylga yozilishini kutadi. Shunda qayta ishga tushishda ma'lumot yo'qolmaydi.
4. **Eskalatsiya:** "Kimga:" qatoriga idora nomi hech qanday qo'shimchasiz, katalogdagidek yoziladi ("Kimga: Kambag'allikni qisqartirish va bandlik vazirligi"). Faktik qatorda esa so'ralgandek "<idora nomi>ga" yoziladi. Sana `dd.mm.yyyy` (Toshkent vaqti), raqam — simulyator kvitansiyasi.
5. **Soat:** "+15 kun" har bir arizaga alohida qo'llanadi (ariza yonidagi tugma). Faqat ochiq holatlarda (SUBMITTED, RECEIVED, IN_REVIEW) ishlaydi; boshqasida 409. Endpoint faqat simulyator kabineti controller'ida bor. Tugma `adapterType === "MOCK"` bo'lgandagina ko'rinadi.
6. **`DEMO_SPEED` bo'sh qiymat** ham qo'lda rejim hisoblanadi. `.env.example` da `DEMO_SPEED` izohga olindi.
7. **Eski `data/runtime/submissions.json`** fayllari yangi format bilan ham o'qiladi: `dueAt` endi saqlanmaydi, hisoblanadi; `shiftDays` standart 0.
