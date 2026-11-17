> Yo'llar arxivdagi tuzilishga ko'ra yozilgan. Repodagi joylashuv uchun legal-knowledge/README.md ni qarang.

# Huquqiy ma'lumotlar to'plami

Do'stingiz yuborgan 3 ta PDF (muammolar jadvali, hikoyalar, ariza namunalari) asosida tayyorlangan, tozalangan va to'ldirilgan ma'lumotlar.

## Nima bor

| Fayl | Nima uchun | Kimga |
| --- | --- | --- |
| `data/problems.json` | 65 ta muammo turi: soha, xavf, moddalar, birinchi qadam, organlar, eskalatsiya, "hali erta" organlar, tekshirish izohlari; 19 ta soha va 33 ta idora katalogi | Xayrulla (yo'naltirish), Jayhun (tasnif) |
| `data/test_cases.csv` | 261 ta hikoya: har turga 1 rasmiy + 3 jonli variant (qisqa, sheva, ruscha aralash yoki kirill) va to'g'ri javob | Jayhun (misollar va aniqlik testi) |
| `data/templates/T01.md … T65.md` | Ariza shablonlari, `{{fio}}`, `{{summa}}` kabi maydonlar bilan | Jayhun (ariza yozish) |
| `data/agencies.csv` | Idoralar ro'yxati (telefon, havola) | Xayrulla (import) |
| `data/TEKSHIRISH.md` | Tekshirilishi kerak bo'lgan barcha joylar ro'yxati | Mirjalol |
| `pdf/1-Muammolar-jadvali.pdf` | Jadval + idoralar + tekshirish ro'yxati | Jamoa, Mirjalol |
| `pdf/2-Hikoyalar.pdf` | Barcha hikoyalar va variantlar | Jamoa |
| `pdf/3-Arizalar.pdf` | Barcha ariza shablonlari | Jamoa, Mirjalol |
| `scripts/` | Hammasini qayta yasash skriptlari (`python3 scripts/build.py && python3 scripts/make_pdfs.py`) | Xayrulla |

## Do'st fayllaridan nima o'zgardi

- **Yo'qolgan yuqori indekslar tiklandi:** 1261 → 126¹, 592 → 59², 2781 → 278¹, 1251 → 125¹, 511 → 51¹, 473 → 47³, 474 → 47⁴, "1 040" → 1040.
- **Shubhali joylar belgilandi:** haqorat uchun "Jinoyat kodeksi 41-modda" (aslida MJtK 41, JK 140), nikoh yoshi qatoridagi MIB, pora qatorlaridagi pm.gov.uz havolasi va boshqalar.
- **Jadval va ariza namunasi bir-biriga zid bo'lgan joylarda** (tadbirkorlik, daraxt kesish, nogironlik) ikkala organ ham qoldirildi va belgilandi.
- **`utm_source=chatgpt.com` havolalardan olib tashlandi.** Bu ma'lumotning bir qismi ChatGPT'dan olinganini ko'rsatadi, shuning uchun hammasi tekshirilishi kerak.
- **Arizalardan ortiqcha yozuvlar ("Написание текста") olib tashlandi.** Bo'sh joylar maydonlarga aylantirildi, har bir arizaga "Kimdan" qatori qo'shildi.
- **Yangi tur P50 "Ota-onalik huquqini suiiste'mol qilish"** qo'shildi (faqat ariza namunasida bor edi), unga hikoya ham yozildi.
- **15 ta yangi tur (P51–P65)** qo'shildi: iste'molchi, kommunal xizmat, bank, kredit firibgarligi, pensiya, nafaqa, davlat organi javob bermasligi, davlat xizmati, chet eldagi ish haqi, chet elda pasportni olib qo'yish, maktabda tazyiq, maktabda pul yig'ish, tibbiyot, yo'l jarimasi.
- **Har bir turga 3 ta jonli variant** qo'shildi. Sheva variantlari Xorazm, Toshkent, Farg'ona, Samarqand va Surxondaryo bo'yicha.

## Muhim

- **Bu ma'lumot o'qitish (fine-tuning) uchun emas.** U AI'ning bilim bazasi, yo'naltirish qoidalari, misollari va aniqlik testi uchun.
- **P51–P65 dagi qonunlar faqat nomi bilan berilgan.** Modda raqamlarini Mirjalol lex.uz'dan qo'shadi.
- **Asl rasmiy hikoyalar (`uslub = rasmiy`) testda saqlanib qolsin**, ularni AI'ga misol sifatida bermang. Aks holda aniqlik o'lchovi soxta chiqadi.
- **Kodga ulashda yangilanishi kerak bo'lgan joylar:**
  - `Category` ro'yxatiga 4 ta yangi soha qo'shilsin: `fuqarolik_nizo`, `jinoyat`, `korrupsiya`, `jamoat_tartibi`.
  - Import skriptidagi test id formati (`T01`) bu yerdagi `P01_A1` ga moslashtirilsin.

## Idoralar: ixtiyoriy `javob_muddati`

`idoralar.<id>.javob_muddati` — idoraning javob berish muddati (kunda, butun musbat son). Maydon ixtiyoriy va hozir hech bir idorada to'ldirilmagan. Uni faqat yurist, manbasi tekshirilgandan keyin qo'shadi. Maydon bo'lmasa, simulyator `SIM_RESPONSE_DAYS` qiymatini ishlatadi (standart 15). Ariza yuborilgan paytdagi muddat ariza bilan birga saqlanadi.

