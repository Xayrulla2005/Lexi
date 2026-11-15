# Contributing

## Rules

1. **Never commit directly to `main`.** Enable branch protection on GitHub:
   require a PR, at least 1 approving review, passing `CI / check`, and CODEOWNERS review.
2. **Every feature has a GitHub Issue** (use the issue templates).
3. **Every change goes through a Pull Request** that links its issue (`Closes #12`).
4. **PRs must pass CI** (lint, typecheck, tests, build).
5. **Code review is required before merging.** Owners are listed in `.github/CODEOWNERS`.
6. **Conventional Commits** for every commit.

## Branches

| Prefix | Use |
| --- | --- |
| `feature/*` | New functionality — `feature/api-cases-persistence` |
| `fix/*` | Bug fixes — `fix/bot-consent-button` |
| `docs/*` | Documentation only — `docs/security-update` |
| `chore/*` | Tooling, deps, refactors — `chore/ci-cache` |

## Commit messages

`<type>(<scope>): <summary>` — types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.
Scopes: `api`, `web`, `bot`, `ai`, `contracts`, `legal-engine`, `legal-knowledge`, `data`, `repo`, `architecture`.

```text
feat(api): initialize cases module
feat(ai): add hugging face provider interface
docs(architecture): add system overview
chore(repo): initialize monorepo
```

## Before opening a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
```

If you change `@lex/contracts`, update all consumers, `docs/api/contracts.md`
and `docs/api/openapi.yaml` in the same PR.

## Non-negotiables

- No secrets or real personal data in Git. `.env` stays local.
- AI output never makes routing or submission decisions.
- No legal article, deadline, phone number or procedure is marked verified
  without a reviewer (see [docs/legal-sources](docs/legal-sources/README.md)).
- No submission without explicit user consent. Never claim a real government integration.

## Ownership

| Who | Folders / files |
| --- | --- |
| Xayrulla | `apps/api`, `apps/web/src/app`, `apps/web/src/lib`, `apps/bot/src/index.ts`, `apps/bot/src/api.ts`, `data/import` |
| Jayhun | `ai/` |
| Xayrulla + Jayhun | `packages/contracts`, `packages/legal-engine`, `legal-knowledge/` |
| Sevinchoy | `apps/web/src/content`, `apps/web/src/components/ui`, `apps/web/src/styles` |
| Dilfuza | `apps/bot/src/texts.uz.ts`, `apps/bot/src/keyboards.ts` |
| Mirjalol | Google Sheets → `data/raw/*.csv` (uploaded by Xayrulla or Jayhun) |

If you need to touch someone else's files, ask the owner first.

---

## Sevinchoy va Dilfuza uchun: qadamma-qadam (o'zbekcha)

Sizda asosiy repoga faqat **o'qish** huquqi bor. Siz o'z nusxangizda (fork)
ishlaysiz va o'zgarishni pull request bilan yuborasiz. Shuning uchun asosiy
kodni tasodifan buzib qo'yish imkonsiz.

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
git pull upstream main                    # eng yangi kodni olish
git checkout -b feature/web-chat-dizayn   # Dilfuza: feature/bot-matnlar
# ... faqat o'zingizga ruxsat berilgan fayllarni o'zgartiring ...
git add .
git commit -m "feat(web): chat sahifasi ranglari"
git push -u origin feature/web-chat-dizayn
```

Keyin GitHub'da o'z nusxangiz sahifasida **Compare & pull request** tugmasini
bosing. Xayrulla yoki Jayhun ko'rib chiqib qo'shadi.

Ishga tushirish:

```bash
pnpm dev:api             # API: http://localhost:3001
pnpm dev:web             # veb: http://localhost:3000
pnpm dev:bot             # bot (.env da TELEGRAM_BOT_TOKEN kerak)
pnpm mock                # API tayyor bo'lmasa: soxta API http://localhost:4010
```

Mock bilan ishlash uchun `.env` da `NEXT_PUBLIC_API_URL=http://localhost:4010`
va `API_URL=http://localhost:4010` qiling.

Maxfiy narsalar: `.env` faylini hech qachon repoga qo'shmang va chatga tashlamang.
