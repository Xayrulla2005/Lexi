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

Bir marta:

```bash
git clone <repo havolasi>
cd lex-dispetcher
pnpm install
cp .env.example .env
```

Har safar yangi ish boshlaganda:

```bash
git checkout main
git pull
git checkout -b web/chat-dizayn      # Dilfuza: bot/matnlar
# ... fayllarni o'zgartiring ...
git add .
git commit -m "Chat sahifasi ranglari"
git push -u origin web/chat-dizayn
```

Keyin GitHub sahifasida **Compare & pull request** tugmasini bosing.

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
