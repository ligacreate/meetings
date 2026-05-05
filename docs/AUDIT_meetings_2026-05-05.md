# AUDIT-001 — code review репо meetings

**Дата:** 2026-05-05
**Репо:** meetings (meetings.skrebeyko.ru), `main` @ `080306f`
**Скоуп:** code-review-grade. Не пен-тест. Findings описываются — **не фиксим в этой сессии**.
**Артефакт стратегу:** все P0/P1 пункты — отдельные таски в `garden/plans/BACKLOG.md`.

---

## TL;DR — приоритеты

1. **P0-1 (хардкоженные PIN-коды `0000` / `1111` в публичном бандле)** — единственный реальный P0. Любой может открыть `/admin`. Реального ущерба от **записи** нет (см. ниже про P0-2 → P2), но UI и кнопки админки видны посетителю.
2. **P1-1 (ReferenceError при клике «Сбросить»)** — `setShowAllCities(false)` вызывается, переменной нет → runtime exception ловит ErrorBoundary, страница падает.
3. **P1-2 (XSS в href)** — `<a href={event.registration_link}>` без проверки схемы. `javascript:...` в БД → исполнение в браузере. Та же проблема ждёт `host_telegram/host_vk` после этапа 4.
4. **P1-3 (17 уязвимостей в зависимостях)** — `npm audit`: 9 high + 8 moderate. Большая часть — dev/build, но React Router XSS via Open Redirects (high) — runtime-зависимость.

**Блокеров для FEAT-002 этапа 4 строго формально нет**: добавление кнопок — локальное изменение, не пересекается ни с одним из P0/P1 кроме P1-2 (XSS в href), который **появится и для новых полей**, поэтому фикс P1-2 разумно сделать **в одном PR** с этапом 4 (или непосредственно перед).

**Изменение severity (2026-05-05, после уточнения у стратега):** изначальный P0-2 «анонимный write в PostgREST из браузера» был выводом из кода (фронт вызывает POST/PATCH/DELETE без JWT), без верификации GRANT'ов в БД. Стратег подтвердил, что после Garden phase 18 `web_anon` имеет только `GRANT SELECT` на `events/cities/notebooks/questions`. Реальной дыры нет — БД блокирует. Понижено до **P2-8** (мёртвый admin-write код в meetings).

---

## Severity-сводка

| Severity | Count |
|---|---|
| P0 | 1 |
| P1 | 6 |
| P2 | 8 |
| P3 | 5 |

---

## P0 — критично

### P0-1. Хардкоженные PIN-коды админки в публичном бандле — план готов
> **Update 2026-05-05:** план фикса оформлен в [SEC_PINS_2026-05-05.md](SEC_PINS_2026-05-05.md) — Variant A (полный выпил админки). Решение зафиксировано стратегом после verification 2026-05-05. Apply — отдельный таск, не блокер FEAT-002 этап 4.
- **Severity:** P0
- **Файл:** [src/data/initialData.ts:29-33](src/data/initialData.ts#L29-L33)
- **Проблема:** `PINS = { ADMIN: '0000', HOST: '1111' }` импортируются в [src/components/AdminView.tsx:5](src/components/AdminView.tsx#L5), сравниваются клиент-сайд. После `vite build` строки `0000`/`1111` попадают в `dist/assets/*.js` и доступны любому на `meetings.skrebeyko.ru`. Маршрут `/admin` достижим напрямую (`HashRouter`, [src/App.tsx:35](src/App.tsx#L35) + [public/admin/index.html](public/admin/index.html) делает редирект).
- **Что значит на практике:** любой с этими 4 цифрами получает UI-доступ к созданию/удалению/правке events, cities, notebooks, questions. Реальные writes, конечно, ограничивает PostgREST (см. P0-2), но если там тоже дыра — write-уровень полностью открыт.
- **TODO в коде уже есть** (line 29: «Replace with Telegram Auth before public launch») — значит, осознанный долг.
- **Предложение фикса (не выполнять):** убрать клиентскую авторизацию целиком. Либо (1) спрятать `/admin` за server-side проверкой (Caddy basic auth + IP allowlist) и держать запись через сервисный JWT, (2) вынести админку в Garden (там уже есть Telegram Auth), либо (3) сделать сепаратный admin-фронт под `admin.meetings.skrebeyko.ru` за VPN.

### ~~P0-2.~~ → понижено до P2-8 (см. ниже)
Изначально классифицировал как P0 на основании одного только кода (фронт делает POST/PATCH/DELETE без JWT). После уточнения у стратега 2026-05-05: после Garden phase 18 `web_anon` имеет только `GRANT SELECT` — БД отбивает write на уровне ролей. Реальной дыры нет, но мёртвый admin-write путь в meetings остаётся как тех-долг (см. **P2-8** ниже).

---

## P1 — высокий приоритет

### P1-1. ReferenceError: `setShowAllCities is not defined`
- **Severity:** P1 (баг, ломающий UI)
- **Файл:** [src/components/EventsView.tsx:369](src/components/EventsView.tsx#L369)
- **Проблема:** в обработчике клика «Сбросить» вызывается `setShowAllCities(false)`, но соответствующего `useState` в этом компоненте **нет** (ни `showAllCities`, ни `setShowAllCities` нигде не объявлены — `grep -RIn 'showAllCities' src` возвращает только эту одну строку).
- **Что значит:** при клике пользователь получает `ReferenceError`, попадает в `ErrorBoundary` ([src/components/ErrorBoundary.tsx](src/components/ErrorBoundary.tsx)) → страница «Что-то пошло не так».
- Не словлено: ESLint конфиг ([eslint.config.js:23](eslint.config.js#L23)) отключает `@typescript-eslint/no-unused-vars`, но это другая правила; правило `no-undef` обычно работает — возможно, `globals.browser` его глушит.
- **Предложение фикса:** убрать вызов `setShowAllCities(false)` (строка 369) — в коде нет соответствующего state и UI «показать все города» в этом компоненте. Может быть остаток от рефакторинга.

### P1-2. Открытый редирект / XSS через `<a href>` для пользовательских URL
- **Severity:** P1
- **Файлы:**
  - [src/components/EventsView.tsx:498-505](src/components/EventsView.tsx#L498-L505) — `event.registration_link`
  - [src/components/NotebooksView.tsx:11-14](src/components/NotebooksView.tsx#L11-L14) — `notebook.pdf_url` через `window.open(url)`
- **Проблема:** значения берутся из БД (контролируемых через админку без валидации схемы) и подставляются в `href` / `window.open` без фильтра `^https?://`. Достаточно одного админа с PIN `0000` (см. P0-1), чтобы записать `javascript:fetch('/admin'+document.cookie+...)` в `registration_link` → исполнение у каждого посетителя.
- **Связь с этапом 4:** новые поля `host_telegram` / `host_vk` будут той же проблемой — добавляем теперь whitelist схемы в одном месте.
- **Предложение фикса:**
  ```ts
  const safeHref = (url?: string) => {
    if (!url) return undefined;
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? url : undefined; }
    catch { return undefined; }
  };
  ```
  и `<a href={safeHref(event.registration_link)}>`.

### P1-3. 17 уязвимостей в зависимостях (`npm audit`)
- **Severity:** P1 (mostly build-time / dev-server)
- **Команда:** `npm audit` (выполнено локально). Сводка: 8 moderate, 9 high.
- **Самое заметное:**
  - `@remix-run/router` ≤1.23.1 (high) → React Router XSS via Open Redirects. **Runtime-зависимость**, фронт пользователей. Через `react-router-dom@^6.30.1`.
  - `esbuild` ≤0.24.2 (moderate) → dev-server позволяет любому сайту отправлять запросы к `vite dev`. Только при разработке.
  - `rollup` 4.x (high) → arbitrary file write via path traversal. Build-time.
  - `lodash`, `flatted`, `glob`, `minimatch`, `picomatch`, `js-yaml`, `ajv`, `brace-expansion`, `postcss`, `protocol-buffers-schema`, `yaml` — транзитивные.
- **Предложение фикса:** `npm audit fix` (без `--force`) — поднимет patch-версии, рискнём `react-router-dom` 6.30.1 → 6.30.2+ или 7.x. Перед prod — прогнать сборку и тыкнуть руками.

### P1-4. Дубль PostgREST-клиента
- **Severity:** P1 (тех-долг, расхождение поведения)
- **Файлы:** [src/lib/postgrest.ts](src/lib/postgrest.ts) (используется в админке), [src/pages/Index.tsx:28-53](src/pages/Index.tsx#L28-L53) (inline-копия для read).
- **Проблема:** две независимые реализации с разной обработкой ошибок и без таймаутов в shared-версии. Когда понадобится добавить JWT/retry/трейсинг — придётся менять оба.
- **Предложение фикса:** `Index.tsx` должен использовать `lib/postgrest.ts`, добавить туда поддержку `count=exact` и опциональный таймаут.

### P1-5. Mapbox token руками от пользователя в UI
- **Severity:** P1 (UX-катастрофа + privacy)
- **Файл:** [src/components/MapView.tsx:168-200](src/components/MapView.tsx#L168-L200)
- **Проблема:** пользователю предлагается **самому** ввести Mapbox-токен (`pk.eyJ1...`), который потом живёт в локальном state. Это нерабочий продукт-сценарий: посетитель сайта своих токенов не имеет. Кроме того, любой токен, введённый и забытый в форму, можно увести через расширения / extensions. Также: `mapboxgl` — большая библиотека, тащится в бандл, хотя реально не используется.
- **Предложение фикса:** либо убрать MapView совсем (не виден в текущем UI: переход через `setShowMap(true)` в EventsView только декларирован, но кнопки «карта» в JSX я не нашёл — см. P2-2), либо вынести токен в `VITE_MAPBOX_TOKEN` env, либо заменить на `react-leaflet` + OSM (бесплатно).

### P1-6. Toast-only error handling без observability
- **Severity:** P1 (operational)
- **Файлы:** [src/pages/Index.tsx:286-311](src/pages/Index.tsx#L286-L311), все админ-формы.
- **Проблема:** все ошибки (фетч, save, delete) уходят в `console.error` + `toast.destructive`. Sentry / Yandex Metrika `goal()` для ошибок не используются. Если PostgREST упал — мы узнаем только из тостов пользователей.
- **Предложение фикса:** подключить Sentry (фронт-frontend free tier) или хотя бы вызывать `ym('reachGoal', 'fetch_error')` в catch-блоках — Yandex.Metrika уже встроена ([index.html:18-27](index.html#L18-L27)).

---

## P2 — средний приоритет

### P2-1. Шумные `console.log/warn/error` в проде
- **Severity:** P2
- **Кол-во:** 22 вызова `console.*` в `src/` (`grep -RIn 'console\.'`)
- **Файлы:** Index.tsx, EventsAdmin.tsx, NotebooksAdmin.tsx, ErrorBoundary.tsx, MapView.tsx и др.
- **Предложение фикса:** добавить vite-плагин `vite-plugin-remove-console` либо логи завернуть в `if (import.meta.env.DEV)`.

### P2-2. Мёртвый/полу-мёртвый код
- **Severity:** P2
- **Места:**
  - **MapView недостижим из UI.** В [EventsView.tsx:75](src/components/EventsView.tsx#L75) объявлен `const [showMap, setShowMap] = useState(false)`, но `setShowMap(true)` в JSX не вызывается — кнопки переключения карты в коде нет. Сам компонент `MapView` импортирован в [строке 4](src/components/EventsView.tsx#L4) и условно рендерится (строки 205-207). По факту — dead branch.
  - **`src/components/ui/use-toast.ts`** — реэкспорт `@/hooks/use-toast` (одну строку). Можно удалить.
  - **`src/data/initialData.ts:25,27`** — `INITIAL_NOTEBOOKS = []`, `INITIAL_JOURNAL_ENTRIES = []`, `INITIAL_QUESTIONS` — нигде не используются (всё грузится из PostgREST). Только `PINS` живой.
  - **`@tanstack/react-query`** установлен и обёрнут в `QueryClientProvider` ([App.tsx:10,27](src/App.tsx#L10)), но **ни одного `useQuery` в проекте**. Можно либо переписать фетчинг на RQ (правильнее), либо выпилить зависимость и провайдер.
  - 50 файлов `src/components/ui/`, реально используются 19 (по grep). Остальные 31 — навигация, sheet, drawer, calendar, accordion, breadcrumb, carousel, chart, … — наследие shadcn-init. Это не баг, но раздувает поиск/подсказки и потенциально бандл (tree-shaking shadcn хороший, но `chart.tsx` тащит recharts).
- **Предложение фикса:** покомпонентно вычистить unused UI и `INITIAL_*` константы; решить судьбу MapView и react-query.

### P2-3. Вся админка делает прямые вызовы в БД из браузера
- **Severity:** P2 (см. P0-2)
- **Файлы:** [src/components/admin/EventsAdmin.tsx](src/components/admin/EventsAdmin.tsx), CitiesAdmin.tsx, NotebooksAdmin.tsx, QuestionsAdmin.tsx
- **Проблема:** image_url хранится в БД как **base64** (compressImage в [imageUtils.ts](src/lib/imageUtils.ts) делает `toDataURL('image/jpeg')`). При INSERT/PATCH events это улетает в Postgres как огромная строка. Это и причина бага в [Index.tsx:209-210](src/pages/Index.tsx#L209-L210), где из кеша принудительно вырезается `image_url` чтобы не попасть в `QuotaExceededError` localStorage.
- **Предложение фикса:** вынести изображения в storage (S3/Yandex Object Storage), хранить URL.

### P2-4. Нет CSP / Security headers
- **Severity:** P2
- **Файл:** [public/.htaccess](public/.htaccess) — только rewrite, ноль security-headers (`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- **Предложение фикса:** добавить базовый CSP в `.htaccess` или (лучше) на уровне Caddy/Nginx с whitelist для `api.skrebeyko.ru`, `mc.yandex.ru`, `fonts.googleapis.com`, `mapbox.com`.

### P2-5. FTP-деплой `dangerous-clean-slate: true`
- **Severity:** P2
- **Файл:** [.github/workflows/deploy.yml:32](.github/workflows/deploy.yml#L32)
- **Проблема:** деплой через FTP с `dangerous-clean-slate: true` стирает всё на сервере перед загрузкой. Если упадёт mid-deploy — сайт лежит. Атомарного rollback нет, версии не хранятся.
- **Предложение фикса:** перейти на `rsync` через SSH с symlink-switch, либо на любой нормальный CDN/static host (Cloudflare Pages, Yandex Cloud Static, Vercel) — у проекта нет SSR, отлично подходит.

### P2-6. `image_url` в БД как base64 — проблема производительности
- **Severity:** P2
- **Файл:** [src/lib/imageUtils.ts](src/lib/imageUtils.ts) + EventsAdmin
- **Проблема:** при ~155 событиях с фото 1600px JPEG q=0.9 ≈ 200-400KB base64 каждое → ~50MB ответ от PostgREST на `?select=...,image_url`. Загрузка > 5 секунд на медленных сетях. Это видно в коде: `loadFromCache()` явно убирает `image_url` ([Index.tsx:209](src/pages/Index.tsx#L209)) ради квоты localStorage.
- **Связь с P2-3.**

### P2-8. Мёртвый admin-write путь в meetings (бывший P0-2) — ВЕРИФИЦИРОВАНО
- **Severity:** P2 (тех-долг). После verification 2026-05-05 — переходит в scope SEC-PINS Variant A.
- **Файлы:** [src/lib/postgrest.ts](src/lib/postgrest.ts), [src/components/admin/*.tsx](src/components/admin/)
- **Проблема:** админка meetings вызывает PostgREST с POST/PATCH/DELETE без JWT. После phase 18 в Garden `web_anon` = SELECT only → все эти запросы возвращают 401/403.
- **Verification 2026-05-05 (Chrome smoke-runner):** `POST /notebooks` без JWT → 503/401 + PostgREST `42501 permission denied for table notebooks`. Подтверждено: запись не создаётся, гипотеза «мёртвый код» верна для всех 13 write-вызовов.
- **Решение:** полный выпил админки (Variant A). См. [SEC_PINS_2026-05-05.md](SEC_PINS_2026-05-05.md). Восстановление функциональности (Notebooks/Questions/Cities Admin) — отдельный таск **NB-RESTORE** ([NB_RESTORE_PLAN.md](NB_RESTORE_PLAN.md), P1, после FEAT-002 этап 4).

### P2-7. Хардкод координат городов и таблица временных зон
- **Severity:** P2
- **Файлы:** [src/components/MapView.tsx:17-24](src/components/MapView.tsx#L17-L24), [src/lib/dateUtils.ts:19-100](src/lib/dateUtils.ts#L19-L100)
- **Проблема:** список городов и tz / координат живёт в коде и в БД одновременно. При добавлении нового города через админку мапа его не покажет, и время будет fallback'нуть в Москву.
- **Предложение фикса:** хранить `latitude`, `longitude`, `timezone` как поля `cities`-таблицы, читать оттуда.

---

## P3 — низкий приоритет / косметика

### P3-1. `eslint.config.js` отключает `no-unused-vars`
[eslint.config.js:23](eslint.config.js#L23): `"@typescript-eslint/no-unused-vars": "off"`. Стоит включить хотя бы как `warn` — иначе мёртвые переменные не отлавливаются.

### P3-2. Type Safety — `as any` в двух местах
- [src/components/MapView.tsx:30](src/components/MapView.tsx#L30) и далее (mapbox-gl без типов)
- [src/pages/Index.tsx:261-262](src/pages/Index.tsx#L261-L262) (`Promise.race` результат)

### P3-3. Большие компоненты-монолиты
- `EventsAdmin.tsx` — 857 строк
- `EventsView.tsx` — 522 строки
- `Index.tsx` — 378 строк
Нет, бить специально не нужно, но при следующем касании хорошо бы вынести form, card, calendar в подкомпоненты.

### P3-4. Дублированные хелперы
`normalizeDate`, `cityKey`, `cityLabel`, `isOnlineCity` определены отдельно в `EventsView.tsx`, `Index.tsx`, `EventsAdmin.tsx`. Лучше в `lib/eventHelpers.ts`.

### P3-5. SEO/OG неконсистентен
[index.html:7-15](index.html#L7-L15): `<title>` и OG говорят про «Домашнее издательство», meta-description тоже — но проект называется meetings и ведёт календарь встреч. Несовпадение бренда.

---

## Связь с Garden / FEAT-002

### Какие колонки `events` использует фронт сегодня
([Index.tsx:115](src/pages/Index.tsx#L115))
```
id, garden_id, title, description, date, time, city, source_timezone,
location, speaker, category, registration_link, price,
image_gradient, image_url, image_focus_x, image_focus_y, created_at
```

### Готовность принять `host_telegram` / `host_vk`
- ❌ Тип `Event` ([src/types/index.ts](src/types/index.ts)) — нужны поля.
- ❌ `?select=` в `fetchAllEvents` — нужно добавить.
- ❌ Кеш `v3` → `v4` — иначе старые клиенты будут с пустыми полями неделю.
- ✅ Фетчинг и пагинация — без изменений.
- ✅ `lucide-react` — для TG-иконки годится `MessageCircle`; для VK нужен inline-SVG.
- ⚠️ P1-2 (XSS в href) — **нужно фиксить вместе с этапом 4**, иначе плодим уязвимость на новых полях.

### Блокеры для FEAT-002 этап 4
**Жёстких блокеров нет.** Этап 4 сам по себе локальный (карточка + select-строка + bump кеша). Но рекомендуется:
1. **Перед** этапом 4 — починить P1-1 (`setShowAllCities`), это 1 строка.
2. **Внутри** этапа 4 — добавить хелпер `safeHref` с whitelist схем (`https://t.me/`, `https://vk.me/`, `https://vk.com/write/`) и применить к **обеим** новым ссылкам **и** к существующему `registration_link` (silent skip — кнопка не рендерится при невалидном URL).
3. **После** этапа 4 (отдельные таски) — P0-1 (PIN, отдельный документ [SEC_PINS_2026-05-05.md](SEC_PINS_2026-05-05.md)), P2-8 (удаление мёртвой админки, в связке с P0-1), P1-3 (npm audit fix).

---

## Что осталось за скоупом этой сессии

- Penetration-test (XSS payloads, CSRF, IDOR на PostgREST) — нужен отдельный заход.
- Анализ битого VS живого state в `web_anon` ролях БД — на стороне Garden/PostgREST.
- Bundle-анализ (`vite build` + `rollup-plugin-visualizer`) — отложен, не делал чтобы не модифицировать репо.
- Lighthouse / PageSpeed — отложен.
- Real e2e в браузере — отложен (нет тестовой инфраструктуры).
