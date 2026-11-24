# CarpetLAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить SaaS CarpetLAB: сайт с подпиской и личным кабинетом, где производство ковров ведет учет рулонов, обрезков и готовых ковров, рассчитывает раскрой и выпускает документы раскроя со спецификацией и штрихкодами EAN-13.

**Architecture:** Два проекта в одном репозитории: `backend/` (NestJS, TypeScript, модульный монолит) и `frontend/` (React + Vite). Данные в PostgreSQL через Prisma; остатки вычисляются из журнала движений (`StockMovement`); изоляция организаций через `org_id` + Row-Level Security. Алгоритм раскроя — чистый модуль без доступа к БД.

**Tech Stack:** Node.js 20, NestJS, Prisma, PostgreSQL 16, Jest, React 18, Vite, Vitest, React Router, Playwright (smoke), pdfmake, bwip-js, S3-совместимое хранилище, ЮKassa API, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-24-carpetlab-design.md`

## Global Constraints

- Размеры хранятся целыми числами в **сантиметрах**; площадь в м² вычисляется (`widthCm * lengthCm / 10000`). Деньги в **копейках**. Нигде не использовать float для размеров и денег.
- Интерфейс на русском; валюта RUB; хостинг и БД в РФ (152-ФЗ).
- Подписка принадлежит организации. Роли: `OWNER`, `OPERATOR`, `CUTTER`. Права и лимиты проверяются **только на сервере**.
- Тарифы: 1 → 10 артикулов, 3 сотрудника, 100 МБ фото; 2 → 100 / 10 / 1 ГБ; 3 → 500 / 20 / 5 ГБ. Сроки 1/3/6/12 мес., без автопродления. Пробный период 7 дней с лимитами тарифа 1.
- Уведомления об окончании: за 30 дней, за 15 дней и ежедневно за 7…1 дней.
- После окончания подписки данные остаются, режим «только просмотр» (все записывающие запросы → 402).
- Режимы резки артикула: `LINEAR` (без вращения, полосы поперек всей ширины) и `ANY` (вращение 90°, гильотинные резы, остатки всегда прямоугольные). Ковер вырезается из одного куска; куски не склеиваются.
- Остаток с меньшей стороной < 30 см (настройка организации `minRemnantSideCm`) считается отходом.
- Остатки не правятся напрямую: только через `StockMovement`. Каждое движение хранит автора, время и причину.
- EAN-13: префикс GS1 7–9 цифр, номер присваивается один раз и не переиспользуется, контрольная цифра по стандарту GS1.
- Пароли — argon2; сессии — httpOnly cookie; данные карт на нашем сервере не обрабатываются.
- Визуальный стиль «Мастерская» (раздел 10.1 спецификации, макет https://claude.ai/artifact/4LHVR73jtqtGV3XNKW5JEw): токены `--ink #12203A`, `--paper #F1F3F5`, `--accent #D9461F`, цвета размеров `#2D4A7A #5B7FB5 #A9BDDB`, `--ok #1B7A4A`; шрифты IBM Plex Sans и IBM Plex Mono; радиус 2 px; без теней; светлая и тёмная тема через токены; адаптивность до 400 px.
- Не указывать идентификаторы моделей ИИ в коммитах, коде и документах.

## Review Focus

1. **Чужие данные:** запрос пользователя организации A к ID из организации B → 404, а не 403 и не данные. Pinned в Task 2 и повторно в Task 11.
2. **Ковер больше любого куска / нулевое количество:** расчет возвращает `feasible: false` с `shortfall`, не падает; количества 0, отрицательные, дробные отклоняются с 400. Task 10, 11.
3. **Одновременная генерация ШК:** два параллельных запроса дают разные номера без дублей. Task 15.
4. **Повтор или подделка webhook ЮKassa:** повтор не продлевает срок дважды; статус платежа проверяется запросом к API, а не берется из тела. Task 17.
5. **Подписка закончилась:** любой записывающий запрос, включая вызов API напрямую, → 402; чтение работает. Task 5.

---

## File Structure

```
carpetlab/
  docker-compose.yml          # postgres + minio (dev)
  backend/
    prisma/schema.prisma, migrations/
    src/
      main.ts, app.module.ts
      common/        tenant-context.ts, errors.ts, guards (roles, subscription)
      auth/          registration, login, sessions, email verification
      orgs/          organization settings, employees
      subscription/  plans, limits, status, notifications, payments (yookassa, invoices)
      catalog/       articles, size templates, photos
      stock/         ledger, receipts, manual adjustments, balances
      cutting/       engine/ (pure), calculate service
      documents/     cut documents, versions, conflicts, spec pdf
      barcodes/      ean13.ts, assignment, labels
      admin/         service admin
  frontend/
    src/ pages/, components/, api/, i18n (ru)
  docs/superpowers/{specs,plans}
```

---

### Task 1: Каркас проекта и инфраструктура разработки

**Files:**
- Create: `backend/` (NestJS), `frontend/` (Vite React TS), `docker-compose.yml`, `.gitignore`, `README.md`
- Test: `backend/test/health.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /api/health → {status:"ok"}`; npm-скрипты `test`, `lint`, `build` в обоих пакетах; Postgres на `localhost:5432`, `DATABASE_URL` в `.env.example`.

- [ ] **Step 1:** Тест `health.e2e-spec.ts`: `GET /api/health` → 200, тело `{status:"ok"}`.
- [ ] **Step 2:** `git init`; создать каркасы; запустить `npm test` в backend — тест падает.
- [ ] **Step 3:** Реализовать `HealthController` с префиксом `/api`.
- [ ] **Step 4:** `docker compose up -d && npm test` → PASS.
- [ ] **Step 5:** Commit `chore: project scaffold`.

### Task 2: Схема БД, организации и изоляция данных (RLS)

**Files:**
- Create: `backend/prisma/schema.prisma`, `backend/src/common/tenant-context.ts`, миграция с политиками RLS
- Test: `backend/test/tenant-isolation.spec.ts`

**Interfaces:**
- Produces: модели `Organization(id, name, gsPrefix?, minRemnantSideCm=30)`, `User(id, email, passwordHash, emailVerifiedAt?)`, `Membership(userId, orgId, role)`; `runInTenant<T>(orgId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T>` — выполняет `fn` в транзакции с `SET LOCAL app.org_id`; у всех таблиц организации политика RLS `org_id = current_setting('app.org_id')`.

- [ ] **Step 1:** Тест: создать организации A и B с артикулом в каждой; `runInTenant(A, tx => tx.article.findMany())` возвращает только артикул A; `findUnique` по ID артикула B внутри A → `null`.
- [ ] **Step 2:** Запустить — FAIL (нет схемы).
- [ ] **Step 3:** Описать схему и миграцию с RLS (приложение подключается ролью без `BYPASSRLS`); реализовать `runInTenant`.
- [ ] **Step 4:** `npm test -- tenant-isolation` → PASS.
- [ ] **Step 5:** Commit `feat: tenant isolation with RLS`.

### Task 3: Регистрация, вход, сессии

**Files:**
- Create: `backend/src/auth/{auth.module,auth.controller,auth.service}.ts`
- Test: `backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 2 (`Organization`, `User`, `Membership`).
- Produces: `POST /api/auth/register {email,password,orgName}` → создает организацию, пользователя `OWNER`, пробную подписку (см. Task 5), отправляет письмо с подтверждением; `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me → {userId, orgId, role, emailVerified}`; `AuthGuard` кладет `{userId, orgId, role}` в запрос; сервис почты `Mailer.send(to, subject, html): Promise<void>` с заглушкой для dev.

- [ ] **Step 1:** Тесты: регистрация → 201 и cookie; пароль в БД — argon2-хэш; повторная регистрация того же e-mail → 409; вход с неверным паролем → 401; 6-я попытка за минуту → 429; `/me` без cookie → 401.
- [ ] **Step 2:** Запустить — FAIL.
- [ ] **Step 3:** Реализовать сервис и guard (argon2, httpOnly + SameSite=Lax cookie, rate limit по IP+e-mail); подтверждение e-mail токеном `GET /api/auth/verify?token=`.
- [ ] **Step 4:** Тесты → PASS.
- [ ] **Step 5:** Commit `feat: auth`.

### Task 4: Роли и сотрудники

**Files:**
- Create: `backend/src/common/roles.guard.ts`, `backend/src/orgs/employees.{controller,service}.ts`
- Test: `backend/test/employees.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthGuard` (Task 3).
- Produces: декоратор `@Roles(...roles: Role[])`; `POST /api/employees {email,role}` (приглашение), `GET /api/employees`, `PATCH /api/employees/:id {role}`, `DELETE /api/employees/:id`; только `OWNER`.

- [ ] **Step 1:** Тесты: `OPERATOR` создает сотрудника → 403; владелец → 201 и письмо-приглашение; нельзя удалить или понизить последнего владельца → 409.
- [ ] **Step 2–4:** Реализовать guard и контроллер; тесты → PASS (лимит по числу сотрудников подключается в Task 5).
- [ ] **Step 5:** Commit `feat: roles and employees`.

### Task 5: Подписка, лимиты и режим «только просмотр»

**Files:**
- Create: `backend/src/subscription/{plans.ts,limits.service.ts,subscription.service.ts,subscription.guard.ts}`
- Test: `backend/test/subscription.spec.ts`

**Interfaces:**
- Produces: `PLANS: Record<1|2|3,{articles:number,employees:number,photoBytes:number}>`; `Subscription(orgId, plan, status: TRIAL|ACTIVE|EXPIRED, expiresAt)`; `SubscriptionService.getStatus(orgId): Promise<{status,plan,expiresAt,daysLeft}>`; `LimitsService.assertCanAdd(orgId, 'article'|'employee'): Promise<void>` (бросает `PaymentRequired`/409 `LIMIT_REACHED`); `LimitsService.assertPhotoQuota(orgId, bytes)`; глобальный `SubscriptionGuard`: если статус `EXPIRED`, все методы кроме GET/HEAD и `/api/auth/*`, `/api/billing/*` → 402.

- [ ] **Step 1:** Тесты: после регистрации статус `TRIAL`, `daysLeft==7`, лимиты как у тарифа 1; 11-й артикул на тарифе 1 → `LIMIT_REACHED`; организация с `expiresAt` в прошлом: `POST /api/articles` → 402 (**Review Focus 5**), `GET /api/articles` → 200; смена тарифа на меньший при превышении лимита не удаляет данные, но блокирует создание нового.
- [ ] **Step 2:** FAIL. **Step 3:** Реализовать; подключить `assertCanAdd` к Task 4 (сотрудники). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: subscription limits and read-only mode`.

### Task 6: Артикулы и фото

**Files:**
- Create: `backend/src/catalog/articles.{controller,service}.ts`, `backend/src/catalog/photos.service.ts`
- Test: `backend/test/articles.e2e-spec.ts`

**Interfaces:**
- Consumes: `LimitsService` (Task 5), `runInTenant`.
- Produces: `Article(id, orgId, code, name, rollWidthCm, cutMode: LINEAR|ANY, barcodeEnabled=false, extra: Json, photoKey?)`; `POST/GET/PATCH/DELETE /api/articles` (запись — `OWNER`,`OPERATOR`); `GET /api/articles?q=&stock=all|inStock|empty` — фильтр по артикулу и по остаткам (использует `BalanceService`, Task 8; до Task 8 игнорируется); `POST /api/articles/:id/photo` (jpeg/png/webp, ≤ 5 МБ, проверка квоты); `extra` — расширяемые характеристики карточки.

- [ ] **Step 1:** Тесты: создание артикула 109029; дубликат `code` внутри организации → 409, в другой организации → 201; `rollWidthCm <= 0` → 400; фото `.exe` → 400; фото сверх квоты → 409 `QUOTA_REACHED`.
- [ ] **Step 2–4:** Реализовать; хранилище через интерфейс `ObjectStorage.put(key, buf, mime)`; тесты → PASS.
- [ ] **Step 5:** Commit `feat: articles`.

### Task 7: Шаблонные размеры ковров

**Files:**
- Create: `backend/src/catalog/sizes.{controller,service}.ts`
- Test: `backend/test/sizes.e2e-spec.ts`

**Interfaces:**
- Produces: `SizeTemplate(id, orgId, widthCm, lengthCm)` уникально по паре; `CRUD /api/sizes`; удаление размера, на который есть документы, → 409.

- [ ] **Step 1–4:** Тесты: `150×200` создан; повтор → 409; `0×100` → 400; удаление используемого размера → 409. Реализовать и пройти.
- [ ] **Step 5:** Commit `feat: size templates`.

### Task 8: Складской журнал, приход и ручные корректировки

**Files:**
- Create: `backend/src/stock/{ledger.service,balance.service,stock.controller}.ts`
- Test: `backend/test/stock.e2e-spec.ts`

**Interfaces:**
- Produces: `Material(id, orgId, articleId, widthCm, lengthCm, kind: ROLL|REMNANT)`; `StockMovement(id, orgId, kind: RECEIPT|CUT_CONSUME|CUT_OUTPUT|MANUAL_WRITE_OFF|MANUAL_RECEIPT|EDIT_REVERSAL, itemType: MATERIAL|CARPET, materialId?, skuId?, qtyDelta:int, documentId?, reason?, userId, createdAt)`; `LedgerService.post(tx, movements: NewMovement[]): Promise<void>`; `BalanceService.materials(orgId, articleId): Promise<{material:Material,qty:number}[]>` (только `qty>0`), `BalanceService.carpets(orgId, filter): Promise<{sku,qty}[]>`; `POST /api/stock/rolls {articleId,widthCm,lengthCm,count}` (ширина должна совпадать с `rollWidthCm` артикула, иначе 400); `POST /api/stock/adjust {itemType,id,qtyDelta,reason}` (reason обязателен); `GET /api/stock/history?itemId=`; ответ остатков содержит `areaM2`.

- [ ] **Step 1:** Тесты: приход 2 рулонов 150×2500 → баланс `qty=2`, площадь 75 м²; списание 1 с причиной → `qty=1`; без причины → 400; списание больше остатка → 409; история показывает обе операции с автором; `CUTTER` на `/adjust` → 403.
- [ ] **Step 2–4:** Реализовать; остаток считается как `SUM(qtyDelta)`, прямых UPDATE нет. Подключить фильтр остатков в Task 6 (`stock=inStock|empty`).
- [ ] **Step 5:** Commit `feat: stock ledger`.

### Task 9: Движок раскроя — режим LINEAR

**Files:**
- Create: `backend/src/cutting/engine/{types.ts,linear.ts}`
- Test: `backend/src/cutting/engine/linear.spec.ts`

**Interfaces:**
- Produces (общие типы, использовать в Task 10–12):
  ```ts
  type Source = { id: string; kind: 'ROLL'|'REMNANT'; widthCm: number; lengthCm: number };
  type Request = { sizeId: string; widthCm: number; lengthCm: number; qty: number };
  type Placement = { sourceId: string; sizeId: string; xCm: number; yCm: number; widthCm: number; lengthCm: number };
  type RemnantOut = { sourceId: string; widthCm: number; lengthCm: number };
  type CutPlan = { feasible: boolean; placements: Placement[]; remnants: RemnantOut[]; shortfall: { sizeId: string; missing: number }[] };
  function planLinear(sources: Source[], requests: Request[], minRemnantSideCm: number): CutPlan
  ```
  В LINEAR ширина ковра идет поперек рулона (ось X), длина — вдоль (ось Y), вращение запрещено; в одной полосе длины L помещаются ковры одной длины L с суммой ширин ≤ ширины куска. Обрезки (`REMNANT`) расходуются раньше рулонов. Детерминированно.

- [ ] **Step 1:** Тесты (имена и значения): `150×2500`, запрос 8×(150×300) → `feasible`, 1 остаток 150×100; запрос 9×(150×300) → не feasible, `shortfall=[{missing:1}]`; ковер 200×100 при ширине 150 → не feasible (**Review Focus 2**); запрос 150×100 при наличии обрезка 150×100 и рулона → источником выбран обрезок; остаток 150×20 при `minRemnantSideCm=30` не попадает в `remnants`; один и тот же вход дважды → одинаковый результат.
- [ ] **Step 2:** FAIL. **Step 3:** Реализовать `planLinear`. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: linear cutting engine`.

### Task 10: Движок раскроя — режим ANY и автоподбор количеств

**Files:**
- Create: `backend/src/cutting/engine/{guillotine.ts,suggest.ts,index.ts}`
- Test: `backend/src/cutting/engine/guillotine.spec.ts`, `suggest.spec.ts`

**Interfaces:**
- Consumes: типы Task 9.
- Produces: `planAny(sources, requests, minRemnantSideCm): CutPlan` (вращение 90° разрешено, гильотинные резы; остатки — прямоугольники; ни один `Placement` не выходит за границы куска и не пересекает другой — инвариант, проверяется тестом); `suggestQuantities(sources, sizes: Omit<Request,'qty'>[], mode, minRemnantSideCm): Request[]` — максимизирует занятую площадь, поровну распределяя штуки между размерами; `plan(mode, sources, requests, min): CutPlan` — единая точка входа.

- [ ] **Step 1:** Тесты: рулон 150×2500, ANY, 10×(100×150) → feasible, суммарная площадь размещений равна 150 000 см² (assert `sum(w*l) === 10*100*150`); без пересечений и выхода за границы (проверка на случайных 200 наборах с фиксированным seed); ковер 100×150 помещается в обрезок 150×100 только повернутым; `suggestQuantities` для 150×150, 150×200, 150×300 на одном рулоне 150×2500 → сумма длин ≤ 2500 и количества различаются не более чем на 1; ковер больше любого куска → `shortfall`, без исключения.
- [ ] **Step 2–4:** Реализовать (эвристика shelf/guillotine best-fit; остатки добавлять по срезам); PASS.
- [ ] **Step 5:** Commit `feat: guillotine engine and quantity suggestion`.

### Task 11: API расчета раскроя

**Files:**
- Create: `backend/src/cutting/{calculate.service,cutting.controller}.ts`
- Test: `backend/test/cutting-calc.e2e-spec.ts`

**Interfaces:**
- Consumes: `BalanceService` (Task 8), `plan`/`suggestQuantities` (Task 9–10), `SizeTemplate`.
- Produces: `POST /api/cuts/calculate {articleId, sizeIds: string[], quantities?: {sizeId:string, qty:number}[]}` → `{stock:{materials:[…]}, requests: Request[], plan: CutPlan, usedAreaM2, wasteAreaM2}`; без `quantities` используется `suggestQuantities`; режим берется из `Article.cutMode`; расчет ничего не пишет в БД.

- [ ] **Step 1:** Тесты: артикул из другой организации → 404 (**Review Focus 1**); `qty` = 0, −1, 1.5 → 400 (**Review Focus 2**); ручные количества, не помещающиеся → 200 с `feasible:false`; обрезки артикула участвуют; расчет не изменяет баланс.
- [ ] **Step 2–4:** Реализовать; PASS.
- [ ] **Step 5:** Commit `feat: cut calculation api`.

### Task 12: Документ раскроя — выполнение

**Files:**
- Create: `backend/src/documents/{documents.service,documents.controller}.ts`
- Test: `backend/test/cut-document.e2e-spec.ts`

**Interfaces:**
- Consumes: `CutPlan` (Task 9), `LedgerService` (Task 8).
- Produces: `CutDocument(id, orgId, number, articleId, status: DONE|CANCELLED, version, createdBy, createdAt)`, `CutDocumentLine(documentId, sourceMaterialId, sizeId, qty)`; `POST /api/cuts {articleId, sizeIds, quantities}` — пересчитывает на сервере; если не feasible → 409; в одной транзакции создает документ, `CUT_CONSUME` (−1 по каждому использованному источнику), `CUT_OUTPUT` (+qty ковров по SKU; SKU создаются при необходимости), создает новые `Material{kind:REMNANT}` и их `RECEIPT`; `GET /api/cuts`, `GET /api/cuts/:id`; сквозной номер документа в организации.

- [ ] **Step 1:** Тесты: после выполнения рулон списан, ковры оприходованы, обрезок 150×100 появился в остатках; параллельное выполнение двух документов на один рулон → второй 409 (блокировка строк); `CUTTER` → 403.
- [ ] **Step 2–4:** Реализовать; PASS.
- [ ] **Step 5:** Commit `feat: execute cut document`.

### Task 13: Правка документа «на месте», история, конфликты

**Files:**
- Create: `backend/src/documents/{document-edit.service,conflicts.service}.ts`; модель `CutDocumentVersion`
- Test: `backend/test/document-edit.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 12.
- Produces: `PATCH /api/cuts/:id {lines: {sourceMaterialId,sizeId,qty}[], outputs?: …, reason}` — только `OWNER`,`OPERATOR`; в транзакции записывает `EDIT_REVERSAL` для прежних движений и новые движения, сохраняет `CutDocumentVersion(documentId, version, snapshot, editedBy, reason, createdAt)`, увеличивает `version`; `ConflictsService.check(orgId, documentId): Promise<{materialId, balance:number, laterDocumentIds:string[]}[]>`; ответ PATCH содержит `warnings` (конфликты) и **сохраняет правку даже при конфликте**; `GET /api/stock/problems` — позиции с отрицательным остатком; `GET /api/cuts/:id/history`.

- [ ] **Step 1:** Тесты: исправить 5×(150×200) на 4 → ковры = 4, версия 2, в истории видно «было/стало» и автора; правка, убирающая обрезок, уже использованный документом №2 → 200, `warnings` содержит документ №2, `/stock/problems` показывает позицию; правка с отрицательным `qty` → 400.
- [ ] **Step 2–4:** Реализовать; PASS.
- [ ] **Step 5:** Commit `feat: edit cut document in place`.

### Task 14: Спецификация (PDF)

**Files:**
- Create: `backend/src/documents/spec-pdf.service.ts`, шрифт `backend/assets/fonts/Roboto-*.ttf`
- Test: `backend/test/spec-pdf.e2e-spec.ts`

**Interfaces:**
- Consumes: `CutDocument` (Task 12).
- Produces: `GET /api/cuts/:id/spec.pdf` — доступно всем ролям; `SpecPdfService.render(documentId): Promise<Buffer>`; содержит номер, дату, артикул, таблицу «источник → размер → количество», остатки; ШК у строк, где есть (подключается в Task 15).

- [ ] **Step 1:** Тест: ответ `application/pdf`, начинается с `%PDF`; текстовое содержимое (извлечь через `pdf-parse`) содержит «109029» и «150×200»; кириллица не превращается в «?».
- [ ] **Step 2–4:** Реализовать на pdfmake; PASS.
- [ ] **Step 5:** Commit `feat: spec pdf`.

### Task 15: Штрихкоды EAN-13

**Files:**
- Create: `backend/src/barcodes/{ean13.ts,barcodes.service.ts,barcodes.controller.ts}`; модели `Sku`, `BarcodeSequence`
- Test: `backend/src/barcodes/ean13.spec.ts`, `backend/test/barcodes.e2e-spec.ts`

**Interfaces:**
- Produces: `checkDigit(first12: string): number`; `isValidEan13(code: string): boolean`; `formatEan13(prefix: string, seq: number): string` (длина префикса 7–9; номер товара добивается нулями до `12 − prefix.length`); `Sku(id, orgId, articleId, sizeId, ean13?)` с уникальностью `(orgId, ean13)` и `(articleId, sizeId)`; `BarcodesService.ensureSku(tx, articleId, sizeId): Promise<Sku>` — для артикулов с `barcodeEnabled` присваивает следующий номер из `BarcodeSequence` (блокировка `SELECT … FOR UPDATE`); `PUT /api/org/gs-prefix {prefix}` (7–9 цифр; смена после первого присвоения → 409); `PUT /api/skus/:id/barcode {ean13}` — ручной ввод с проверкой контрольной цифры и уникальности; присвоенный номер не меняется и не переиспользуется.

- [ ] **Step 1:** Тесты: `checkDigit("460012345678")` равен значению, посчитанному по алгоритму GS1 (взять эталонный пример `4006381333931` → цифра 1); `isValidEan13("4006381333931") === true`, `"4006381333932"` → false; `formatEan13("4600123", 1)` → строка длиной 13 с валидной цифрой; 20 параллельных `ensureSku` для разных размеров → 20 разных кодов без дублей (**Review Focus 3**); повторный `ensureSku` той же пары → тот же код; без префикса → 409 `GS_PREFIX_REQUIRED`; ручной ШК с неверной цифрой → 400; дубль в организации → 409.
- [ ] **Step 2–4:** Реализовать; подключить `ensureSku` к Task 12 (создание SKU при `CUT_OUTPUT`) и ШК к Task 14; PASS.
- [ ] **Step 5:** Commit `feat: ean13 barcodes`.

### Task 16: Остатки готовых ковров, поиск по ШК, этикетки

**Files:**
- Create: `backend/src/barcodes/labels.service.ts`; доработка `stock.controller.ts`
- Test: `backend/test/labels.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /api/stock/carpets?articleId=&q=&ean=` (поиск по ШК и артикулу); `GET /api/skus/:id/label.pdf?copies=N` — этикетка с кодом (bwip-js), артикулом и размером; размер этикетки по умолчанию 58×40 мм, настройка в организации (`labelWidthMm`, `labelHeightMm`).

- [ ] **Step 1:** Тесты: поиск по полному ЕАН возвращает один SKU; PDF этикетки начинается с `%PDF`; `copies` > 200 → 400.
- [ ] **Step 2–4:** Реализовать; PASS.
- [ ] **Step 5:** Commit `feat: carpet stock search and labels`.

### Task 17: Оплата — тарифы, ЮKassa, счета по реквизитам

**Files:**
- Create: `backend/src/subscription/payments/{yookassa.client,payments.service,payments.controller,invoices.service}.ts`
- Test: `backend/test/payments.e2e-spec.ts`

**Interfaces:**
- Consumes: `SubscriptionService` (Task 5).
- Produces: `TariffPrice(plan, months: 1|3|6|12, priceKopecks)` (настраивается админом); `POST /api/billing/checkout {plan, months, method: 'YOOKASSA'|'INVOICE'}` → для ЮKassa создает `Payment(status: PENDING, externalId unique)` и возвращает `confirmationUrl`; `POST /api/billing/yookassa/webhook` — игнорирует тело как источник истины: по `object.id` запрашивает платеж через API (`YooKassaClient.getPayment(id)`) и только при `succeeded` продлевает подписку (идемпотентно по `externalId`); `POST /api/admin/invoices/:id/mark-paid` — продлевает подписку; продление добавляется к `max(now, expiresAt)`.

- [ ] **Step 1:** Тесты (клиент ЮKassa мокается): webhook повторно с тем же `id` → срок продлен один раз (**Review Focus 4**); webhook с `id` платежа, который API вернул как `pending`/`canceled` → подписка не продлена; webhook с неизвестным `id` → 200 без эффекта; продление за 3 мес. до окончания добавляет 3 мес. к текущему `expiresAt`; `mark-paid` дважды → один раз.
- [ ] **Step 2–4:** Реализовать; PASS.
- [ ] **Step 5:** Commit `feat: payments`.

### Task 18: Уведомления об окончании подписки

**Files:**
- Create: `backend/src/subscription/notifications.service.ts`
- Test: `backend/test/notifications.spec.ts`

**Interfaces:**
- Produces: `NotificationsService.run(now: Date): Promise<number>` — ежедневная задача (cron 09:00 МСК); `SubscriptionNotice(orgId, kind: D30|D15|D7..D1, sentAt)` с уникальностью `(orgId, kind, expiresAt)`; письмо владельцам; поле `GET /api/subscription → noticeBanner?`.

- [ ] **Step 1:** Тесты: при 30 днях → письмо `D30`; при 29 → нет; 15 → `D15`; на каждый из 7…1 дней по одному; повторный запуск в тот же день → не дублирует; после продления счет уведомлений начинается заново.
- [ ] **Step 2–4:** Реализовать; PASS.
- [ ] **Step 5:** Commit `feat: expiry notifications`.

### Task 19: Админ сервиса

**Files:**
- Create: `backend/src/admin/*`
- Test: `backend/test/admin.e2e-spec.ts`

**Interfaces:**
- Produces: флаг `User.isServiceAdmin`; `GET /api/admin/orgs`, `GET /api/admin/invoices`, `PUT /api/admin/tariff-prices`; обычный владелец → 403.

- [ ] **Step 1–4:** Тесты на 403/200 и изменение цены; реализация; PASS. **Step 5:** Commit `feat: service admin`.

### Task 20: Фронтенд — каркас, публичный сайт, вход, демо

**Files:**
- Create: `frontend/src/{App.tsx,api/client.ts,pages/{Home,Pricing,Login,Register,Demo}.tsx,components/Layout.tsx}`
- Test: `frontend/src/pages/*.test.tsx`

**Interfaces:**
- Consumes: `/api/auth/*`, `/api/subscription`.
- Produces: файл токенов `frontend/src/styles/tokens.css` (цвета, шрифты, радиус, обе темы) и компонент `<CutPlanSvg plan, rollWidthCm, rollLengthCm />` (используется в Task 22 и в демо; масштаб 0,4 единицы на см, подписи внутри кусков, обрезок со штриховкой); `apiFetch<T>(path, init?): Promise<T>` (cookie, обработка 401 → редирект на вход, 402 → баннер «подписка закончилась»); `useSession()` → `{user, role, subscription}`; маршруты `/`, `/pricing`, `/login`, `/register`, `/demo`, защищенная зона `/app/*`; демо на фиксированных вымышленных данных, без записи.

- [ ] **Step 1:** Тесты (Vitest + Testing Library): форма регистрации показывает ошибку при пароле < 10 символов; после 401 происходит редирект на `/login`; на `/demo` нет кнопок редактирования.
- [ ] **Step 2–4:** Реализовать; PASS. **Step 5:** Commit `feat(web): shell, public pages, auth`.

### Task 21: Фронтенд — артикулы, размеры, склад

**Files:**
- Create: `frontend/src/pages/{Articles,ArticleForm,Sizes,Stock,ReceiveRoll}.tsx`
- Test: `frontend/src/pages/Articles.test.tsx`

**Interfaces:**
- Consumes: Task 6–8, 16 API.
- Produces: список артикулов с фильтрами по артикулу и остатку; карточка с режимом резки, флагом ШК, фото; приход рулона (ввод размерами, отображение м²); остатки рулонов, обрезков и ковров; ручные списание и оприходование с обязательной причиной; история движений.

- [ ] **Step 1:** Тесты: фильтр «есть остаток» отправляет `stock=inStock`; форма прихода показывает площадь в м² при вводе 150×2500 (`37.5`); списание без причины блокирует отправку.
- [ ] **Step 2–4:** Реализовать; PASS. **Step 5:** Commit `feat(web): catalog and stock screens`.

### Task 22: Фронтенд — экран раскроя

**Files:**
- Create: `frontend/src/pages/Cutting.tsx`, `frontend/src/components/CutPlanView.tsx`
- Test: `frontend/src/pages/Cutting.test.tsx`

**Interfaces:**
- Consumes: `POST /api/cuts/calculate`, `POST /api/cuts`.
- Produces: выбор артикула → остатки → выбор размеров → автоподбор количеств; ручное изменение количеств вызывает пересчет (debounce 300 мс); индикатор «можно / нельзя» с недостающими штуками; схема раскроя по источникам; кнопка «Выполнить раскрой» недоступна при `feasible:false`.

- [ ] **Step 1:** Тесты: изменение количества вызывает `calculate` один раз после паузы; при `feasible:false` кнопка отключена и показан `shortfall`; успешное выполнение переводит на документ.
- [ ] **Step 2–4:** Реализовать; PASS. **Step 5:** Commit `feat(web): cutting screen`.

### Task 23: Фронтенд — документы, правка, спецификация, этикетки

**Files:**
- Create: `frontend/src/pages/{Documents,DocumentView,DocumentEdit,Problems}.tsx`
- Test: `frontend/src/pages/DocumentEdit.test.tsx`

**Interfaces:**
- Consumes: Task 12–16 API.
- Produces: список и карточка документа с историей версий; форма правки с обязательной причиной; предупреждение о конфликте со ссылками на затронутые документы (правка все равно сохраняется); страница «Проблемные остатки»; кнопки «Спецификация PDF» и «Печать этикеток».

- [ ] **Step 1:** Тесты: ответ с `warnings` показывает список документов и сообщение «изменение сохранено»; без причины форма не отправляется.
- [ ] **Step 2–4:** Реализовать; PASS. **Step 5:** Commit `feat(web): documents, edits, specs`.

### Task 24: Фронтенд — подписка, оплата, сотрудники, настройки, админ

**Files:**
- Create: `frontend/src/pages/{Billing,Employees,OrgSettings,Admin}.tsx`
- Test: `frontend/src/pages/Billing.test.tsx`

**Interfaces:**
- Consumes: Task 4, 5, 15, 17, 18, 19 API.
- Produces: выбор тарифа и срока, оплата картой или СБП (редирект на `confirmationUrl`), запрос счета; баннер окончания подписки; управление сотрудниками и ролями; настройки: префикс GS1 (с подсказкой, что регистрация в GS1 на стороне пользователя), порог отхода, размер этикетки; админ-раздел для владельца сервиса.

- [ ] **Step 1:** Тесты: при `EXPIRED` кнопки записи в кабинете скрыты, виден баннер оплаты; смена префикса после присвоения показывает ошибку 409.
- [ ] **Step 2–4:** Реализовать; PASS. **Step 5:** Commit `feat(web): billing and settings`.

### Task 25: Развертывание в РФ, резервные копии, e2e-проверка

**Files:**
- Create: `deploy/{docker-compose.prod.yml,Caddyfile,backup.sh,restore.md}`, `e2e/smoke.spec.ts` (Playwright)
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: production-сборка (backend, frontend, Postgres, объектное хранилище) на сервере в РФ за HTTPS; ежедневный `pg_dump` + архив WAL, проверка восстановления в `restore.md`; переменные окружения вынесены в `.env`, секретов в репозитории нет.

- [ ] **Step 1:** Smoke-сценарий Playwright: регистрация → артикул → приход рулона 150×2500 → расчет 150×150, 150×200, 150×300 → «Выполнить раскрой» → остатки обновились → правка документа → скачивание спецификации.
- [ ] **Step 2:** Запустить на dev-сборке — убедиться, что падает до донастройки.
- [ ] **Step 3:** Подготовить деплой и backup-скрипты; выполнить пробное восстановление копии в чистую БД и сверить количество записей.
- [ ] **Step 4:** Smoke → PASS на production-подобной сборке.
- [ ] **Step 5:** Commit `chore: deploy, backups, e2e smoke`.

---

## Self-Review (проведено)

- **Покрытие спецификации:** подписка, тарифы, пробный период, уведомления, оплата, счета, демо (Task 5, 17, 18, 20, 24); артикулы, режимы резки, фото, фильтры (6, 21); шаблонные размеры (7); журнал остатков и ручные корректировки (8); раскрой LINEAR/ANY и автоподбор (9–11); документ, правка на месте, конфликты (12–13); спецификация (14); ШК и этикетки (15–16); роли и сотрудники (4); админ (19); безопасность и RLS (2, 3); РФ-хостинг и бэкапы (25).
- **Согласованность типов:** `Source/Request/Placement/CutPlan` определены в Task 9 и используются в 10–12; `LedgerService.post`, `BalanceService` — в 8 и далее; `ensureSku` — в 15, подключается к 12 и 14.
- **Открытые вопросы спецификации, не блокирующие код:** состав характеристик карточки (поле `extra`), цены тарифов (настройка в Task 19), роли и пороги подтвердить при приемке. Платежи в СНГ — вне первой версии.
