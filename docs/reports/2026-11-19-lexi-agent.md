# Lexi — huquqiy dispetcher (2026-11-19)

Branch: `feat/lexi-agent` (push qilinmagan). Lexi — chatbot emas, dispetcher: har bir murojaat bir xil oqimdan o'tadi:
**TRIAGE → TAFSILOTLAR → TUSHUNTIRISH → YO'L XARITASI → HARAKAT (rozilik bilan) → KUZATUV**.

## Commit'lar

| Commit | Mazmuni |
|---|---|
| `ad7429f` | feat(lexi): suhbat dvigateli (state machine, `/conversations` API) va favqulodda chaqiruv simulyatori (102 / 103 / 1146) |
| `09db52d` | feat(web): chat-first interfeys; idora kabinetiga deep link (`/idora?submission=`), "Navbatchi qism — SIMULYATOR" |
| `9433308` | feat(bot): Telegram'da o'sha dvigatel; HARAKAT → "📝 Vebda imzolab yuborish" |
| `b928691` | test(ai): triage signal testlari |
| `2e0e8d4` | fix(lexi): qisqa zaxira intake savollari; o'qiladigan javob yorliqlari |
| `0bc879d` | feat(lexi): "✓ Yorliq: qiymat" tasdiqlari va "Sizdan olingan ma'lumotlar" kartasi (veb + bot) |
| `d974f69` | fix(ai): tushuntirishdagi takror jumlalarni olib tashlash; Gemini `thoughtSignature` ogohlantirishisiz matn o'qish |
| `62af92f` | fix(lexi): triage signalidan keyin LLM idora tanlamasa — katalogdagi idoralar |

Tekshiruv (oxirgi holat): `pnpm lint`, `typecheck`, `test`, `build` — hammasi o'tdi.
Testlar: contracts 8, web 7, bot 7, legal-engine 14, ai 70, api 41 (shu jumladan `tests/integration/lexi.spec.ts` — 3 ssenariy + 3 maxsus holat, LLM mock bilan).

## Oqim qanday ishlaydi

1. **TRIAGE** — kalit so'zlar (avariya, jarohat, zo'ravonlik, tahdid, yong'in, bola xavfda, o'z joniga qasd; lotin/kirill/rus).
   Signal bo'lsa — bitta savol: "Siz yoki boshqa birov jarohat oldimi? Hozir xavfsiz joydamisiz?". Aniq "yo'q"dan boshqa har qanday javob = xavf.
   "Qizil" kalit so'zlar (pichoq, o'ldiraman, …) — LLM'ni kutmasdan darhol EMERGENCY kartasi. LLM risk=red bersa ham karta chiqadi.
   Kartada faqat katalogdagi raqamlar (102, 1146, 103), `tel:` tugmalari va rozilik so'raladigan "chaqiruv (simulyator)" tugmalari.
2. **TAFSILOTLAR** — problemId aniq bo'lmasa, top-2 nomzoddan tanlash ("Hech biri" ham bor). Keyin shablon maydonlari (yoki katalogdan tashqari holatda faktlar) bo'yicha ko'pi bilan 4 ta savol, bittadan.
   Birinchi savoldan oldin bitta qisqa "Sizni shunday tushundim: …" (faqat hikoyadagi faktlar). Har javobdan keyin faqat `✓ Yorliq: qiymat`; "Bilmayman" → "ma'lum emas".
   Tushuntirishdan oldin bitta yig'ma karta: "Sizdan olingan ma'lumotlar".
3. **TUSHUNTIRISH** — `retrieveForAnalysis` moddalari asosida "Huquqlaringiz" / "E'tibor bering"; har jumlada modda belgisi (bosilganda modda matni + lex.uz havola). Citation-validator bazada yo'q moddani tashlaydi; endi takror jumlalar ham olib tashlanadi.
4. **YO'L XARITASI** — katalog marshruti: nima qilish → kimga (faqat katalog idoralari) → hujjatlar (shablonning "Ilova:" qatori) → muddat (faqat moddada/katalogda bo'lsa) → javob bo'lmasa keyingi idora; `hali_erta` → "Hozircha bormang".
   Katalogdan tashqari: LLM faqat katalog ro'yxatidan idora tanlaydi; tanlamasa va triage signali bo'lsa — signal uchun katalog idoralari (avariya → YHXX, sug'urta). Ariza taklifi faqat katalog marshrutida.
5. **HARAKAT** — "Men siz nomingizdan … murojaat yuboraymi?" [Ha][Yo'q] → OneID simulyatori → ariza (javoblar maydonlarga tushadi) → rozilik → ERI → yuborish. Rozilikdan oldin hech narsa yuborilmaydi.
6. **KUZATUV** — holat o'zgarishlari Lexi xabari bo'lib keladi ("qabul qildi", "javob keldi: …", "Muddat o'tdi — yuqori idoraga yuboraymi?"); har birida "Idora kabinetida qanday ko'rinishini ko'rish".

## Qarorlar

- **Xavfsizlik deterministik.** Triage va qizil kalit so'zlar LLM'ga bog'liq emas: Gemini ishlamasa ham EMERGENCY kartasi chiqadi.
- **Telefon, muddat, idora — faqat katalog/moddadan.** LLM idora tanlasa ham faqat `id` qaytaradi, nomi va raqami katalogdan olinadi; o'ylab topilgan id tashlanadi (testda `invented_agency`).
- **Tasdiqlar qisqa.** Avval har javobdan keyin butun "Sizni shunday tushundim" matni qayta yozilardi va uzayib borardi. Endi LLM har savolga 1–3 so'zli yorliq beradi ("Tashkilot nomi", "Lavozim", "Summa"); yorliq savol yoki uzun matn bo'lsa, kalitdan deterministik yorliq olinadi. Testda: har tasdiq `✓ …: …` ko'rinishida va javob uzunligi + 40 belgidan oshmaydi; "Sizni shunday tushundim" faqat bir marta.
- **Takrorlarni olib tashlash.** Prompt'ga "har bir fikrni bir marta yoz" qoidasi + oddiy dedup: bir xil moddaga havola va so'z o'zaklari (4 harf) bo'yicha Jaccard ≥ 0.25 bo'lsa, keyingi jumla tashlanadi.
- **Gemini matni.** SDK'ning `text` getter'i o'rniga `candidates[0].content.parts` dan faqat matn qismlari (thought va `thoughtSignature` qismlarisiz) olinadi — logda ogohlantirish yo'q (oxirgi real yugurishda 0 ta).
- **Bot = veb.** Bot o'sha `/conversations` API'dan foydalanadi; kartalar matn + inline tugma; OneID/ERI vebda (`/?c=<conversationId>`).
- **Simulyator belgisi.** Navbatchi qism, chaqiruv, ariza — hammasida "SIMULYATOR"; haqiqiy davlat dizayni ishlatilmagan.

## Real Gemini yugurishi

- Model: `GEMINI_MODEL=gemini-3.5-flash-lite` (buyruq qatorida; `.env` o'qilmagan va o'zgartirilmagan), `LLM_PROVIDER=gemini`.
- API `PORT=3099`, alohida `RUNTIME_DIR`; ssenariylar node skripti bilan HTTP orqali ketma-ket yurgizildi — bir vaqtda 1 ta so'rov.
- 429 yo'q, xato yo'q, kvota yetdi. Uchala ssenariy boshidan oxirigacha o'tdi: L1 14.4 s, L2 15.7 s, L3 6.3 s.
- Skript foydalanuvchi o'rnida savolga mos javob beradi (masalan, "tashkilot" savoliga "Namuna MChJ"); noma'lum savolga "Bilmayman".
- L2 da OneID, maydonlar, rozilik, ERI, yuborish, kabinet paketi (`submission, caseInfo, citizen, consentAt, signature, signatureCheck`), `RECEIVED` va javob — API orqali; L3 da `call:` → `call_confirm:` → navbatchi qismda `CREW_DISPATCHED`.

### Transkriptlar (real Gemini, o'zgartirishsiz)

#### L1-accident (14.4 s)

**Lexi:** Assalomu alaykum! Men Lexi — huquqiy dispetcherman. Nima bo'lganini oddiy so'zlar bilan yozing: avval xavfsizligingizni tekshiraman, keyin huquqlaringizni tushuntirib, qayerga va qanday murojaat qilishni ko'rsataman.

**Foydalanuvchi:** Avariya bo'ldim

**Lexi:** Siz yoki boshqa birov jarohat oldimi? Hozir xavfsiz joydamisiz?
> Tugmalar: [Ha, xavf bor] [Yo'q, xavfsizman]

**Foydalanuvchi:** Yo'q, xavfsizman

**Lexi:** Yaxshi, xavf yo'qligi ma'qul. Endi holatingizni aniqlaymiz.

**Lexi:** Holatingiz qaysi biriga yaqinroq?
> Tugmalar: [Yo'l harakati qoidasini buzganlik uchun asossiz jarima] [Hech biri]

**Foydalanuvchi:** Hech biri

**Lexi:** Sizni shunday tushundim: Siz avariya sodir bo'lganini aytdingiz.

**Lexi:** Avariya qachon va qayerda sodir bo'ldi?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Kecha kechqurun, Chilonzor ko'chasida

**Lexi:** ✓ Vaqt va joy: Kecha kechqurun, Chilonzor ko'chasida

**Lexi:** Yana kimlar ishtirok etdi?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Bilmayman

**Lexi:** ✓ Ishtirokchilar: ma'lum emas

**Lexi:** YPX xodimlari chaqirilib, bayonnoma tuzildimi?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Bilmayman

**Lexi:** ✓ Hujjatlar: ma'lum emas

**Lexi:** Sizdan olingan ma'lumotlar:
> Vaqt va joy: Kecha kechqurun, Chilonzor ko'chasida
> Ishtirokchilar: ma'lum emas
> Hujjatlar: ma'lum emas

**Lexi:** Bazamizdagi moddalarda bu holat bo'yicha aniq ma'lumot topilmadi.

**Lexi:** Murojaat qilish mumkin bo'lgan idoralar (katalogdan):
> (manba: catalog)
> 1. IIV Yo'l harakati xavfsizligi xizmati (102)
> 2. Sug'urta kompaniyasi

**Lexi:** Bu holat uchun tayyor ariza shabloni yo'q, shuning uchun men nomingizdan ariza yubora olmayman.

#### L2-unpaid-wages (15.7 s)

**Lexi:** Assalomu alaykum! Men Lexi — huquqiy dispetcherman. Nima bo'lganini oddiy so'zlar bilan yozing: avval xavfsizligingizni tekshiraman, keyin huquqlaringizni tushuntirib, qayerga va qanday murojaat qilishni ko'rsataman.

**Foydalanuvchi:** 3 oydan beri oylik berishmayapti

**Lexi:** Sizni shunday tushundim: Sizga 3 oydan beri oylik berishmayapti.

**Lexi:** Qaysi tashkilotda ishlaysiz?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Namuna MChJ

**Lexi:** ✓ Tashkilot nomi: Namuna MChJ

**Lexi:** Lavozimingiz qanday?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Hisobchi

**Lexi:** ✓ Lavozim: Hisobchi

**Lexi:** To'lanmagan ish haqi summasi qancha?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Bilmayman

**Lexi:** ✓ Summa: ma'lum emas

**Lexi:** Sizdan olingan ma'lumotlar:
> Tashkilot nomi: Namuna MChJ
> Lavozim: Hisobchi
> Summa: ma'lum emas

**Lexi:** Qonun bo'yicha holatingiz:
> Huquq: Ish beruvchi ish haqini toʻlash muddatini buzgan taqdirda, uni har bir kechiktirilgan kun uchun foizlar bilan birga toʻlashi shart. `mehnat_kodeksi/333`
> Huquq: Ish beruvchining moddiy javobgarligi oylik ish haqini toʻlashning kechiktirilishida aybi bor-yoʻqligidan qatʼi nazar yuzaga keladi. `mehnat_kodeksi/333`
> Huquq: Xodim ish beruvchining soʻroviga koʻra oʻzining hisob-kitoblari va ushlab qolishlari toʻgʻrisida xabardor qilinishini talab qilish huquqiga ega. `mehnat_kodeksi/253`
> Huquq: Xodimga kechiktirilgan har bir kun uchun Markaziy bank qayta moliyalashtirish stavkasining oʻn foizi miqdorida pulli kompensatsiya toʻlanishi kerak. `mehnat_kodeksi/333`
> Moddalar: [mehnat_kodeksi/253](https://lex.uz/uz/docs/-6257288#-6263813), [mehnat_kodeksi/333](https://lex.uz/uz/docs/-6257288#-6265195)

**Lexi:** Yo'l xaritasi:
> (manba: catalog)
> 1. Ish beruvchiga yozma talabnoma, keyin Davlat mehnat inspeksiyasi; murojaat muddati — 3 oy; hujjatlar: mehnat shartnomasi, ish haqi hisob-kitobi, bank ko‘chirmasi
> 2. Qarshi taraf (qarzdor, sotuvchi, ish beruvchi va h.k.)
> 3. Davlat mehnat inspeksiyasi (1176; +998 71 200-06-00)
> 4. Fuqarolik ishlari bo'yicha tumanlararo sud (+998 71 207-73-77 (devonxona); +998 71 207-97-37 (ishonch))
> 5. Javob bo'lmasa: Kambag'allikni qisqartirish va bandlik vazirligi
> Hozircha bormang: Prezident virtual qabulxonasi, Bosh prokuratura yoki hududiy prokuratura

**Lexi:** Men siz nomingizdan Davlat mehnat inspeksiyasiga murojaat yuboraymi?
> Tugmalar: [Ha] [Yo'q]

**Lexi:** Ariza yuborish uchun avval OneID simulyatori orqali kiring, keyin «Ha»ni qayta bosing.
> [OneID simulyatoriga kirish: /kirish?c=e87326d6-7387-4163-bbbc-f8e25fe3fd68]

**Lexi:** Ariza tayyor. Tekshirib chiqing, «Ma'lumotlarim to'g'ri…» belgisini qo'ying, ERI bilan imzolang va yuboring. Rozilikdan oldin hech narsa yuborilmaydi.
> [Ariza kartasi: tekshirish → rozilik → ERI → yuborish]

**Lexi:** Arizangiz Davlat mehnat inspeksiyasiga yuborildi. Raqami: SIM-MI-00451.
> Holat: SUBMITTED · SIM-MI-00451 · Davlat mehnat inspeksiyasi · /idora?submission=40935547-660b-419e-9c3f-89da148e9e87
> Tugmalar: [Idora kabinetida qanday ko'rinishini ko'rish]

**Lexi:** Davlat mehnat inspeksiyasidan javob keldi: «Tekshiruv tayinlandi.»
> Holat: ANSWERED · SIM-MI-00451 · Davlat mehnat inspeksiyasi · /idora?submission=40935547-660b-419e-9c3f-89da148e9e87
> Tugmalar: [Idora kabinetida qanday ko'rinishini ko'rish]

Qo'shimcha tekshiruvlar: application draft: ["malumot_3","summa"]; cabinet package: ["submission","caseInfo","citizen","consentAt","signature","signatureCheck"]

#### L3-domestic-violence (6.3 s)

**Lexi:** Assalomu alaykum! Men Lexi — huquqiy dispetcherman. Nima bo'lganini oddiy so'zlar bilan yozing: avval xavfsizligingizni tekshiraman, keyin huquqlaringizni tushuntirib, qayerga va qanday murojaat qilishni ko'rsataman.

**Foydalanuvchi:** Erim urdi, hozir uyda qo'rqyapman

**Lexi:** Siz yoki boshqa birov jarohat oldimi? Hozir xavfsiz joydamisiz?
> Tugmalar: [Ha, xavf bor] [Yo'q, xavfsizman]

**Foydalanuvchi:** Ha, xavf bor

**Lexi:** Tushundim. Avval yordam chaqiring — quyidagi raqamlar:
> Tuman (shahar) ichki ishlar organi — 102
> Xotin-qizlar uchun ishonch telefoni — 1146
> Tez tibbiy yordam — 103
> Tugmalar: [📞 102 — Tuman (shahar) ichki ishlar organi] [📞 1146 — Xotin-qizlar uchun ishonch telefoni] [📞 103 — Tez tibbiy yordam] [📟 Tuman (shahar) ichki ishlar organiga chaqiruv (simulyator)] [📟 Xotin-qizlar uchun ishonch telefoniga chaqiruv (simulyator)] [📟 Tez tibbiy yordamga chaqiruv (simulyator)]

**Lexi:** Xavfsiz joyga o'tgach, suhbatni davom ettiramiz: huquqlaringiz va keyingi qadamlarni ko'rsataman.

**Lexi:** Sizni shunday tushundim: Erim urdi, hozir uyda qo'rqyapman.

**Lexi:** Turmush o'rtog'ingizning F.I.Sh. qanday?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Bilmayman

**Lexi:** ✓ Turmush o'rtog'i: ma'lum emas

**Lexi:** Bu holat qachon sodir bo'ldi?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Bilmayman

**Lexi:** ✓ Sana: ma'lum emas

**Lexi:** Sizga nisbatan qanday tazyiq o'tkazildi?
> Tugmalar: [Bilmayman]

**Foydalanuvchi:** Bilmayman

**Lexi:** ✓ Zo'ravonlik turi: ma'lum emas

**Lexi:** Sizdan olingan ma'lumotlar:
> Turmush o'rtog'i: ma'lum emas
> Sana: ma'lum emas
> Zo'ravonlik turi: ma'lum emas

**Lexi:** Qonun bo'yicha holatingiz:
> Huquq: Oilaviy zoʻravonlik va badanga yengil shikast yetkazish holatlari qonunga koʻra maʼmuriy yoki jinoiy javobgarlikka sabab boʻlishi mumkin. `mamuriy_javobgarlik_kodeksi/59-2, jinoyat_kodeksi/126-1`
> Huquq: Oilaviy zoʻravonlikdan jabrlangan shaxsning talabiga koʻra sud nikohdan ajratish ishlarida yarashish uchun muhlat tayinlamaydi. `oila_kodeksi/40`
> Moddalar: [jinoyat_kodeksi/126-1](https://lex.uz/uz/docs/-111453#-6438712), [mamuriy_javobgarlik_kodeksi/59-2](https://lex.uz/uz/docs/-97664#-6437241), [oila_kodeksi/40](https://lex.uz/uz/docs/-104720#-158840)

**Lexi:** Yo'l xaritasi:
> (manba: catalog)
> 1. Xavf bo'lsa darhol 102; himoya orderi uchun profilaktika inspektoriga; hujjatlar: tibbiy ma’lumotnoma, fotosuratlar, yozishmalar, guvohlar ma’lumotlari
> 2. Tuman (shahar) ichki ishlar organi (102)
> 3. Profilaktika inspektori (Mening inspektorim) (102)
> 4. Xotin-qizlar uchun ishonch telefoni (1146)
> 5. Javob bo'lmasa: Bosh prokuratura yoki hududiy prokuratura (1007)

**Lexi:** Men siz nomingizdan Tuman (shahar) ichki ishlar organiga murojaat yuboraymi?
> Tugmalar: [Ha] [Yo'q]

**Lexi:** Xotin-qizlar uchun ishonch telefoniga SIMULYATOR orqali chaqiruv yuborilsinmi? Haqiqiy xizmatga hech narsa ketmaydi. Chaqiruvda hikoyangiz matni va test fuqaro ma'lumotlari bo'ladi.
> Tugmalar: [Roziman, yuborish] [Bekor qilish]

**Lexi:** Chaqiruv yuborildi (SIMULYATOR): Xotin-qizlar uchun ishonch telefoni. Holat: ekipaj yuborildi.
> SIMULYATOR: Xotin-qizlar uchun ishonch telefoni — CREW_DISPATCHED

Qo'shimcha tekshiruvlar: duty desk: [{"agency":"ishonch_1146","status":"CREW_DISPATCHED"}]


## Ma'lum muammolar

- **Avariya bo'yicha modda yo'q.** Indeksda faqat katalogda havola qilingan kodekslar bor; YTH (yo'l-transport hodisasi) moddalari yo'q. L1 da Lexi halol aytadi: "Bazamizdagi moddalarda … topilmadi" va katalog idoralarini (YHXX 102, sug'urta) ko'rsatadi. Oldingi yugurishlarda Gemini Fuqarolik kodeksining 14/324-moddalaridan (zararni qoplash) umumiy huquqlarni chiqargan — natija har safar bir xil emas.
- **Yong'in xizmati (101) katalogda yo'q** — yong'in signalida faqat katalogdagi raqamlar ko'rsatiladi; 101 qo'shish uchun katalogga yurist tasdiqlagan yozuv kerak.
- **Nomzod tanlash.** "Avariya bo'ldim" uchun Gemini P65 ni (asossiz YHQ jarimasi) nomzod qilib beradi; foydalanuvchi "Hech biri"ni bosishi kerak. Demoda shuni ko'rsatish kerak.
- **Dedup to'liq emas.** L2 da 333-modda bo'yicha uchta jumla qoldi, lekin ular turli jihatlar (foiz, aybdan qat'i nazar, 10% stavka). Juda o'xshashlari olib tashlanadi; ma'no bo'yicha o'xshashlikni so'z o'zaklari to'liq ushlamaydi.
- **L3 tushuntirishi.** "Sud yarashish uchun muhlat tayinlamaydi" (Oila kodeksi 40) — modda bor va havola to'g'ri, lekin bu ajrashish ishiga oid; yurist ko'rib chiqishi kerak.
- **Yorliqlar LLM'dan.** Gemini yorliqlarni o'zi so'zlaydi ("Tashkilot nomi", "Turmush o'rtog'i"); javob boshqa savolga berilsa (masalan, tashkilot o'rniga ism), yorliq baribir savolniki bo'ladi — foydalanuvchi buni yig'ma kartada va ariza formasida tuzatadi.
- **Intake ba'zan zaxiraga tushadi.** Bir yugurishda Gemini javobi sxemaga mos kelmadi; unda shablon matnidan qisqa savol beriladi ("Arizadagi quyidagi joy uchun ma'lumot bering: «… [____] …»"), yorliq "Ma'lumot".
- **Bot holati xotirada.** chat → conversation bog'lanishi `Map`da; bot qayta ishga tushsa, suhbat yangidan boshlanadi (TODO: saqlash).

## Demoda qanday ko'rsatish

Tayyorgarlik: alohida terminallarda `pnpm dev:api` (:3001) va `pnpm dev:web` (:3000), kerak bo'lsa `pnpm dev:bot`. Brauzerda ikkita oyna yonma-yon:
**chap — Lexi chati** (`http://localhost:3000/`), **o'ng — idora kabineti** (`http://localhost:3000/idora`). Har ssenariydan oldin chatda "Yangi suhbat".

### 1. Avariya (katalogdan tashqari holat, triage)
1. Chap oyna: "Avariya bo'ldim" deb yozing → Lexi xavfsizlik savolini beradi.
2. [Yo'q, xavfsizman] → "Holatingiz qaysi biriga yaqinroq?" → [Hech biri].
3. "Sizni shunday tushundim: …" va savollar bittadan: vaqt/joy, ishtirokchilar, bayonnoma. Bittasiga javob yozing, qolganiga [Bilmayman] — har biridan keyin `✓ …` tasdiqni ko'rsating.
4. "Sizdan olingan ma'lumotlar" kartasi → tushuntirish (yoki halol "topilmadi") → katalogdan idoralar (YHXX 102, sug'urta) → "tayyor shablon yo'q, ariza yubora olmayman".
5. Aytiladigan gap: telefon va idoralar faqat katalogdan; Lexi bilmaganini o'ylab topmaydi.

### 2. Oylik (to'liq yo'l: ariza → imzo → idora → javob)
1. Chap: "3 oydan beri oylik berishmayapti" → triage yo'q (xavf signali yo'q), darhol tafsilotlar.
2. Javoblar: "Namuna MChJ", "Hisobchi", summa uchun [Bilmayman] → yig'ma karta.
3. "Qonun bo'yicha holatingiz": modda belgisini bosing → modda matni va lex.uz havolasi ochiladi.
4. Yo'l xaritasi: talabnoma → mehnat inspeksiyasi (1176) → sud; hujjatlar ro'yxati; "Hozircha bormang: prokuratura, virtual qabulxona".
5. "Men siz nomingizdan Davlat mehnat inspeksiyasiga murojaat yuboraymi?" → [Ha] → OneID simulyatori (test fuqaro) → chatga qaytadi → [Ha] yana → ariza kartasi: javoblar maydonlarda, qolganini to'ldiring → "Ma'lumotlarim to'g'ri…" belgisi → ERI → Yuborish.
6. Chatda "Arizangiz … yuborildi. Raqami: SIM-MI-…" → [Idora kabinetida qanday ko'rinishini ko'rish] — o'ng oynada aynan shu ariza: paket tarkibi, imzo holati, xronologiya.
7. O'ng oyna (inspektor sifatida): [Qabul qilish], keyin [Javob yozish] — matn yozib yuboring → chap oynada 3 soniya ichida "… arizangizni qabul qildi" va "… javob keldi: «…»".

### 3. Oilaviy zo'ravonlik (favqulodda karta + simulyator chaqiruvi + himoya yo'li)
1. Chap: "Erim urdi, hozir uyda qo'rqyapman" → xavfsizlik savoli → [Ha, xavf bor].
2. EMERGENCY kartasi: 102, 1146, 103 (`tel:` tugmalari telefonda qo'ng'iroq qiladi) va "chaqiruv (simulyator)" tugmalari.
3. [Xotin-qizlar uchun ishonch telefoniga chaqiruv (simulyator)] → rozilik so'raladi → [Roziman, yuborish] → "Chaqiruv yuborildi (SIMULYATOR) … ekipaj yuborildi".
4. O'ng oyna: `/idora` → "Navbatchi qism — SIMULYATOR" bo'limida ishonch_1146 tanlang → chaqiruv: tavsif, vaqt, test fuqaro, "Ekipaj yuborildi".
5. Chap: savollarga [Bilmayman] → yig'ma karta → huquqlar (MJtK 59-2, JK 126-1) → himoya yo'li (102, profilaktika inspektori, 1146, prokuratura) → IIV'ga ariza taklifi.

Bot (ixtiyoriy): xuddi shu matnni Telegram botga yozing — savollar bittadan, kartalar matn sifatida; [Ha] o'rniga "📝 Vebda imzolab yuborish" — o'sha suhbatni vebda ochadi.
