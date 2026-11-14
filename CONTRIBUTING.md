# Qanday ishlaymiz

## Asosiy qoida

`main` shoxiga hech kim to'g'ridan-to'g'ri yozmaydi. Har bir o'zgarish: **o'z shoxingiz → pull request → Xayrulla yoki Jayhun tasdiqlaydi → main**.

## Kim qayerda ishlaydi

| Kim | Papka yoki fayl |
| --- | --- |
| Xayrulla | `apps/api`, `apps/web/src/app`, `apps/web/src/lib`, `apps/bot/src/index.ts`, `apps/bot/src/api.ts`, `data/import` |
| Jayhun | `libs/ai` |
| Xayrulla + Jayhun | `libs/contracts` |
| Sevinchoy | `apps/web/src/content`, `apps/web/src/components/ui`, `apps/web/src/styles` |
| Dilfuza | `apps/bot/src/texts.uz.ts`, `apps/bot/src/keyboards.ts` |
| Mirjalol | Google Sheets → `data/raw/*.csv` (Xayrulla yoki Jayhun yuklaydi) |

Boshqa faylga tegish kerak bo'lsa — avval Xayrullaga yozing.

## Sevinchoy va Dilfuza uchun: qadamma-qadam

Sizda asosiy repoga faqat **o'qish** huquqi bor. Siz o'z nusxangizda (fork) ishlaysiz va o'zgarishni pull request bilan yuborasiz. Shuning uchun asosiy kodni tasodifan buzib qo'yish imkonsiz.

Bir marta:

1. GitHub'da asosiy repo sahifasida **Fork** tugmasini bosing.
2. Terminalda:

```bash
git clone https://github.com/<SIZNING_LOGIN>/lex-dispetcher.git
cd lex-dispetcher
git remote add upstream https://github.com/<TASHKILOT>/lex-dispetcher.git
pnpm install
cp .env.example .env
```

Har safar yangi ish boshlaganda:

```bash
git checkout main
git pull upstream main               # eng yangi kodni olish
git checkout -b web/chat-dizayn      # Dilfuza: bot/matnlar
# ... faqat o'zingizga ruxsat berilgan fayllarni o'zgartiring ...
git add .
git commit -m "Chat sahifasi ranglari"
git push -u origin web/chat-dizayn
```

Keyin GitHub'da o'z nusxangiz sahifasida **Compare & pull request** tugmasini bosing. Xayrulla yoki Jayhun ko'rib chiqib qo'shadi.

## Ishga tushirish

```bash
docker compose up -d     # baza (Xayrulla, Jayhun)
pnpm dev:api             # API: http://localhost:3001
pnpm dev:web             # veb: http://localhost:3000
pnpm dev:bot             # bot (.env da TELEGRAM_BOT_TOKEN kerak)
pnpm mock                # API tayyor bo'lmasa: soxta API http://localhost:4010
```

Mock bilan ishlash uchun `.env` da `NEXT_PUBLIC_API_URL=http://localhost:4010` va `API_URL=http://localhost:4010` qiling.

## Maxfiy narsalar

`.env` faylini hech qachon repoga qo'shmang va chatga tashlamang.
