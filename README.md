# Lex Dispetcher

LexHackathon 2026 — "Huquqiy xizmatlarni ko'rsatish" yo'nalishi.

Inson muammosini ovoz yoki matn bilan aytadi. AI xavfni baholaydi, holatni tahlil qiladi, to'g'ri idorani tanlaydi, arizani tayyorlaydi, roziligi bilan yuboradi va natijasini kuzatadi.

## Tuzilma

```text
apps/
  api/          NestJS — murojaatlar, yo'naltirish, simulyator      (Xayrulla)
  web/          Next.js — chat, natija, simulyator paneli           (Xayrulla + Sevinchoy)
  bot/          grammY — Telegram bot                               (Xayrulla + Dilfuza)
libs/
  contracts/    OpenAPI va umumiy sxemalar                          (Xayrulla + Jayhun)
  ai/           analyze(): xavf, qidiruv, tasnif, tekshiruv, baholash (Jayhun)
data/
  raw/          Mirjalolning CSV jadvallari
  import/       CSV ni tekshiruvchi skript
docs/
  ARCHITECTURE.md
```

Batafsil: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Ish tartibi: [CONTRIBUTING.md](CONTRIBUTING.md)

## Tez boshlash

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev:api      # http://localhost:3001
pnpm dev:web      # http://localhost:3000  (simulyator: /simulator)
```

Sinov:

```bash
curl -X POST localhost:3001/cases -H 'content-type: application/json' -d '{"channel":"web"}'
```

## Muhim qoidalar

- `main` ga faqat pull request orqali.
- Idorani AI emas, `apps/api/src/routing` tanlaydi.
- Murojaat faqat foydalanuvchi roziligi bilan yuboriladi (`consent: true`).
- Simulyator har doim "SIMULYATOR — demo rejim" yozuvi bilan ko'rsatiladi.
