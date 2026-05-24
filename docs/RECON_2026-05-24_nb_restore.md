# RECON — NB-RESTORE (возврат админки notebooks/questions/cities под auth)

**Дата:** 2026-05-24
**Тип:** read-only recon, никаких изменений
**Источник:** запрос стратега 2026-05-24, продолжение [NB_RESTORE_PLAN.md](NB_RESTORE_PLAN.md)
**Связанные документы:**
- [SEC_PINS_2026-05-05.md](SEC_PINS_2026-05-05.md) — обоснование выпила (Variant A)
- [NB_RESTORE_PLAN.md](NB_RESTORE_PLAN.md) — первая итерация плана восстановления
- [ARCH_CHECK_meetings_admin_2026-05-05.md](ARCH_CHECK_meetings_admin_2026-05-05.md) — карта дублирования с Garden

> **⚠️ Note (SUPABASE-LEGACY-CLEANUP, 2026-05-24):** папка `supabase_meetings/` удалена (lovable-bootstrap артефакт, в runtime не использовалась). Ссылки ниже на `../supabase_meetings/*.sql` ведут в пустоту — просматривать через git: `git show 2d416df:supabase_meetings/<filename>`. Source of truth для схемы — Garden migrations.

---

## TL;DR

1. **Когда выпиливали:** commit [`c4acd8a`](https://github.com/ligacreate/meetings/commit/c4acd8a) (2026-05-05 22:19), мерж [#1 `f87dcee`](https://github.com/ligacreate/meetings/commit/f87dcee). До этого админка жила за клиент-сайд PIN-кодом, без JWT, и физически перестала работать 2026-05-04 после Garden phase 18 (anon write 401).
2. **Что было:** [AdminView.tsx](../src/components/AdminView.tsx) (PIN-форма) + 6 компонентов в [src/components/admin/](../src/components/admin/) (1720 строк). Стек: Tabs + framer-motion + анонимный `postgrestRequest('POST/PATCH/DELETE')`.
3. **Данные живы:** notebooks=3, questions=105, cities=8 — все доступны для SELECT через `web_anon`. Write 401 (PostgREST 42501). Подтверждено curl'ом 2026-05-24 (см. §3).
4. **Auth уже доступна:** `auth.skrebeyko.ru/auth/login` отвечает CORS-preflight'ом для `https://meetings.skrebeyko.ru` ✅. `api.skrebeyko.ru` отдаёт `Access-Control-Allow-Origin: *` ✅. **Никаких Garden-side инфра-правок не нужно** — все три варианта могут стартовать без блокировок со стороны Garden-команды.
5. **Главный нерешённый блокер:** ANOM-004 (deferred из [phase 18 sql:47-48](../../../garden_claude/garden/migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql)). Сейчас **любой authenticated**-юзер может писать в notebooks/questions/cities — RLS-policy `WITH CHECK (true)` ([migration 20251123 sql:71-81](../supabase_meetings/20251123221523_1e9348bf-f176-46f4-b0cd-3626dcf1ca18.sql#L71-L81)), а phase 16/23 раздали `GRANT INSERT/UPDATE/DELETE … TO authenticated`. То есть «получить JWT» = «писать тетради» — это P1 для Garden до того, как восстанавливать админку.
6. **Уточнение к NB_RESTORE_PLAN:** Garden-auth — это **email+password → JWT** (`/auth/login`, `localStorage.garden_auth_token`), не Telegram. Telegram только для связи (PUSH-уведомления). Это меняет UX-формулировку «Войти через Telegram» → «Войти как в Сад».
7. **Рекомендация:** **Variant (a) admin-bundle в meetings, lazy-loaded, reuse garden-auth (`auth.skrebeyko.ru`).** Самый дешёвый по работе (1.5-2 дня), нет дублирования между репо, чистый разрыв публичного бандла от админ-бандла. Но **до apply варианта** обязательно закрыть ANOM-004 (RLS / GRANT-tightening) — иначе наивно реализованная админка даст admin-доступ любому applicant'у Garden.

---

## 1. Git history — когда и как выпилили админку

### Хронология

| Дата | Commit | Что |
|---|---|---|
| ≤2026-05-04 | (исходный код) | админка жила за PIN'ом `0000`/`1111` в [src/data/initialData.ts](../src/data/initialData.ts), 7 файлов в [src/components/admin/](../src/components/admin/), без JWT |
| 2026-05-04 | Garden migration [phase18](../../../garden_claude/garden/migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql) | `REVOKE` writes для `web_anon` → POST/PATCH/DELETE из админки начали возвращать 401/42501. Админка физически сломана, но фронт показывал форму с тостом «Не удалось». |
| 2026-05-05 | [c4acd8a](https://github.com/ligacreate/meetings/commit/c4acd8a) `sec-pins: remove dead admin + mapview` | удалены все 7 admin-файлов + lib/postgrest.ts admin-write обёртка + 4 npm-пакета. Bundle 2.4M → 664K (−73%). |
| 2026-05-05 | [f87dcee](https://github.com/ligacreate/meetings/commit/f87dcee) | мерж PR #1 в main |
| 2026-05-05 | [3abe4e4](https://github.com/ligacreate/meetings/commit/3abe4e4) | gitignore claude-state (housekeeping) |

### Что именно удалил `c4acd8a`

```
src/components/AdminView.tsx                   (141 строк) — PIN-форма + враппер
src/components/admin/AdminPanel.tsx            (104)        — табы и роутинг
src/components/admin/EventsAdmin.tsx           (857)        — формы событий
src/components/admin/CitiesAdmin.tsx           (105)        — справочник городов
src/components/admin/NotebooksAdmin.tsx        (277)        — тетради издательства
src/components/admin/QuestionsAdmin.tsx        (191)        — вопросы рефлексии (одиночно + bulk)
src/components/admin/InstagramExport.tsx       (186)        — html-to-image PNG-экспорт
src/data/initialData.ts                        (33)         — `PINS` + `INITIAL_*` константы
src/lib/postgrest.ts                           (40)         — write-обёртка fetch'a
public/admin/index.html                        (15)         — meta-refresh редирект на /#/admin
src/components/MapView.tsx                     (209)        — мёртвый mapbox-компонент (бонус)
```

Плюс точечные правки в [App.tsx](../src/App.tsx) (роут `/admin`), [Index.tsx](../src/pages/Index.tsx) (admin-ветка, lazy import, `adminMode` prop) и [EventsView.tsx](../src/components/EventsView.tsx) (mapview-ветка). Из package.json убрано 4 dep'а: `html-to-image`, `file-saver`, `@types/file-saver`, `mapbox-gl`.

### Архитектура удалённой админки (по diff'у)

- **Auth-модель:** клиент-сайд `if (pinInput === PINS.ADMIN) setUserRole('admin')`. PIN'ы попадали в `dist/assets/*.js` plain-text после `vite build` (это и есть AUDIT P0-1).
- **Роли:** `admin` (PIN 0000) видел все 5 табов, `host` (PIN 1111) — только «События».
- **Транспорт:** [src/lib/postgrest.ts](../src/lib/postgrest.ts) — обёртка над `fetch` к `api.skrebeyko.ru`, дёргавшая POST/PATCH/DELETE напрямую, **без `Authorization`-заголовка**. Кейс-эталон ниже (NotebooksAdmin):

```typescript
// до выпила, NotebooksAdmin.tsx:64-74
const data = await postgrestRequest<Notebook[]>('notebooks', {}, {
  method: 'POST',
  body: [{ title, description, image_url, pdf_url }],
  returnRepresentation: true,
});
```

- **UI-стек:** shadcn/ui (Button, Input, Label, Textarea, Tabs) + framer-motion (анимации списков) + lucide-react (иконки). Загрузка изображений шла через [src/lib/imageUtils.ts](../src/lib/imageUtils.ts) — compress в JPEG base64, попадало в `notebook.image_url` как `data:image/jpeg;base64,...` (см. также AUDIT P2-3 — анти-паттерн, надо было через Supabase Storage `notebook-images` bucket; bucket существует ([migration 20251129 sql:22](../supabase_meetings/20251129054537_8fae6829-3969-49ed-94d3-4bfea6bc3abf.sql#L22)), но фронт его не использовал).
- **Особенности**, которые надо учесть при возврате:
  - **NotebooksAdmin** — base64 image_url хранится прямо в БД (для существующих 3 записей: `notebook.id=1` тоже base64, `id=2/3/4` — уже URL в Supabase Storage, см. §3). Новая админка должна сразу писать в Storage URL'ы.
  - **QuestionsAdmin** — DELETE идёт по тексту (`question=eq.<text>`), а не по id. Если 2 вопроса с одинаковым текстом — снесутся оба. Минорный баг, легко чинится переходом на `id=eq.<n>`.
  - **CitiesAdmin** — DELETE по name, фронт держит специальный «Все» (фильтр-городов алиас), от удаления защищён `if (city === 'Все') return`.

---

## 2. Текущая DB-схема таблиц

Схема создаётся миграцией [supabase_meetings/20251123… sql](../supabase_meetings/20251123221523_1e9348bf-f176-46f4-b0cd-3626dcf1ca18.sql) (это lovable-стиль supabase boostrap, лежит в репо meetings; но реально база живёт на сервере Garden, и phase 16/18/23 миграции Garden дополняют RLS/GRANT'ы).

### `public.notebooks`
```sql
id          SERIAL PRIMARY KEY,
title       TEXT NOT NULL,
description TEXT NOT NULL,
image_url   TEXT,            -- может быть base64 (legacy) или https://…supabase.co/storage/v1/...
pdf_url     TEXT,
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `public.questions`
```sql
id          SERIAL PRIMARY KEY,
question    TEXT NOT NULL,
order_index INTEGER NOT NULL,
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `public.cities`
```sql
id         SERIAL PRIMARY KEY,
name       TEXT NOT NULL UNIQUE,
created_at TIMESTAMPTZ DEFAULT NOW()
```

### `public.events` (для контекста — пишется через trigger из `meetings`, прямой админки не нужно)
```sql
id, garden_id, title, date, time, city, source_timezone, location, speaker, category,
registration_link, price, image_gradient, image_url, image_focus_x, image_focus_y,
host_telegram, host_vk, description, created_at
```

### Storage buckets ([migration 20251129](../supabase_meetings/20251129054537_8fae6829-3969-49ed-94d3-4bfea6bc3abf.sql))

| Bucket | Public | RLS | Назначение |
|---|---|---|---|
| `event-images` | ✅ | INSERT/UPDATE/DELETE для всех (без auth-check) | картинки событий |
| `notebook-images` | ✅ | то же | картинки тетрадей |

⚠️ **RLS на storage.objects сейчас тоже permissive** (`WITH CHECK (bucket_id = 'notebook-images')` без `auth.uid()`). Это значит, что любой клиент без JWT может писать в bucket — отдельная дыра (но в meetings-репо нет write-флоу к Storage, поэтому пока не эксплуатируется). При возврате админки надо одновременно затянуть и storage RLS.

---

## 3. Текущее состояние БД (live, curl 2026-05-24)

### Counts

| Таблица | Count |
|---|---|
| `notebooks` | **3** |
| `questions` | **105** |
| `cities` | **8** |

### Sample (top-N)

**notebooks** (3 строки):
```json
[{"id":4,"title":"Tesoro notes","pdf_url":"https://izdatelstvo.skrebeyko.ru/tesoro","created_at":"2025-11-25"},
 {"id":3,"title":"Блокнот в линейку","pdf_url":"https://izdatelstvo.skrebeyko.ru/delo-goda/tproduct/854758791-769648732612-bloknot-v-lineiku-b5","created_at":"2025-11-25"},
 {"id":2,"title":"Блокнот в точку","pdf_url":"https://izdatelstvo.skrebeyko.ru/delo-goda/tproduct/854758791-148772689912-bloknot-v-tochku-formata-a5","created_at":"2025-11-24"}]
```

`notebook.id=2` имеет `image_url=https://rqdsletjyncigvesufqe.supabase.co/storage/v1/object/public/notebook-images/notebook_1770389398240_218.jpg` — то есть **последнюю запись Ольга всё-таки сделала через Supabase Storage**, а не base64. Старого base64 в текущем dataset нет.

**questions** (105 строк всего, первые 5):
```
1. Какую красивую историю вы хотите рассказать о своей жизни сегодня?
2. Что пугает вас в переменах? А что страшного в том, чтобы оставаться таким же? …
3. Вы сейчас работаете на нужном расстоянии от проблемы? …
4. Какая текущая доминанта/потребность мешает вам в движении к новому?
5. Чья мечта стала вашей явью? …
```
order_index'ы не последовательные (есть пропуск 4→5), но это не блокер — `order_index.asc` всё равно сортирует.

**cities** (все 8):
`Екатеринбург, Казань, Москва, Онлайн, Пермь, Санкт-Петербург, Севастополь, Симферополь`

### RLS / role-grants — фактическое состояние

| Роль | events | cities | notebooks | questions |
|---|---|---|---|---|
| `web_anon` | SELECT | SELECT | SELECT | SELECT |
| `authenticated` | SELECT (writes revoked в phase 18, восстановлены в phase 19 ради trigger sync) | **SELECT/INSERT/UPDATE/DELETE** | **SELECT/INSERT/UPDATE/DELETE** | **SELECT/INSERT/UPDATE/DELETE** |
| RLS policies | events_* (`USING (true)` для всех CRUD из 20251123 sql) | cities_* (`WITH CHECK (true)`) | notebooks_* (`WITH CHECK (true)`) | questions_* (`WITH CHECK (true)`) |

**Это означает:** `is_admin()`-чек **сейчас не применяется** к notebooks/questions/cities. Любой пользователь Сада с подтверждённым аккаунтом (роль `applicant`/`gardener`/`mentor`/`admin` — без разницы) может через DevTools `fetch('/notebooks', { method: 'POST', headers: { Authorization: 'Bearer <свой_jwt>' }, body: ... })` создать или удалить тетрадь.

Это **тот самый ANOM-004**, который phase 18 пометил как «отдельный таск» и оставил на будущее.

### Probe-результаты (live, без JWT)

```
POST /notebooks  → 401 42501 "permission denied for table notebooks"
POST /questions  → 401 42501 "permission denied for table questions"
POST /cities     → 401 42501 "permission denied for table cities"
GET  /notebooks  → 200 (3 rows)
```

### Probe-результаты (CORS, для будущего)

```
OPTIONS https://auth.skrebeyko.ru/auth/login
  Origin: https://meetings.skrebeyko.ru
  → 204 Access-Control-Allow-Origin: https://meetings.skrebeyko.ru ✅

OPTIONS https://api.skrebeyko.ru/notebooks
  Origin: https://meetings.skrebeyko.ru
  Access-Control-Request-Headers: authorization,content-type
  → 200 Access-Control-Allow-Origin: * ✅
```

**Garden-side инфра уже готова принимать JWT-запросы от meetings-домена.** Никаких CORS-allowlist'ов добавлять не нужно (это уточнение к NB_RESTORE_PLAN, где было «изменения в Garden auth-сервисе (whitelist для meetings-домена в Allowed Origins)»).

---

## 4. Garden-auth recap (что реально под капотом)

Уточнение к NB_RESTORE_PLAN (там фигурировал «Telegram-Auth»).

- **Сервис:** `https://auth.skrebeyko.ru` — отдельный Express, не часть Garden-фронта. Endpoint'ы: `/auth/login`, `/auth/register`, `/api/profile/*`, `/api/profile/generate-tg-link-code` (это и есть «Telegram-привязка», но не auth).
- **Flow:** `POST /auth/login` с `{ email, password }` → `{ token, user }`. Token — это **JWT с RS-подписью**, который PostgREST проверяет через `jwt-secret`. Claim `sub` = `auth.uid()`, claim `role` управляет ролью в PostgREST. См. [garden services/dataService.js:1235-1256](../../../garden_claude/garden/services/dataService.js).
- **Frontend:** хранит JWT в `localStorage.garden_auth_token`, передаёт `Authorization: Bearer <jwt>` в **каждый** PostgREST-запрос (см. [garden services/dataService.js:42-44](../../../garden_claude/garden/services/dataService.js)).
- **Роль:** в PostgREST под JWT — `authenticated`. Отдельной роли `admin` на уровне PostgREST/role-switch **нет** — admin-проверка живёт в `public.is_admin()` (SQL-функции), которая смотрит на `profiles.role = 'admin'`. RLS-policies, использующие `is_admin()`, видны в [garden migrations](../../../garden_claude/garden/migrations/08_meetings_rls.sql) (для таблицы meetings), [16_course_progress_rls.sql](../../../garden_claude/garden/migrations/16_course_progress_rls.sql), [phase24/25/27/28](../../../garden_claude/garden/migrations/) и т.д. На notebooks/questions/cities **сейчас такой policy нет**.
- **Telegram** — это PUSH-канал (см. phase 32 `tg_notifications` + linking-flow). На auth не влияет.

### Что это значит для NB-RESTORE

- UX: вход в админку = тот же email+password, что в Саду (или регистрация в Саду + role=admin). Не «Войти через Telegram».
- Чтобы сделать настоящий admin-gate в meetings-админке, **нужна параллельная работа в Garden:** добавить RLS-policy типа `notebooks_admin_write USING (public.is_admin()) WITH CHECK (public.is_admin())` для INSERT/UPDATE/DELETE и снять `WITH CHECK (true)`. Это ANOM-004.

---

## 5. Архитектурные варианты возврата

Три варианта на выбор стратега. Все они **технически разблокированы** (см. §3 — CORS готов). Различаются по scope, blast radius и долгосрочной чистоте.

### (a) Admin-bundle в том же репо, lazy-loaded

**Идея:** вернуть директорию `src/components/admin/` (можно почти восстановить из `c4acd8a`), но:
- роут `/admin` lazy-импортит bundle, основной публичный chunk не растёт;
- PIN заменяется на email+password через `auth.skrebeyko.ru/auth/login`;
- все write-вызовы передают `Authorization: Bearer <jwt>`;
- бандл админки — отдельный chunk, попадает в `dist/` только если зайти на `/admin`.

**Что точно надо:**
- В meetings: вернуть `src/lib/postgrest.ts` (write-обёртка + Bearer), вернуть `AdminView` (форма логина), `AdminPanel`, `NotebooksAdmin`, `QuestionsAdmin`, `CitiesAdmin` (EventsAdmin и InstagramExport не восстанавливать — дублируется Garden / не нужно).
- В meetings: добавить `import.meta.env.VITE_AUTH_URL` (default `https://auth.skrebeyko.ru`) + `getAuthToken()`/`setAuthToken()` (по образцу [garden dataService.js:15-19](../../../garden_claude/garden/services/dataService.js)).
- В Garden migrations: **ANOM-004** — RLS-policy `… USING (public.is_admin()) WITH CHECK (public.is_admin())` на notebooks/questions/cities (а параллельно — снять `WITH CHECK (true)`). Без этого любой Garden-юзер сможет писать.
- В meetings: переезд `image_url` для тетрадей с base64 → Supabase Storage (bucket `notebook-images` уже есть). Это не блокер для апи, но без него бандл будет тащить base64 в БД и raise-quota issues.

**Плюсы:**
- Минимум репо-движений (всё в meetings, Garden-команда только пишет 1 migration для ANOM-004).
- Один TLS-домен, никакого DNS-таскания.
- Lazy-chunk не растит публичный бандл — bundle-size win сохраняется.
- Логин уровня Garden — email/password, JWT, refresh при истечении.

**Минусы:**
- В git-истории meetings снова появляется admin-код. Но это локализованная директория, легко аудитить.
- FTP-deploy `dangerous-clean-slate: true` ([deploy.yml:32](../.github/workflows/deploy.yml#L32)) — не страшно, потому что вся правка остаётся в bundle, не на сервере.
- Зависимость от auth-сервиса (если он лежит — админка тоже).

**Время:** 1.5-2 дня в meetings + 0.5 дня Garden (migration + reload). Параллелится.

**Risk:** низкий для публичной части (lazy chunk не выполняется без визита на /admin). Средний для админ-части, пока ANOM-004 не закрыт (без него любой залогиненный пишет в БД).

---

### (b) Отдельный subdomain `admin.meetings.skrebeyko.ru`

**Идея:** новый поддомен, отдельный Vite-проект (можно либо как worktree/директория в meetings-репо, либо отдельный репо), отдельный bundle, отдельный CI/CD. Публичный фронт (`meetings.skrebeyko.ru`) остаётся **полностью read-only** — никакого admin-кода в его исходниках.

**Что нужно:**
- DNS: A-record `admin.meetings.skrebeyko.ru` → тот же FTP-хост (или Caddy reverse-proxy).
- Сервер: subdomain'у нужен свой VirtualHost / Caddy site-block, иначе будет 404. Для Caddy — одна строка. Для Apache+FTP — `.htaccess` пересоздавать вручную (clean-slate проблема).
- Repo-выбор: либо `meetings-admin/` директория с собственным `package.json`+`vite.config.ts`, либо отдельный репо `meetings_admin_claude/admin`. Второе — чище, но больше overhead для Ольги (ещё одна точка обслуживания).
- Auth — то же что в (a), email+password через auth.skrebeyko.ru.
- ANOM-004 в Garden — **обязательно** так же.

**Плюсы:**
- Публичный `dist/` не содержит ни строки admin-кода — это и в исходниках, и в бандле, и в браузере. Максимально чистая «публичная читалка».
- Bundle public-фронта вообще не растёт.
- Кеш браузера админ-фронта изолирован — публичные пользователи никогда не загружают админ-чанки.
- Отдельный CSP-заголовок для админки (если когда-нибудь захочется усилить).
- Хороший компромисс с (c): не уезжает в Garden, остаётся в meetings-team-зоне.

**Минусы:**
- DNS-настройка + сервер-конфиг — нужен доступ к хостингу/Caddy, **не делается с FTP-deploy**.
- Дублирование инфраструктуры: ещё один Vite, ещё один CI workflow, ещё одна точка деплоя.
- Двойной overhead на shadcn/ui shared components — можно вытащить в `packages/ui` workspace, но это не lovable-style monorepo, дорого.
- Если выбрать «новый отдельный репо» — дополнительная работа по zero-day setup.

**Время:** 2-3 дня (1 день инфра/DNS/server-config + 1-2 дня разработки админки). Сильно зависит от хостинга — если Caddy и есть SSH, можно за день; если только FTP — потребуется Caddy/sub-vhost.

**Risk:** средний. Главный — что FTP clean-slate сломает subdomain config (если он лежит на том же хосте без отдельного директорного root'а). Нужно убедиться, что Caddy-конфиг хранится **вне** деплоится-через-FTP-директории.

---

### (c) Переезд админки в Garden's `AdminPanel.jsx`

**Идея:** добавить 3 вкладки в Garden's `AdminPanel.jsx` (Notebooks/Questions/Cities), Garden-команда пишет формы, dataService и migration. Meetings — никаких изменений, остаётся полностью read-only.

**Что нужно:**
- В Garden `services/dataService.js`: новые методы `getNotebooks/addNotebook/updateNotebook/deleteNotebook/getQuestions/addQuestion/.../getCities/addCity/deleteCity`.
- В Garden `views/AdminPanel.jsx`: 3 новых вкладки с формами (нужен Storage-upload для notebook image).
- Migration в Garden: ANOM-004 (то же что в a/b — RLS `is_admin()` чек).
- Возможно: новый Storage bucket policy для admin-only writes на `notebook-images`.

**Плюсы:**
- **Архитектурно лучший:** один admin-домен, одна модель пользователей, один аудит-лог.
- meetings — 0 движений, остаётся read-only zero-write-surface. Это и контракт, и реальная защита.
- Решает проблему «дубликат архитектуры между двумя репо» навсегда.
- Garden-команда умеет всё: Telegram-link, profiles, role, RLS, аудит, Storage.

**Минусы:**
- **Полностью зависит от Garden-team бэклога.** Не самостоятельный таск meetings.
- 3 новых формы UI + dataService + Storage-flow — это 3-5 дней Garden-работы, реалистично 1-2 спринта по календарю.
- Garden's AdminPanel и так большой (см. [garden/views/AdminPanel.jsx](../../../garden_claude/garden/views/AdminPanel.jsx)) — добавление ещё 3 вкладок растит его сложность.

**Время:** 3-5 рабочих дней Garden-команды. По календарю — зависит от их приоритетов.

**Risk:** низкий для meetings (там не меняется ничего). Средний для Garden (новые формы, новые grants).

---

### Reuse garden-auth vs отдельный auth (для (a) и (b))

| Аспект | Reuse `auth.skrebeyko.ru` | Отдельный auth для meetings |
|---|---|---|
| **Implementation cost** | копия `authFetch` + `getAuthToken` из Garden | развернуть/администрировать новый auth-сервис (Auth0/Clerk/собственный) |
| **User model** | одна личность, один пароль | два логина → плохой UX |
| **JWT compatibility** | JWT уже подписан тем же secret'ом что PostgREST принимает → 0 изменений в БД | новый JWT-secret → пересборка PostgREST или новый эндпоинт → большой overhead |
| **Role tracking** | `profiles.role = 'admin'` уже работает через `is_admin()` | новая модель ролей |
| **Maintenance** | Garden-team поддерживает, meetings бесплатно получает фиксы | meetings-team поддерживает auth-сервис |
| **Trust** | если auth-сервис ляжет, обе админки лягут | независимость от Garden |

**Вердикт:** **Reuse — единственный разумный выбор.** Отдельный auth требует менять `jwt-secret` в PostgREST (= ломает Garden) или поднимать отдельный PostgREST-инстанс (= новая инфра). Никаких преимуществ при этом нет — Ольга и так использует email+password от Сада. Я не вижу сценария, где это было бы оправдано.

---

## 6. Сравнительная таблица

| Критерий | (a) admin-bundle | (b) subdomain | (c) переезд в Garden |
|---|---|---|---|
| Время разработки | 1.5-2 дня meetings + 0.5 дня Garden | 2-3 дня (зависит от инфры) | 3-5 дней Garden |
| Инфра-изменения | — | DNS + Caddy/Apache vhost | — |
| Зависит от Garden-team | только migration (ANOM-004) | только migration | **полностью** |
| FTP-clean-slate риск | нет | **возможно** (если конфиг рядом) | нет |
| Бандл публичной части | +chunk (lazy) | **0** | **0** |
| Архитектурная чистота | хорошая | очень хорошая | **отличная** |
| Меняет meetings-репо | да (~10 файлов) | да (новый каталог или репо) | **нет** |
| Read-only гарантия публичной части | да (через lazy + правки в Index.tsx) | **да (физически)** | **да (физически)** |
| Подверженность Ольгину велфер'у | через 2 дня | через 2-3 дня | через 1-2 спринта |
| Долгий-горизонт maintainability | хорошо | хорошо | **отлично** |

---

## 7. Блокеры, зависимости, риски

### Hard blockers — **без этого ни один вариант не безопасен**

1. **ANOM-004** (Garden-side): пока `notebooks/questions/cities` имеют permissive RLS (`WITH CHECK (true)`) и `GRANT … TO authenticated`, любой Сад-юзер может писать. Любая «авторизованная» админка в meetings без этого фикса = неполноценная защита.
   - **Артефакт:** new migration в Garden, например `2026-05-NN_phase39_meetings_content_admin_rls.sql`:
     - `DROP POLICY "Allow insert notebooks"; CREATE POLICY notebooks_admin_write FOR INSERT/UPDATE/DELETE USING (public.is_admin()) WITH CHECK (public.is_admin());`
     - аналогично для questions, cities.
     - аналогично для `storage.objects WHERE bucket_id = 'notebook-images'`.

### Soft blockers — критично, но обходимо

2. **`notebooks.image_url` storage modeling:** при возврате формы тетрадей нужно сразу писать в Supabase Storage `notebook-images` bucket, а не base64 в БД. Иначе будем тащить кило base64 в каждую тетрадь и плодить QuotaExceededError в localStorage-кеше (см. [Index.tsx:195-213](../src/pages/Index.tsx#L195-L213) — там уже есть workaround `({ image_url, ...rest })` чтобы не кешировать base64).

3. **(только для варианта b) Сервер-конфиг под subdomain:** если хостинг — Apache+FTP без `.htaccess`-overrides для subdomain'а, нужно либо мигрировать на Caddy/nginx, либо запросить настройку у хостинг-провайдера.

### Risks

| # | Риск | Вариант | Mitigation |
|---|---|---|---|
| R1 | Не закрыли ANOM-004 → любой Garden-юзер пишет в notebooks через DevTools | a/b/c | обязательно сделать migration **до** apply UI |
| R2 | Auth-сервис ляжет → админка не работает (Ольга не может загружать тетради) | a/b | manual escape hatch: Garden-стратег делает INSERT через psql/owner-роль |
| R3 | JWT истёк за время сессии → 401 в середине формы | a/b | implement `setAuthToken('')` + redirect на login при 401, аналогично Garden's [pvlPostgrestApi.js](../../../garden_claude/garden/services/pvlPostgrestApi.js) |
| R4 | FTP clean-slate сносит admin-bundle конфиг | b | конфиг живёт **вне** /var/www/html, в Caddy/системном месте |
| R5 | Garden-team в перегрузе → variant (c) сдвигается на месяц+ | c | если приоритет — Ольгин велфер, выбрать (a) |
| R6 | Двойной деплой при правке shared-компонента | b | вынести shadcn/ui в общий packages/ui workspace **или** дублировать (меньше зла на стартe) |
| R7 | Бандл `dist/` подрастает при варианте (a) | a | lazy `import('./components/admin/...')` обеспечивает, что без визита на /admin chunk не грузится |

---

## 8. Рекомендация

**Variant (a) admin-bundle в meetings, lazy-loaded, reuse garden-auth.**

Обоснование:
- **Самый короткий путь к работающей админке для Ольги** (1.5-2 дня против 3-5 для других вариантов).
- **Никаких инфра-изменений** (DNS, Caddy, отдельный CI) — критично, потому что у meetings-репо deploy = FTP, инфра-движения дорогие.
- **Зависимость от Garden-team минимальна** — только 1 migration (ANOM-004), которая в любом случае нужна.
- **Архитектурная чистота сохраняется на 80%** — admin-код в отдельном каталоге, отдельном lazy-chunk, никогда не загружается публичными юзерами.

Variant (b) — стоит выбирать только если стратег приоритезирует **физическую изоляцию** read-only-домена от admin-домена (например, для compliance / для аудита: «meetings.skrebeyko.ru гарантированно никогда не запускает admin-код»). Это сильное гарантированное свойство, и оно стоит +1 дня инфра-работы.

Variant (c) — стратегически идеальный, но **только когда Garden-team готова**. Если сейчас они в другом таске — Ольга получит админку через спринт, а не через 2 дня. Variant (a) можно рассматривать как «временное решение, пока (c) не реализован» — миграция в Garden позже не сильно дороже, чем сразу делать (c), потому что admin-код в meetings будет сравнительно небольшой (~600-700 строк вместо 1720 без EventsAdmin/InstagramExport).

### Порядок apply (для (a))

0. **(Garden-side)** Migration ANOM-004 — закрыть permissive RLS на notebooks/questions/cities + storage.objects/notebook-images. Smoke: `POST /notebooks` под applicant-JWT → 401/42501; под admin-JWT → 201.
1. **(meetings-side)** Создать ветку `feat/nb-restore-admin-jwt`.
2. Восстановить `src/lib/postgrest.ts` (с Bearer).
3. Восстановить `src/components/admin/{NotebooksAdmin,QuestionsAdmin,CitiesAdmin,AdminPanel}.tsx` из `c4acd8a` (без EventsAdmin/InstagramExport) — `git show c4acd8a^:src/components/admin/NotebooksAdmin.tsx > src/components/admin/NotebooksAdmin.tsx` и т.д.
4. Заменить PIN-форму в `AdminView.tsx` на email+password → `auth.skrebeyko.ru/auth/login` → JWT в localStorage.
5. Переключить `NotebooksAdmin` на Supabase Storage upload вместо base64.
6. Lazy-import в `App.tsx`/`Index.tsx`: `const AdminView = lazy(() => import('@/components/AdminView'))`, маршрут `/admin` обёрнут в `<Suspense>`.
7. Build + smoke (admin / read-only public). Замерить bundle до/после — публичный chunk не должен вырасти.
8. PR → review → merge → FTP deploy → smoke на проде.

### Acceptance criteria (общие)

- [ ] Ольга может через UI создать новый блокнот, вопрос, город.
- [ ] **Не-admin** Garden-юзер (например, тестовый applicant) пытается POST `/notebooks` — получает 42501.
- [ ] Анонимный POST `/notebooks` — 401 (как сейчас).
- [ ] Публичный фронт `meetings.skrebeyko.ru` грузит чистый bundle без admin-кода (DevTools Network проверка).
- [ ] `dist/` публичного chunk'а не вырос значительно.
- [ ] PIN-коды 0000/1111 нигде в репо/бандле не появились.

---

## 9. Открытые вопросы (для стратега)

1. **ANOM-004 — кто и когда:** делаем фикс в meetings-репо как «pre-requirement of NB-RESTORE» (привязываем к Garden-стратегу) или ждём, пока Garden-стратег сделает по своему бэклогу? Без него (a)/(b)/(c) не безопасны.
2. **Storage refactor (base64 → URL для notebook.image_url):** входит ли в скоп NB-RESTORE или отдельным таском (AUDIT P2-3)? Логично сделать сразу, раз правим эту форму.
3. **Variant выбора:** (a) для скорости, (b) для compliance, (c) для архитектурной чистоты — какой приоритет?
4. **Кто будет в роли `admin` для meetings-write?** Только Ольга (по `profiles.role = 'admin'` в Саду)? Или ещё кто-то? Это влияет на acceptance test «не-admin не пишет».
5. **`questions.DELETE by text` баг:** чинить в этой же правке (`id=eq.<n>` вместо `question=eq.<text>`) или отдельный таск?

---

## Источники

- meetings:
  - [SEC_PINS_2026-05-05.md](SEC_PINS_2026-05-05.md), [NB_RESTORE_PLAN.md](NB_RESTORE_PLAN.md), [ARCH_CHECK_meetings_admin_2026-05-05.md](ARCH_CHECK_meetings_admin_2026-05-05.md), [AUDIT_meetings_2026-05-05.md](AUDIT_meetings_2026-05-05.md)
  - git: `c4acd8a` (removal), `f87dcee` (merge), 2026-05-05
  - [supabase_meetings/20251123…sql](../supabase_meetings/20251123221523_1e9348bf-f176-46f4-b0cd-3626dcf1ca18.sql) — initial schema + permissive RLS
  - [supabase_meetings/20251129…sql](../supabase_meetings/20251129054537_8fae6829-3969-49ed-94d3-4bfea6bc3abf.sql) — storage buckets
  - [src/pages/Index.tsx](../src/pages/Index.tsx) — current public read-only flow
- garden:
  - [services/dataService.js:8-118, 1235-1256](../../../garden_claude/garden/services/dataService.js) — auth/postgrest/auth wiring
  - [services/jwtUtils.js](../../../garden_claude/garden/services/jwtUtils.js) — JWT decode
  - [migrations/2026-05-04_phase18…sql](../../../garden_claude/garden/migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql) — anon-read контракт
  - [migrations/2026-05-03_phase16…sql](../../../garden_claude/garden/migrations/2026-05-03_phase16_grant_role_switch_bulk.sql), [phase23](../../../garden_claude/garden/migrations/2026-05-05_phase23_grants_safety_net.sql) — authenticated GRANT'ы
- live (curl 2026-05-24):
  - `api.skrebeyko.ru` — counts + samples
  - `auth.skrebeyko.ru` — CORS preflight OK from meetings origin
