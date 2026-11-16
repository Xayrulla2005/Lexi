# data — jamoa jadvallari

| Fayl | Nima |
| --- | --- |
| `agencies.csv` | Idoralar ro'yxati (33 ta; id'lar `legal-knowledge/catalog/problems.json` dagi `idoralar` bilan bir xil) |
| `import/` | Tekshiruv skripti: `pnpm import:data` |

Boshqa huquqiy ma'lumotlar:

- Muammolar katalogi, shablonlar: `legal-knowledge/` (holati: DRAFT, yurist tekshiruvi kutilmoqda)
- Test hikoyalar: `ai/eval/datasets/test_cases.csv`

Qoidalar:

- Ustun nomlarini o'zgartirmang.
- Fayllarni Xayrulla yoki Jayhun yuklaydi. `pnpm import:data` har bir qatorni va katalog bilan mosligini tekshiradi; xato bo'lsa CI to'xtaydi.
- Haqiqiy shaxsiy ma'lumot (ism, telefon, manzil) yozmang. Shaxsiy fayllar uchun `*.private.csv` nomidan foydalaning (git'ga tushmaydi).
