# data/raw — Mirjalolning jadvallari

Bu papkaga Google Sheets'dan **CSV** qilib eksport qilingan fayllar tushadi:

| Fayl | Nima |
| --- | --- |
| `agencies.csv` | Idoralar ro'yxati |
| `test_cases.csv` | Test hikoyalar va to'g'ri javoblar (bir nechta qiymat `;` bilan ajratiladi) |
| `routes.csv` | Tekshirilgan yo'l xaritasi (keyinroq) |

Qoidalar:

- Ustun nomlarini o'zgartirmang.
- Fayllarni Xayrulla yoki Jayhun yuklaydi. Import skripti (`data/import`) har bir qatorni tekshiradi va xatoli qatorni rad etadi.
- Haqiqiy shaxsiy ma'lumot (ism, telefon, manzil) yozmang.
