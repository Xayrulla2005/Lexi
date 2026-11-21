# Lexi MVP — Implementation Report (Phase 0–4, Security Gate 1)

Sana: 2026-11-21 · Branch: `feat/lexi-intents` · Baseline: `5945261` · Audit: [LEXI_MVP_BASELINE_AUDIT.md](LEXI_MVP_BASELINE_AUDIT.md)

**Holat:**
- Phase 0, 1, 2 bajarildi va **Security Gate 1 o'tdi**.
- Phase 3 bajarildi: foydalanuvchi ruxsati bilan `@nestjs/throttler` va `helmet` o'rnatildi; barcha tekshiruvlar o'tdi (§4.3, §6.2).
- Phase 4 bajarildi: ariza holat mashinasi, takroriy yuborishdan himoya (lock va `Idempotency-Key`), `AuditEvent`; yangi paket qo'shilmadi (§4.4, §6.3).
- Phase 5–10 boshlanmadi.
- Commit va push qilinmadi. `.env` o'qilmadi. Boshqa yangi paket o'rnatilmadi.

---

## 1. Baseline

| | |
|---|---|
| Branch / commit | `feat/lexi-intents` / `5945261` |
| Ish boshidagi `git status` | toza (faqat yangi `docs/audit/`) |
| Baseline testlar (`pnpm test`) | exit 0 — 181 ta: contracts 8, web 7, bot 8, legal-engine 14, ai 99, api 45 |
| Baseline fail'lar | yo'q |

## 2. Bajarilgan phase'lar

| Phase | Holat |
|---|---|
| 0 — baseline va reja | ✅ |
| 1 — authentication va citizen ownership | ✅ |
| 2 — simulator xavfsizligi | ✅ |
| Security Gate 1 | ✅ o'tdi |
| 3 — rate limiting va hardening | ✅ (ruxsat bilan 2 ta paket) |
| 4 — application gateway hardening | ✅ |
| 5–10 | boshlanmadi |

## 3. Agentlar va file ownership

Multi-agent vositasi ishlatilmadi. Lead agent rollarni ketma-ket bajardi va auditning 17-bo'limidagi egalik chegaralariga rioya qildi:

| Agent | Vazifa | O'zgartirgan fayllar |
|---|---|---|
| A0 Contracts | Token, handoff va agency-session sxemalari; `CreateCaseRequest.userId` olib tashlandi | `packages/contracts/src/{conversation,sim,case}.ts` |
| A1 Platform | AuthProvider, guard'lar, `SIM_MODE`, secret yordamchilari | `apps/api/src/auth/**` (yangi), `apps/api/src/common/secrets.ts` (yangi), `apps/api/src/app.module.ts`, `docs/api/openapi.yaml` |
| A2 Lexi engine | Conversation ownership, anonim token, handoff, case ownership | `apps/api/src/conversations/**`, `apps/api/src/cases/**` |
| A4 Gateway | Cabinet auth, `DisabledAgencyGateway`, eski controller o'chirildi, ilova egasi tekshiruvi | `apps/api/src/{agency-gateway,applications,case-tracking,sim}/**` |
| A6 Web | Token saqlash, handoff claim, cabinet login | `apps/web/src/{lib/access.ts (yangi), lib/api.ts, app/page.tsx, app/kirish/page.tsx, app/idora/page.tsx}`, `apps/web/src/app/simulator/page.tsx` o'chirildi |
| A7 Bot | Har chat uchun token, havolada handoff kodi | `apps/bot/src/{api.ts, index.ts, lexi.ts, lexi.test.ts}` |
| A4 Gateway (Phase 4) | Holat mashinasi, idempotentlik, connector chegarasi | `apps/api/src/{applications,agency-gateway}/**`, `apps/api/src/common/keyed-lock.ts` (yangi) |
| A5 Security (Phase 4) | `AuditEvent` jurnali | `apps/api/src/audit/**` (yangi), `packages/contracts/src/audit.ts` (A0 bilan) |
| QA | Xavfsizlik regressiya testlari | `tests/integration/security.spec.ts` (yangi), `apps/api/src/conversations/conversation-access.spec.ts` (yangi); yangi API uchun yangilangan: `tests/integration/{api,lexi,simulators}.spec.ts`, `applications.service.spec.ts` |

Umumiy fayllar bilan qanday ishlandi:
- `texts.uz.ts` (web): faqat yangi kalitlar qo'shildi (`cabinet.loginTitle`, `loginHint`, `passcode`, `login`, `loginFailed`, `logout`). Mavjud matnlar o'zgarmadi.
- Bot matnlari va klaviaturalariga tegilmadi.
- `.env` va `.env.example` o'zgartirilmadi.

## 4. Nima o'zgardi

### Phase 1 — Authentication va ownership

- **`AuthProvider`** abstraksiyasi (`apps/api/src/auth/auth-provider.ts`). Citizen faqat server tomonida, header orqali aniqlanadi.
  - `OneIdSimulatorAuthProvider` — faqat `SIM_MODE=true` da; `simulated: true` deb belgilanadi va production auth sifatida ko'rsatilmaydi.
  - `DenyAllAuthProvider` — default. Haqiqiy OneID yo'q, shuning uchun hamma so'rov anonim.
- **Guard'lar** (`CitizenAuthGuard` → 401, `OptionalCitizenAuthGuard`) va `@CurrentCitizen()`:
  - `applications`, `submissions` va `cases` endi qo'lda `oneId.session(token)` chaqirmaydi.
  - Body'dagi `userId` endi qabul qilinmaydi: egasi sessiyadan olinadi.
- **Case ownership.** `CasesService.owned`: boshqa fuqaroning case'iga 403. `assignOwner` egani bir marta bog'laydi, keyin o'zgartirmaydi.
  - `createForCase` faqat case egasiga ruxsat beradi. Oldin begona case id bilan undan ariza yaratish mumkin edi.
- **Conversation ownership** (`conversations.service.ts`, `conversation-access.ts`):

  | So'rov | Natija |
  |---|---|
  | Token ham, sessiya ham yo'q | 401 |
  | Boshqa fuqaro sessiyasi | 403 (tokeni bo'lsa ham) |
  | Egasining sessiyasi yoki haqiqiy token | ruxsat |
  | Qolgan hollar | 404 (suhbat borligi oshkor qilinmaydi) |

  - Egasi bir marta bog'lanadi: so'rovda ham token (egalikni isbotlaydi), ham sessiya bo'lishi kerak. Keyin o'zgarmaydi.
  - `bindCitizen` (har qanday token suhbatni o'ziga bog'lab olardi) olib tashlandi.
- **Anonim token:**
  - 256 bit, base64url, UUID emas;
  - serverda faqat SHA-256 hash saqlanadi;
  - TTL 30 kun; `POST /conversations/:id/logout` bilan bekor qilinadi.
  - Tokenni faqat `POST /conversations` va `/claim` qaytaradi.
- **Bot → web handoff:**
  - `POST /:id/handoff` bir martalik kod beradi (15 daqiqa).
  - `POST /:id/claim` kodni yangi tokenga almashtiradi.
  - Bot havolasida token emas, faqat kod bo'ladi (`/?c=…&h=…`). Web kodni ishlatgach, uni URL'dan o'chiradi.
- **Eski yozuvlar:** `data/runtime/conversations.json` dagi tokensiz yozuvlar o'chirilmaydi, `{conversation, tokens: []}` sifatida o'qiladi. Ularga faqat bog'langan fuqaro kira oladi; anonim eski suhbatlarni web yangidan boshlaydi.

### Phase 2 — Simulator xavfsizligi

- **`SIM_MODE`** (default `false`). `SimModeGuard` `/sim/oneid/*` va `/sim/idora/*` uchun 404 qaytaradi.
  - Gateway factory: `SIM_MODE` bo'lsa `MockAgencyAdapter`, aks holda `DisabledAgencyGateway` (yuborish 503 bilan rad etiladi).
  - Favqulodda chaqiruv simulyatori (`call:` tugmalari va `EmergencyCallsService`) faqat `SIM_MODE` da. Telefon raqamlari har doim ko'rsatiladi.
- **Cabinet autentifikatsiyasi:**
  - `POST /sim/idora/login` → demo xodim sessiyasi (`x-sim-agency-session`): token hash bilan saqlanadi, TTL 8 soat.
  - `SIM_AGENCY_PASSCODE` o'rnatilgan bo'lsa, kod talab qilinadi.
  - Har bir route faqat o'z idorasining arizalari va chaqiruvlarini ochadi; boshqa idora → 403.
  - Fuqaro sessiyasi kabinetni ochmaydi (401).
  - `agencies` va `clock` ochiq qoladi (katalog ma'lumoti, shaxsiy ma'lumot yo'q).
- **PDF:**
  - kabinetda faqat ariza yuborilgan idora xodimiga;
  - fuqaro tomonida faqat ariza egasiga.
- **Login ro'yxati** (`/sim/oneid/citizens`): faqat `id` va `fio`. PINFL, telefon va manzil kirishdan keyin.
- **Eski `SimulatorController`** (`/simulator/:agencyId/submissions`, autentifikatsiyasiz) va `/simulator` web sahifasi o'chirildi.
  - Ularga bog'liq kod: web `api.simulator()` (olib tashlandi) va OpenAPI yozuvi (olib tashlandi).
  - Ishlatilmayotgan `api.ask` (web) va `createCase/addMessage/analyze` (bot) ham olib tashlandi.

### 4.3. Phase 3 — Rate limiting va API hardening

**Adapter:** NestJS 11.2.10 va `@nestjs/platform-express` (Express 5.2.1). Fastify ishlatilmaydi.

**Paketlar** (faqat `@lex/api` ga, ruxsat bilan):
- `@nestjs/throttler` → `^6.8.0`;
- `helmet` → `^8.3.0`.

pnpm tasdiqlangan diapazonlar (`^6.4.0`, `^8.1.0`) ichidagi eng yangi versiyani yozdi. Lockfile'ga faqat shu 2 paket qo'shildi (+26 qator).

**Hardening** (`apps/api/src/common/http-hardening.ts`, `hardenHttp()`):
- `main.ts` da `listen()` dan oldin chaqiriladi, ya'ni route'lar ro'yxatdan o'tishidan oldin. Integration testlar ham aynan shu funksiyani ishlatadi.
- **helmet:**
  - CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` (API faqat JSON/PDF beradi);
  - `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, HSTS;
  - CORP `same-site` (web'ning CORS fetch'lariga ta'sir qilmaydi);
  - `X-Powered-By` o'chirilgan.
- **Body limitlari:** JSON 64kb (eng katta real payload — ariza maydonlari), urlencoded 8kb. Ortig'i → 413, handler'gacha yetmaydi. Kontrakt limitlari (masalan, xabar ≤ 5000 belgi → 400) o'zgarmadi.
- **Trust proxy** (`TRUST_PROXY`):
  - default — o'chiq: `req.ip` TCP manzil, `X-Forwarded-For` e'tiborga olinmaydi, soxta header limitni chetlab o'tolmaydi (test bor);
  - reverse proxy ortida hop soni (`1`) yoki proxy manzillari (`loopback`, `10.0.0.0/8`) beriladi;
  - `true` (hammaga ishonish) qabul qilinmaydi — server ishga tushmaydi.
- **Sekin mijozlar:** `headersTimeout` 20 s, `requestTimeout` 60 s (`main.ts`). Har bir operatsiyaning 5 s timeout'i (`withTimeout`) va Gemini'ning 20 s timeout'i avvalgidek.

**Rate limit** (`apps/api/src/common/rate-limit.ts`). Global `ThrottlerGuard` auth va ownership guard'laridan oldin ishlaydi. Har bir bucket marshrutlar orasida umumiy (`name:tracker` kaliti). Oshib ketsa — 429, `Retry-After` va "Juda ko'p so'rov. Birozdan keyin qayta urinib ko'ring."

| Bucket | Qaysi route'lar | Kalit | Default / daqiqa |
|---|---|---|---|
| `global` | hammasi | IP | 240 |
| `create` | `POST /conversations` (anonim), `POST /cases` | IP | 10 |
| `auth` | `/sim/oneid/login`, `/sim/idora/login`, `/conversations/:id/claim` | IP | 10, keyin 5 daqiqa blok |
| `ai` | `/conversations/:id/messages`, `/conversations/:id/actions`, `/cases/:id/analyze`, `/applications/:id/intake`, `/legal-knowledge/retrieve` | IP | 20 |
| `ai_conv` | yuqoridagilar | conversation id | 15 |
| `ai_all` | yuqoridagilar | butun jarayon | 120 (AI xarajati uchun umumiy byudjet) |

- AI xarajatini cheklash qatlamlari: IP, suhbat va jarayon byudjeti; bunga qo'shimcha Gemini provider'ning bir vaqtda 2 so'rov cheklovi (avvaldan bor).
- `POST /legal-knowledge/retrieve` (SEC-09) embedding modelini ishlatadi. Endi u autentifikatsiya talab qiladi va AI limitlari ostida (web va bot uni chaqirmaydi).
- Limitlarni `RATE_LIMIT_*` env bilan o'zgartirish mumkin (musbat butun son, aks holda server ishga tushmaydi). Funksional testlar ularni oshiradi (`tests/integration/test-env.ts`); haqiqiy limitlar `rate-limit.spec.ts` da tekshiriladi.
- **Cheklov:** throttler storage — jarayon xotirasi. **Bir nechta API instansiyasi limitlarni bo'lishmaydi:** N ta instansiyada amaldagi limit taxminan N barobar, restart'da hisoblagichlar nolga tushadi. Kelishilganidek, Redis yoki boshqa storage qo'shilmadi. Ko'p instansiyali deploy'da `ThrottlerStorage` ni umumiy storage (masalan, Redis) bilan almashtirish kerak.

**Web** (`apps/web/next.config.mjs`) — har bir sahifada:
- CSP: `default-src 'self'`, `connect-src 'self' <API origin>`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`;
- `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (kamera, mikrofon, geolokatsiya, to'lov o'chiq), `poweredByHeader: false`.
- Cheklov: Next.js inline skriptlari uchun `script-src` da `'unsafe-inline'` bor (dev rejimida `'unsafe-eval'` ham). Nonce asosidagi CSP middleware talab qiladi — keyingi ish.

**Yangi env nomlari.** `.env.example` ni o'zgartirmadim, ularni maintainer qo'shadi:
- `SIM_MODE`, `SIM_AGENCY_PASSCODE` (Phase 2);
- `TRUST_PROXY`;
- `RATE_LIMIT_GLOBAL_PER_MIN`, `RATE_LIMIT_CREATE_PER_MIN`, `RATE_LIMIT_AUTH_PER_MIN`, `RATE_LIMIT_AI_PER_MIN`, `RATE_LIMIT_AI_CONVERSATION_PER_MIN`, `RATE_LIMIT_AI_TOTAL_PER_MIN`.

### 4.4. Phase 4 — Application gateway hardening

Mavjud ariza → rozilik → imzo → yuborish oqimi qayta yozilmadi; ustiga qo'shildi.

**Holat mashinasi** (`ApplicationState`, `assertTransition` — `applications.service.ts`):
- `DRAFT → CONSENTED → SIGNED → SUBMITTED`. Holat ma'lumotlardan hisoblanadi (`consentAt`, `signature`, `submissionId`); mijoz uni o'rnata olmaydi. Har bir javobda `Application.state` maydoni bor.
- CONSENTED arizani tahrirlash rozilikni bekor qiladi (DRAFT ga qaytadi) va bu audit'ga yoziladi.
- Bosqich yetishmasa (rozilikdan oldin imzo, imzosiz yuborish) — 400.
- Yakunlangan ariza ustida amal (imzodan keyin tahrir, rozilik yoki qayta imzo; yuborilgandan keyin har qanday amal) — 409.

**Parallel so'rovlar va tranzaksiya chegarasi:**
- **Imzo — optimistic lock.** `updatedAt` versiya sifatida ishlatiladi (har saqlashda qat'iy oshadi). Imzo qo'yish paytida ariza o'zgarsa yoki parallel imzo qo'yilsa — 409, imzo saqlanmaydi. Shu bilan "eski matnga imzo, yangi matn bilan saqlash" holati yopildi. Intake (LLM) ham shu tekshiruvdan o'tadi.
- **Yuborish — pessimistic lock** (`KeyedLock`, ariza bo'yicha). Parallel so'rovlar navbatga turadi; keyingilari SUBMITTED holatni ko'rib 409 oladi.
- Tranzaksiya chegarasi = lock ichidagi bitta `submit`:
  1. tekshiruvlar;
  2. connector chaqiruvi;
  3. ariza, case, idempotency va audit yozuvlari;
  4. diskka `persist`.
- Saqlash `JsonStore` bo'lgani uchun bu haqiqiy DB tranzaksiyasi emas. Connector chaqiruvidan keyin, saqlashdan oldin jarayon to'xtasa, keyingi urinish connector darajasidagi idempotentlik bilan o'sha yuborishni qaytaradi — ikkinchi yuborish va ikkinchi kvitansiya bo'lmaydi.

**Idempotentlik:**
- `Idempotency-Key` header (ixtiyoriy, 8–128 belgi):
  - fuqaro bo'yicha alohida, 24 soat saqlanadi, serverda faqat `sha256(citizen:key)`;
  - bir xil kalit va bir xil ariza → asl yuborish qaytadi (201, `Idempotent-Replayed: true`, audit'da `SUBMISSION_REPLAYED`);
  - bir xil kalit, boshqa ariza → 422;
  - yangi kalit, allaqachon yuborilgan ariza → 409;
  - noto'g'ri format → 400.
- Web har bir ariza uchun barqaror kalit yuboradi (sessionStorage), shuning uchun qayta bosish yoki timeout'dan keyingi retry xavfsiz.
- Connector chegarasi: `AgencyGateway.submit(pkg, { idempotencyKey })`. Kalit `application:<id>` va barqaror. Mock adapter bir xil kalitga yangi yuborish va kvitansiya yaratmaydi.

**`AuditEvent`** (`apps/api/src/audit/`, kontrakt `packages/contracts/src/audit.ts`):
- **Hodisalar:**
  - `APPLICATION_CONSENTED`, `APPLICATION_CONSENT_RESET`, `APPLICATION_SIGNED` (algoritm, PDF'ning SHA-256 i, `simulated`);
  - `SUBMISSION_CREATED`, `RECEIPT_ISSUED` (`receiptId`, `adapterType`, `simulated`), `SUBMISSION_REPLAYED`;
  - `SUBMISSION_STATUS_CHANGED` (`from` → `to`; agency yoki system actor).
- **Faqat qo'shish:** update va delete yo'q. Har bir hodisa oldingisining hash'ini o'z ichiga oladi (SHA-256 zanjiri). `verify()` o'zgartirilgan, o'chirilgan yoki joyi almashtirilgan hodisani topadi. Restart'dan keyin zanjir davom etadi.
- **Ma'lumot minimalligi:** maydon qiymatlari, hikoya, PDF, imzo baytlari, tokenlar va idempotency kalitlari yozilmaydi — faqat id, holat, digest va bayroqlar. Bu testda tekshiriladi.
- `GET /applications/:id/audit` — faqat ariza egasiga (boshqa fuqaro 403).

**Mock connector:**
- `adapterType: "MOCK"`, kvitansiya `SIM-…`; audit'da `simulated: true`.
- `SIM_MODE` o'chiq bo'lsa `DisabledAgencyGateway` ishlaydi (503).
- Haqiqiy connector uchun chegara faqat izohda hujjatlashtirilgan (`agency-gateway.ts`): per-agency credential havolasi, OAuth 2.0 yoki mTLS, webhook imzosi, bir xil kalit bilan retry. Hech qanday credential yoki davlat endpoint'i yaratilmagan yoki uydirilmagan.

## 5. Yopilgan audit topilmalari

| ID | Topilma | Holat | Isbot (test) |
|---|---|---|---|
| SEC-01 | Suhbatni UUID orqali o'qish; boshqa sessiya bilan egallab olish | **Yopildi** | security.spec: "conversation access by id", "session takeover" |
| SEC-02 | `/sim/idora` autentifikatsiyasiz; eski `/simulator` | **Yopildi** | "simulator cabinet authentication", "legacy /simulator route is gone", "every simulator route is 404" |
| SEC-04 | Haqiqiy auth yo'q | **Qisman.** Chegara (`AuthProvider`, deny-by-default) tayyor. Haqiqiy OneID hali yo'q (Phase 6). | "no identity provider: protected routes are 401" |
| SEC-05 | `/cases` autentifikatsiyasiz; body'dagi `userId` | **Yopildi** | "citizen ownership", "a session never comes from the body" |
| SEC-03 | Rate limit yo'q | **Yopildi** (bitta instansiya doirasida; §4.3 cheklovi) | rate-limit.spec: create, auth, AI (suhbat, IP, jarayon), soxta XFF |
| SEC-09 | `/legal-knowledge/retrieve` ochiq | **Yopildi** | guard + AI limit |
| SEC-11 | Security header'lar yo'q | **Yopildi** (API: helmet; web: CSP va header'lar) | rate-limit.spec: "helmet headers on every response" |
| SEC-06 | Parallel takroriy yuborish | **Yopildi** (bitta jarayon doirasida: lock + idempotentlik; ko'p instansiya uchun DB lock kerak — Phase 9) | gateway.spec: "parallel submits…", "Idempotency-Key…" |
| SEC-07 | OneID sim sessiyalari muddatsiz va ochiq matnda | **Ochiq** — Phase 6. Yangi tokenlar (suhbat, handoff, idora) allaqachon hash va muddat bilan. | — |
| SEC-08, 10, 12–16 | | o'zgarmadi | — |

## 6. Test natijalari

### 6.1. Security Gate 1 (Phase 1–2)

| Buyruq | Exit | Natija |
|---|---|---|
| `pnpm lint` | 0 | o'tdi |
| `pnpm build` | 0 | o'tdi (web: `/`, `/idora`, `/kirish`; `/simulator` yo'q) |
| `pnpm typecheck` | 0 | o'tdi (7 workspace) |
| `pnpm test` | 0 | **202 ta o'tdi**: contracts 8, web 7, bot 9, legal-engine 14, ai 99, api 65 |
| `pnpm gen:contracts --check` | 0 | up to date |
| `pnpm import:data` | 0 | 33/33, 261/261 |

Yangi testlar:
- `security.spec.ts` — 14 ta;
- `conversation-access.spec.ts` — 5 ta;
- `applications.service.spec` — 1 ta (ownership);
- bot — 1 ta (handoff havolasi).

L1–L3 Lexi ssenariylari va simulyator zanjiri yangi qoidalar bilan o'tadi (token, cabinet sessiyasi, `SIM_MODE`).

Talab qilingan xavfsizlik testlari:

| Talab | Test |
|---|---|
| Conversation ID orqali ruxsatsiz kirish | "the id alone opens nothing" (401, noto'g'ri yoki begona token → 404) |
| Session token takeover | "a conversation is bound once; another citizen's session cannot read, write or rebind it" |
| Citizen ownership mismatch | "another citizen gets 403 on the case, application, PDF and submission status" |
| Simulator o'chiq | "every simulator route is 404" |
| Simulator autentifikatsiyasiz | "no session 401; a citizen session is not a cabinet session; another agency 403" |
| Simulator PDF ruxsatsiz | "PDF: only the addressed agency's officer" |
| Legacy route bypass | "legacy /simulator route is gone" (ikkala rejimda 404) |
| Token hash bilan saqlanadi | "the access token is opaque, not the id, and only its hash is stored" |
| Bekor qilish va handoff | "a revoked token stops working", "handoff code: single use…" |

### 6.2. Phase 3

| Buyruq | Exit | Natija |
|---|---|---|
| `pnpm lint` | 0 | o'tdi |
| `pnpm build` | 0 | o'tdi |
| `pnpm typecheck` | 0 | o'tdi |
| `pnpm test` | 0 | **216 ta o'tdi**: contracts 8, web 7, bot 9, legal-engine 14, ai 99, api 79 |
| `pnpm gen:contracts --check` | 0 | up to date |
| `pnpm import:data` | 0 | 33/33, 261/261 |

Yangi testlar:
- `tests/integration/rate-limit.spec.ts` — 11 ta:
  - helmet header'lari (xato javoblarida ham);
  - 413 va 400 body limitlari;
  - create 10/min va 429 + `Retry-After`;
  - soxta `X-Forwarded-For` limitni chetlab o'tolmaydi;
  - login 10/min (ikkala login route'i umumiy bucket'da);
  - AI: bitta suhbat 3/min, bitta IP 5/min, `TRUST_PROXY=1` da boshqa mijozning alohida bucket'i, `actions` ham hisoblanadi, jarayon byudjeti.
- `apps/api/src/common/http-hardening.spec.ts` — 3 ta: `TRUST_PROXY` va `RATE_LIMIT_*` validatsiyasi.

Real server bilan smoke test: `dist/main.js`, port 3099, `LLM_PROVIDER=keyword`, `SIM_MODE` o'chiq.
- `/health` da CSP, HSTS, `nosniff`, `X-RateLimit-Limit-global: 240` bor, `X-Powered-By` yo'q.
- `/sim/oneid/citizens` → 404; 70kb body → 413; log'da "auth provider: none".
- Jarayon PID bo'yicha to'xtatildi.

### 6.3. Phase 4

| Buyruq | Exit | Natija |
|---|---|---|
| `pnpm lint` | 0 | o'tdi |
| `pnpm build` | 0 | o'tdi |
| `pnpm typecheck` | 0 | o'tdi |
| `pnpm test` | 0 | **225 ta o'tdi**: contracts 8, web 7, bot 9, legal-engine 14, ai 99, api 88 |
| `pnpm gen:contracts --check` | 0 | up to date |
| `pnpm import:data` | 0 | 33/33, 261/261 |

Yangi testlar:
- `tests/integration/gateway.spec.ts` — 5 ta:
  - 6 ta parallel yuborish → bitta 201, beshta 409, idorada bitta yozuv;
  - `Idempotency-Key`: 4 ta parallel so'rov bitta id oladi; qayta yuborish; 409, 422, 400 holatlari; kalit fuqaro bo'yicha alohida;
  - yaroqsiz o'tishlar (409);
  - audit zanjiri: tartib, `MOCK`/`SIM-` belgisi, kontent yo'qligi, `verify()`, boshqa fuqaro 403;
  - tahrir rozilikni bekor qiladi va audit'ga yoziladi.
- `audit.service.spec.ts` — 1 ta: zanjir, restart'dan keyin davomi, o'zgartirishni topish.
- `applications.service.spec.ts` — 2 ta: imzo paytidagi tahrir → 409 (optimistic lock); holat mashinasi.
- `mock-agency.adapter.spec.ts` — 1 ta: connector idempotentligi.

L1–L3 va simulyator zanjiri o'zgarishsiz o'tadi.

## 7. Testlarda aniqlangan muammolar

- `security.spec` ning birinchi yugurishida "SIM_MODE off" bo'limidagi qizil (xavf) hikoya RAG embedding modelini (ONNX) chaqirdi. Model Jest muhitida ishlamaydi. Bu test muhiti muammosi, xavfsizlik xatosi emas. Yechim: `lexi.spec` dagi kabi `ARTICLE_RETRIEVER` katalog moddalari bilan almashtirildi.
- Phase 3: throttler default holatda har bir route uchun alohida bucket ochadi, shuning uchun ikkala login route'i limitni bo'lishmadi (test ushladi). Yechim: `generateKey` → `name:tracker` (bucket sinf bo'yicha umumiy).
- Phase 4: "locks after signing" unit testi rozilik bermasdan imzo qo'shardi. Holat mashinasi buni endi rad etadi (to'g'ri xatti-harakat). Test rozilik qadami bilan yangilandi.
- Phase 4: yangi idempotency testida xato bor edi — "boshqa fuqaro" uchun aslida o'sha fuqaro ishlatilgan (422 to'g'ri edi). Test tuzatildi.
- Eski `.next/types` da o'chirilgan `/simulator` sahifasining turi qolgan edi. `next build` uni qayta yaratdi. Bu git'da kuzatilmaydigan generatsiya qilingan fayl.

## 8. Yangi dependency

Phase 3 da foydalanuvchi ruxsati bilan `@lex/api` ga ikkita paket qo'shildi:
- `@nestjs/throttler@^6.8.0`;
- `helmet@^8.3.0`.

Boshqa paket qo'shilmadi (Redis ham yo'q).

## 9. Database migration holati

O'zgarish yo'q: PostgreSQL migratsiyalari hali yo'q (Phase 9). Saqlash hamon `JsonStore`.
- Yangi runtime fayllar (git-ignored):
  - `agency-sessions.json` — faqat hash;
  - `idempotency-keys.json` — faqat hash;
  - `audit-events.json` — faqat qo'shiladi, hash zanjiri bilan.
- `applications.json` va `submissions.json` dagi eski yozuvlar o'qiladi: `state` va `idempotencyKey` default bilan, ma'lumot yo'qolmaydi.
- `conversations.json` formati `{conversation, tokens, handoffs}` ga o'tdi; eski yozuvlar avtomatik o'qiladi, ma'lumot yo'qolmaydi.

## 10. Mock va real integratsiya

| Komponent | Holat |
|---|---|
| OneID | **SIMULATOR** (`OneIdSimulatorAuthProvider`, `simulated: true`); production'da `DenyAllAuthProvider` |
| ERI | **SIMULATOR** (Ed25519 test kalitlari) |
| Davlat idorasi | **MOCK** (`MockAgencyAdapter`, `adapterType: "MOCK"`, kvitansiya `SIM-…`); `SIM_MODE` o'chiq bo'lsa `DisabledAgencyGateway` — hech qayerga yuborilmaydi |
| Idora kabineti | **SIMULATOR**; demo xodim sessiyasi haqiqiy idora autentifikatsiyasi emas |
| Real yoki sandbox integratsiya | **YO'Q** |

## 11. Bajarilmagan vazifalar

- **Phase 3 qoldig'i:** ko'p instansiya uchun umumiy throttler storage; web uchun nonce asosidagi CSP.
- **Phase 4 qoldig'i:**
  - lock va idempotency yozuvlari bitta jarayonda; ko'p instansiyada DB row lock yoki unique constraint kerak (Phase 9);
  - audit uchun web UI yo'q (faqat API);
  - `SUBMISSION_STATUS_CHANGED` dagi actor statusdan aniqlanadi (idora xodimi sessiyasi id'si yozilmaydi).
- **Phase 5:** `ApplicationDocument`, yuklash validatsiyasi, xavfsiz saqlash va yuklab olish, hujjatlar ro'yxati.
- **Phase 6:** OneID sim sessiyalariga muddat va hash, revocation, OneID OIDC adapter dizayni.
- **Phase 7:** yurist tekshiruvi jarayoni, jarayon qonunlari, retrieval testlari. pgvector ruxsat bilan.
- **Phase 8:** marketplace (profil, mutaxassislik, credential tekshiruvi, joylashuv, bandlik, konsultatsiya, matching).
- **Phase 9:** PostgreSQL migratsiyalari, repository qatlami, JSON → DB ko'chirish (test DB'da).
- **Phase 10:** yakuniy tekshiruv va E2E demo oqimi (13 qadam).

## 12. Qolgan risklar

- **Rate limit faqat bitta jarayonda:** in-memory throttler bir nechta instansiya orasida umumiy limit bermaydi va restart'da nolga tushadi.
- **Token brauzerda:** suhbat tokeni `localStorage` da. CSP XSS xavfini kamaytiradi, lekin `script-src 'unsafe-inline'` sababli to'liq yo'qotmaydi.
- **Bot holati xotirada:** chat → (suhbat, token) bog'lanishi bot xotirasida. Qayta ishga tushganda yo'qoladi; foydalanuvchi `/start` bosadi.
- **Eski sessiyalar:** OneID sim sessiyalari muddatsiz va ochiq matnda (Phase 6).
- **Simulyator ochiqligi:** `SIM_MODE=true` muhitida har kim istalgan idorani "tanlab" kirishi mumkin, agar `SIM_AGENCY_PASSCODE` o'rnatilmagan bo'lsa. Ma'lumotlar to'qima, lekin demo serverni ochiq tarmoqda passcode'siz qo'ymang.
- **Huquqiy kontent:** hech bir yo'nalish `VERIFIED` emas (audit SEC-10).

## 13. Demo ko'rsatmasi

`SIM_MODE` default bo'yicha **o'chiq**, shuning uchun demo uchun uni yoqish kerak. `.env` ni men o'zgartirmadim. `.env` ga quyidagilarni o'zingiz qo'shing:

```
SIM_MODE=true
# ixtiyoriy: idora kabinetiga kirish kodi
# SIM_AGENCY_PASSCODE=<o'zingiz tanlagan kod>
```

Keyin:
1. `pnpm dev:api`, `pnpm dev:web`.
2. `/` sahifasida suhbat ochiladi (token brauzerda saqlanadi). "3 oydan beri oylik berishmayapti" deb yozing va savollarga javob bering.
3. Ariza taklifi → "Ha" → OneID SIMULYATOR (`/kirish`) → test fuqaro → suhbatga qaytish → "Ha" (suhbat va case shu fuqaroga bog'lanadi).
4. Maydonlar → rozilik → ERI (SIMULYATOR) → yuborish. Kvitansiya `SIM-MI-…`.
5. Chatdagi "kabinet" havolasi `/idora?agency=mehnat_inspeksiyasi&submission=…` ni ochadi → "Kabinetga kirish" → ariza → qabul qilish → javob. Lexi statusni suhbatda ko'rsatadi.
6. **Bot:** "Vebda imzolab yuborish" havolasida bir martalik kod bor (15 daqiqa).

Barcha simulyator sahifalarida "SIMULYATOR" banneri bor; haqiqiy davlat tizimiga hech narsa yuborilmaydi.

## 14. Git holati

- Commit yo'q, push yo'q, branch o'zgarmagan.
- `git rm` bilan o'chirilgan 2 ta fayl index'da staged: `simulator.controller.ts`, `simulator/page.tsx`.
- Kuzatilayotgan fayllar bo'yicha diff (Phase 0–4): 44 ta fayl, ~1209+/389− (shu jumladan 2 ta o'chirilgan fayl va `pnpm-lock.yaml`).
- Yangi (untracked) fayllar va papkalar: `apps/api/src/{auth/, audit/}`, `common/{http-hardening*, keyed-lock, rate-limit, secrets}.ts`, `conversations/conversation-access*.ts`, `agency-gateway/{disabled-agency.gateway, sim-agency-sessions.service}.ts`, `sim/oneid.auth-provider.ts`, `apps/web/src/lib/access.ts`, `packages/contracts/src/audit.ts`, `tests/integration/{security,rate-limit,gateway}.spec.ts`, `tests/integration/test-env.ts`, `docs/audit/`.

---

# Phase 5–10 (2026-11-21, ikkinchi bosqich)

## 15. Boshlang'ich audit va execution checklist

**Holat** (kod bilan tekshirildi):
- Branch `feat/lexi-intents`, HEAD `5945261`, commit yo'q.
- Phase 0–4 o'zgarishlari working tree'da: 63 ta yozuv (`git status --short`).
- **Topshiriq matni** Phase 8 ning 8-bandida ("Citizen ownership and…") uzilgan. Phase 9 (database) va Phase 10 (yakuniy tekshiruv) matni kelmagan. Ular audit va oldingi rejaga ko'ra rejalashtirildi, lekin bajarilmadi (§21).

| Phase | Repozitoriyadagi holat (boshida) | Reja |
|---|---|---|
| 5 Hujjatlar | MISSING: faqat shablondagi "Ilova:" qatori; yuklash yo'q. `multer` faqat `platform-express` ichida, `@types/multer` yo'q. | Express ichidagi raw body parser (yangi paket kerak emas); fayl turini magic bytes bo'yicha aniqlash; saqlash `data/runtime` da; egalik, holat mashinasi va audit |
| 6 Sessiya / OIDC | PARTIAL: `AuthProvider` va deny-by-default bor; OneID sim tokeni ochiq matnda va muddatsiz | Token hash, TTL, revocation, rotation; OIDC chegarasi (state, nonce, PKCE, imzo) faqat konfiguratsiya bilan, real endpoint'siz |
| 7 RAG | PARTIAL: citation filtri, `source_url`, `retrieved_at`, `status: DRAFT`; issuer va kuchga kirish sanasi yo'q | Manba metadata ko'rinishi, eskirganlik va tekshirilmaganlik bayroqlari, injection'ga chidamlilik, eval to'plami va hisobot |
| 8 Marketplace | MISSING | Minimal: profil, mutaxassislik, holat, qidiruv, konsultatsiya so'rovi va hayot sikli (topshiriq uzilgan joyigacha) |
| 9, 10 | topshiriq matni yo'q | bajarilmaydi, so'raladi |

## 16. Phase 5 — Ariza hujjatlari

**Yangi paket kerak bo'lmadi.** Yuklash multer'siz: Express'ning ichki raw body parser'i (`hardenHttp`) faqat `application/pdf`, `image/png` va `image/jpeg` uchun, 5 MB limit bilan. `@types/multer` ham kerak emas.

**Endpoint'lar** (`apps/api/src/applications/documents.{service,controller}.ts`, kontrakt `packages/contracts/src/documents.ts`). Hammasi `CitizenAuthGuard` va ariza egaligi bilan:

| Endpoint | Vazifasi |
|---|---|
| `GET /applications/:id/documents` | hujjatlar, checklist (shablondagi "Ilova:" qatori), `missing` |
| `POST /applications/:id/documents` | raw fayl; `Content-Type`, `x-file-name` va `x-checklist-item` (URL-encoded) header'lari |
| `GET /applications/:id/documents/:docId` | doim `attachment`, `Cache-Control: no-store`, `nosniff` |
| `DELETE /applications/:id/documents/:docId` | 204 |

**Validatsiya** (server tomonida):
- Fayl turi baytlar bo'yicha aniqlanadi (magic bytes: `%PDF-`, PNG, JPEG). E'lon qilingan MIME turi bilan mos kelmasa — 415. Fayl nomi turi aniqlashda ishlatilmaydi.
- Bo'sh fayl — 400; 5 MB dan katta — 413; arizaga 10 tadan ko'p hujjat — 422.
- Skript, launch yoki embedded file bor PDF — 422.
- Noma'lum checklist bandi — 400.
- Fayl nomi tozalanadi (yo'l, boshqaruv va maxsus belgilar olib tashlanadi, ≤ 120 belgi) va faqat ko'rsatish uchun ishlatiladi.

**Saqlash:**
- Fayllar `data/runtime/documents/<applicationId>/<docId>.bin` da (git-ignored, statik serve qilinmaydi; `0600`/`0700`, `wx` — mavjud faylni qayta yozmaydi).
- Metadata `documents.json` da; SHA-256 bilan.

**Hayot sikli:**
- Hujjat qo'shish yoki o'chirish = tahrir: faqat DRAFT/CONSENTED holatda. Berilgan rozilik bekor bo'ladi (`APPLICATION_CONSENT_RESET`, sabab `documents_changed`). Versiya oshadi, shuning uchun parallel imzo 409 oladi.
- SIGNED dan keyin hujjatlar muzlatiladi (409).
- `APPLICATION_SIGNED` audit'ida hujjatlar soni va ular SHA-256 laridan olingan umumiy digest yoziladi.
- Har bir yuklab olishda va yuborishdan oldin SHA-256 qayta tekshiriladi; diskda o'zgargan fayl → 500, yuborish to'xtaydi.
- Yuborish paketida (`SubmissionPackage.documents`) hujjatlar metadata'si bor.

**Ruxsatlar:**
- Sessiya yo'q → 401; boshqa fuqaro → 403 (ro'yxat, yuklash, yuklab olish, o'chirish).
- Boshqa arizaning hujjat id'si → 404.
- Simulyator route'lari orqali hujjat fayllari berilmaydi.

**Audit:** `DOCUMENT_ADDED` (id, tur, hajm, sha256, checklist bandi) va `DOCUMENT_REMOVED`. Fayl nomi va kontent audit'ga yozilmaydi, log'ga ham chiqmaydi.

**Web:** `DocumentsPanel` (checklist holati, yuklash, yuklab olish, o'chirish); matnlar — faqat yangi kalitlar.

**Testlar:**
- `tests/integration/documents.spec.ts` — 7 ta:
  - to'g'ri PDF/PNG va checklist;
  - xavfsiz yuklab olish header'lari;
  - fayl id bo'yicha saqlangani;
  - EXE `.pdf` nomi bilan, PNG `application/pdf` deb, matn, SVG, JSON → 415; JavaScript'li PDF → 422;
  - 5 MB+ → 413;
  - 401, 403, 404;
  - rozilik bekor bo'lishi va imzodan keyin 409;
  - butunlik buzilishi (500);
  - o'chirish.
- `documents.service.spec.ts` — 2 ta: tur aniqlash, nom tozalash.

## 17. Phase 6 — Sessiya va OIDC chegarasi

**OneID SIMULATOR sessiyalari** (`apps/api/src/sim/oneid.service.ts`):
- Token: 256 bit, opaque, saqlanishi faqat `sha256` (`oneid-sessions.json`, faqat `citizenId`).
- Muddat: 8 soat absolyut + 60 daqiqa harakatsizlik.
- `POST /sim/oneid/logout` (shu token) va `POST /sim/oneid/logout-all` (fuqaroning barcha sessiyalari).
- **Rotation:** login paytida yuborilgan eski token bekor qilinadi.
- Eski `sessions.json` (ochiq matndagi tokenlar) **endi o'qilmaydi** — u sessiyalar yaroqsiz. Fayl o'chirilmadi (foydalanuvchi ma'lumoti); uni qo'lda o'chirish tavsiya etiladi.
- Web: logout serverda ham bekor qiladi; muddati o'tgan sessiya brauzerda e'tiborsiz qoladi.

**Cookie va CSRF:** cookie sessiyalari ishlatilmaydi. Barcha tokenlar maxsus header'larda (`x-sim-session`, `x-conversation-token`, `x-sim-agency-session`). Brauzer ularni avtomatik yubormaydi, shuning uchun CSRF tokeni kerak emas. Token cookie'dan, query string'dan, body'dan yoki `Authorization` header'idan qabul qilinmaydi — testda tekshirilgan.

**OIDC chegarasi** (`apps/api/src/auth/oidc/`) — **real OneID ulanmagan:**
- `loadOidcConfig`: barcha `ONEID_OIDC_*` qiymatlari berilmasa `null`; faqat https. Default endpoint yo'q.
- `OidcLoginService`:
  - `begin`: state, nonce, PKCE S256 (state faqat hash bilan, 10 daqiqa, bir martalik);
  - `callback`: state noma'lum, takrorlangan yoki eskirgan → `invalid_state`; provider xatosi → `provider_error`;
  - code exchange va JWKS — inject qilinadigan interfeyslar; repozitoriyada amalga oshirilmagan;
  - natija faqat `issuer`, `subject` va `displayName` (email va boshqa claim'lar saqlanmaydi).
- `verifyIdToken` (faqat `node:crypto`, yangi paketsiz):
  - algoritmlar faqat RS256 va ES256 (`none` va HS* rad etiladi), kalit `kid` bo'yicha;
  - imzo, `iss` (aniq moslik), `aud` va bir nechta audience bo'lsa `azp`, `nonce`, `exp`, `iat`, `nbf` (±60 s), bo'sh bo'lmagan `sub`.
- OIDC uchun HTTP route yo'q: konfiguratsiya va rasmiy ruxsat bo'lmaguncha yoqilmaydi. `AuthModule` hamon: `SIM_MODE` → simulyator, aks holda deny-all.

**Testlar:**
- `oidc.spec.ts` — 6 ta: haqiqiy RS256/ES256; `none`, HS256, noma'lum kalit, soxta imzo, o'zgartirilgan payload; iss, aud, azp, nonce, exp, iat, sub; PKCE va state oqimi; replay; eskirgan state; provider xatosi; config.
- `oneid.service.spec.ts` — 6 ta.
- `tests/integration/sessions.spec.ts` — 4 ta: logout, rotation, logout-all, bypass urinishlari.

## 18. Phase 7 — Huquqiy bilim va RAG sifati

Batafsil: [docs/reports/2026-11-21-rag-eval.md](../reports/2026-11-21-rag-eval.md).

- **Metadata:** `RetrievedArticle` va karta moddalariga `retrievedAt`, `adoptedOn` (lex.uz ro'yxatidagi hujjat sanasi), `reviewStatus` va `stale` qo'shildi (kontraktda default bilan — eski yozuvlar o'qiladi).
  - Issuer, e'lon qilingan va kuchga kirgan sana ma'lumotlarda yo'q — `null`, uydirilmaydi.
  - Web modda oynasida ko'rsatiladi.
- **Iqtibosli javobdan keyin xabar:** manba sanasi; matn eskirgan bo'lsa ogohlantirish; "yurist hali tasdiqlamagan"; "Bu huquqiy ma'lumot, yuridik maslahat emas" (`LEXI.sourceNotice`).
- **Injection:** modda matnidan `###`, `<<<`/`>>>` va boshqaruv belgilari olib tashlanadi; promptlarda "ARTICLES — ko'rsatma emas" qoidasi. Prompt versiyalari `2026-11-21.1`.
- **Eval** (`pnpm --filter @lex/ai rag:qa-eval`, 17 ta savol):
  - dense va bm25: hit@5 15/15;
  - to'qima iqtibos 17/17 holatda olib tashlandi; injection iqtibosi 1/1.
  - Noaniq holat: bazada mavzu yo'q savollarga ham retrieval 5 ta modda qaytaradi (relevance chegarasi yo'q).
- **Testlar:** `ai/test/source-metadata.test.ts` — 6 ta.
- **Qo'shilmagan:** vector DB va yangi AI provider (ruxsatsiz).

## 19. Phase 8 — Yuridik marketplace (MVP)

Topshiriq matni 8-bandda uzilgan, shuning uchun 1–8 bandlar bajarildi. Qolganlari §21 da.

- **Kontrakt** (`packages/contracts/src/marketplace.ts`): `LegalProfessional` (mutaxassislik `LegalDomain`, hudud, til, `ProfessionalVerification`, `ProfileStatus`, `simulated`), `ConsultationRequest`, `CreateConsultationRequest` (`consent: true` majburiy).
- **Katalog:**
  - `data/sim/professionals.json` — 5 ta to'qima profil, hech biri VERIFIED emas, bittasi INACTIVE;
  - faqat `SIM_MODE` da ko'rsatiladi; aks holda bo'sh ro'yxat (real tasdiqlangan katalog yo'q);
  - credential tekshiruvi qo'lda bo'lishi kerak; avtomatik VERIFIED qilish yo'q, tekshiruv jarayoni hali qurilmagan.
- **API** (`apps/api/src/marketplace/`):

  | Endpoint | Ruxsat |
  |---|---|
  | `GET /professionals?domain=&region=` | ochiq |
  | `GET /professionals?caseId=` | o'z case'i bo'yicha tavsiya (login + egalik) |
  | `GET /professionals/:id` | ochiq |
  | `POST /consultations` | login, rozilik, `create` rate limit; faqat o'z case'ini bog'lash mumkin |
  | `GET /consultations`, `GET /consultations/:id` | faqat egasi |
  | `POST /consultations/:id/cancel` | faqat egasi |

- **Holatlar:** REQUESTED → ACCEPTED → COMPLETED; REQUESTED → DECLINED; REQUESTED/ACCEPTED → CANCELLED (fuqaro). Qolgan o'tishlar — 409. Kim nima qila olishi tekshiriladi.
- **Audit:** `CONSULTATION_REQUESTED` va `CONSULTATION_STATUS_CHANGED` (xabar matnisiz).
- **Cheklovlar:**
  - yurist tomoni (qabul qilish, rad etish, yakunlash) faqat service darajasida — yurist akkaunti va autentifikatsiyasi yo'q;
  - web UI yo'q.
- **Testlar:** `tests/integration/marketplace.spec.ts` — 4 ta.

## 20. Phase 5–8 tekshiruv natijalari

| Buyruq | Exit | Natija |
|---|---|---|
| `pnpm lint` | 0 | o'tdi |
| `pnpm build` | 0 | o'tdi |
| `pnpm typecheck` | 0 | o'tdi |
| `pnpm test` | 0 | **257 ta o'tdi**: contracts 8, web 7, bot 9, legal-engine 14, ai 105, api 114 |
| `pnpm gen:contracts --check` | 0 | up to date |
| `pnpm import:data` | 0 | 33/33, 261/261 |

Topilgan va tuzatilgan muammolar:
- **Phase 8:** `VerificationStatus` nomi `common.ts` dagi mavjud enum bilan to'qnashdi (`export *`) va TS boshqasini tanladi. Yangi enum `ProfessionalVerification` deb nomlandi.
- Bot test fixture'iga yangi modda metadata maydonlari qo'shildi.

Yangi paket qo'shilmadi. DB migratsiyasi yo'q (Phase 9 matni kelmagan).

Yangi runtime fayllar (git-ignored):
- `documents.json` va `documents/`;
- `oneid-sessions.json`;
- `consultations.json`.

Git: commit va push yo'q. Kuzatilayotgan fayllar diff'i — 59 ta fayl, ~1602+/427−. Yangi (untracked) yozuvlar — 36 ta.

## 21. Bajarilmagan / bloklangan

- **Phase 8 qoldig'i:** topshiriq 8-bandda uzilgan (citizen ownership va undan keyingi bandlar). Yurist akkauntlari, credential tekshiruvi jarayoni (admin roli bilan), marketplace UI va bandlik jadvali bajarilmadi.
- **Phase 9 (Database) va Phase 10 (yakuniy tekshiruv va E2E demo):** topshiriq matni kelmagan, boshlanmadi.
- **Real OneID OIDC:** rasmiy konfiguratsiya, credential va ruxsat yo'q. Token client va JWKS amalga oshirilmagan.
- **Qolgan risklar:**
  - rate limit va lock'lar bitta jarayon doirasida ishlaydi;
  - huquqiy kontent `DRAFT`;
  - retrieval'da relevance chegarasi yo'q;
  - eski `data/runtime/sessions.json` diskda ochiq matnda qolgan (o'qilmaydi; qo'lda o'chirish tavsiya etiladi).
