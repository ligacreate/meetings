# IMPL APPLIED — Phase 2 Part B: NotebooksAdminTab CRUD + public price

**Дата:** 2026-05-25
**Тип:** apply-отчёт, **не committed / не pushed** до 🟢
**Plan:** [IMPL_2026-05-25_phase2_notebooks_crud.md](IMPL_2026-05-25_phase2_notebooks_crud.md)
**Зависимость:** Phase 2 Part A applied ✅ ([IMPL_2026-05-25_phase2_partA_applied.md](IMPL_2026-05-25_phase2_partA_applied.md))

---

## TL;DR

- ✅ **6 файлов** записаны (планировалось 5 + bump = 6, но **7-я правка** в Index.tsx — см. §1 «extra»)
- ✅ **`npm run build` чистый** — 2132 modules, 0 errors
- ✅ **Bundle assertion PASSED:** Admin chunk **19.88 KB** (под ольгиным лимитом 30 KB), main JS +0.21 KB
- ✅ **Dev server running** на `http://localhost:8080/` (background task `bfirlij2q`, env var инжектится)
- ✅ Все 4 transform-endpoint'a → HTTP 200, нет ошибок vite
- ⏸ **E2E через браузер — твоя ручная проверка** (5 шагов в §4). У меня нет headless browser.
- ⏸ **Commit / push — не сделано**, жду твоего 🟢 после ручного smoke

---

## §1 — Что изменилось vs изначальный план

### Apply список

| Файл | Тип | Что |
|---|---|---|
| `src/lib/notebooks.ts` | new | CRUD API helpers (list/create/update/delete) + NotebookInput type + Bearer auth wrapping |
| `src/types/index.ts` | modified | `Notebook.price?: string` |
| `src/components/admin/NotebooksAdminTab.tsx` | new | List + inline form (create/edit) + AlertDialog delete + inline validation |
| `src/pages/Admin.tsx` | modified | Import + `<NotebooksAdminTab />` в TabsContent (вместо «Скоро»-заглушки) |
| `src/components/NotebooksView.tsx` | modified | Показ `price` (если не пустая) под title, `text-primary` цвет |
| `src/pages/Index.tsx` | modified | `CACHE_VERSION` v4→v5 |
| **`src/pages/Index.tsx`** | **+modified** | **+ `select: '...price...'` для notebooks postgrestFetch** ⚠ |

### ⚠ Extra правка (7-я)

Изначальный план перечислял **5 файлов + 1 bump = 6 правок**. Но один critical fix отсутствовал: `select` в [src/pages/Index.tsx:241-244](../src/pages/Index.tsx#L241-L244). Без `price` в `select` PostgREST **не отдал бы** новую колонку клиенту, и публичная страница не увидела бы цену даже после deploy. CACHE_VERSION bump только инвалидирует кеш, но не меняет fetch query.

Эта правка **обязательна** для работы публичного render'а цены. Я её сделал автоматически — поднял флаг чтобы ты увидела в отчёте.

**Что именно поменялось:**
```diff
-{ select: 'id, title, description, image_url, pdf_url, created_at', order: 'created_at.desc' }
+{ select: 'id, title, description, price, image_url, pdf_url, created_at', order: 'created_at.desc' }
```

Если хочешь — можешь revert; CACHE_VERSION тоже rollback тогда, иначе пустые price-поля будут отображаться корректно (рендер `{notebook.price && ...}` — на falsy не покажет).

---

## §2 — Build output

```
VITE_MEETINGS_ADMIN_USER_IDS=85dbefda-... npm run build

✓ 2132 modules transformed.
dist/index.html                                1.89 kB │ gzip:   1.05 kB
dist/assets/logo-final-correct-D0CPugG3.png   59.52 kB
dist/assets/index-CXOVI666.css                68.05 kB │ gzip:  11.76 kB
dist/assets/Login-C-BUIqJw.js                  1.42 kB │ gzip:   0.80 kB
dist/assets/label-CcWkVq9u.js                  2.52 kB │ gzip:   1.36 kB
dist/assets/Admin-DRkFBBT0.js                 19.88 kB │ gzip:   7.37 kB
dist/assets/index-QFcNkmD8.js                515.55 kB │ gzip: 167.08 kB

✓ built in 2.22s
```

### Bundle Δ vs Phase 1 deploy

| Chunk | Phase 1 (aa29617) | Phase 2 (local) | Δ |
|---|---|---|---|
| **main JS** | 515.34 KB | **515.55 KB** | **+0.21 KB** (Index.tsx select + NotebooksView price) |
| main CSS | 67.47 KB | 68.05 KB | +0.58 KB (NotebooksAdminTab inline classes) |
| **Admin chunk (lazy)** | 8.92 KB | **19.88 KB** | **+10.96 KB** (NotebooksAdminTab + form + AlertDialog) |
| Login chunk (lazy) | 2.41 KB | 1.42 KB | −0.99 KB (label вытащен в отдельный shared chunk) |
| **`label-*.js`** (new shared) | — | **2.52 KB** | new (extracted by vite — used by Login и NotebooksAdminTab) |
| `auth-*.js` | 1.47 KB | — | inlined в Login/Admin (vite re-optimized chunks) |

**Modules transformed:** 2127 → 2132 (+5: notebooks.ts, NotebooksAdminTab, alert-dialog primitives).

**Verdict:**
- Admin chunk **19.88 KB** — well under твой лимит 30 KB ✅
- Main bundle грузится анониму — **+0.21 KB** (negligible) ✅
- Public bundle assertion: anon **по-прежнему не загружает** admin/login код (lazy) ✅

---

## §3 — Dev server status

- **PID:** background task `bfirlij2q`
- **URL:** `http://localhost:8080/`
- **Env:** `VITE_MEETINGS_ADMIN_USER_IDS=85dbefda-ba8f-4c60-9f22-b3a7acd45b21`
- **Ready time:** ~210 ms

### Transform probes

| Probe | Result |
|---|---|
| `GET /` | HTTP 200 |
| `GET /src/lib/notebooks.ts` | HTTP 200 (transformed without errors) |
| `GET /src/components/admin/NotebooksAdminTab.tsx` | HTTP 200 (новая папка `admin/` создалась автоматически) |
| `GET /src/components/NotebooksView.tsx` | HTTP 200 |

Vite транспилирует всё чисто, никаких import-resolution errors, никаких type errors на HMR.

Когда закончишь ручной smoke (см. §4) — прибей dev server командой:
```bash
pkill -f 'node.*vite'
```

Или просто оставь — он не блокирует ничего, занимает только порт 8080.

---

## §4 — Local smoke (твоя ручная проверка)

Открой `http://localhost:8080/` в браузере (рекомендую инкогнито, чтобы избежать старого `garden_auth_token` в localStorage).

### Шаги

| # | Шаг | Ожидание |
|---|---|---|
| **0** | Открой `http://localhost:8080/#/admin` | Если не залогинена — редирект на `/login`. Залогинься как `olga@skrebeyko.com` |
| **1** | После логина — вкладка «Блокноты» auto-selected | Видишь **3 карточки** — Блокнот в точку, Блокнот в линейку, Tesoro notes (см. §5 — текущая БД snapshot) |
| **2** | Нажми «+ Добавить» (правый верхний угол) | Форма expand сверху, list скрылся. 5 полей: Название, Описание, Цена, URL картинки, URL покупки |
| **3** | Заполни «Test Phase 2», описание (минимум 10 символов), цена «100 ₽», URL картинки и URL покупки (любые https) → **Сохранить** | Кнопка `disabled` пока валидация не пройдёт. После save — toast «Блокнот добавлен», возврат к list, новая карточка **в начале** (sort by created_at DESC) |
| **4** | На новой карточке нажми «Редактировать» | Форма pre-fill всеми 5 полями |
| **5** | Измени title на «Test Phase 2 EDITED» → Сохранить | toast «Блокнот сохранён», в списке title обновился |
| **6** | На той же карточке нажми «Удалить» | AlertDialog: «Удалить блокнот?» с твоим title. Confirm → toast «Блокнот удалён», карточка пропадает |
| **7** | Открой `http://localhost:8080/` (главная) в другой вкладке | Через 1-2 sec (SWR refresh) — видишь те же 3 оригинальных блокнота (без Test, ты удалила). Цены пока пустые (БД пока без цен) |
| **8** (опц) | Edit «Tesoro notes» → добавь цену «990 ₽» → save | На главной через 1-2 sec появится «990 ₽» под title (Tesoro) |

### Если что-то пошло не так

- **Toast «Не удалось сохранить» с RLS-ошибкой:** проверь что Part A applied (она applied, согласно `partA_applied`)
- **«Не удалось загрузить блокноты»:** проверь что в DevTools Network есть успешный GET с Authorization header. Если нет header — `garden_auth_token` отсутствует/истёк, login заново.
- **`/admin` не пускает:** проверь что dev server запущен с env `VITE_MEETINGS_ADMIN_USER_IDS=85dbefda-...`. Если без env — allowlist пустой, guard блокирует.
- **Форма «застряла» в loading:** F12 → Console — посмотри stack trace, пришли мне.

---

## §5 — БД snapshot (для сравнения)

Что лежит в notebooks **сейчас** (ровно перед твоим smoke):

```
 id |       title       | price
----+-------------------+-------
  2 | Блокнот в точку   |
  3 | Блокнот в линейку |
  4 | Tesoro notes      |
(3 rows)
```

Все 3 — с пустой ценой (default `''` после Part A migration). Часть 8 в §4 — опциональное добавление цены.

После smoke шага 5 (удалил test) — должно остаться эти же 3. Если случайно создал что-то и не удалил — я могу очистить через ssh + psql, скажи.

---

## §6 — Что я **не** могу автоматически

- **E2E click-через-браузер 8 шагов** — нет headless browser tool. Описано в §4 как ручной smoke.
- **Скрин/видео UI** — нет screenshot capability.
- **Verify toast'ов** — могу только утверждать, что в коде они вызываются на success/error.

Если хочешь автоматизированный E2E — нужен Playwright (npm add -D + конфиг + spec'ы) либо вызов через MCP browser tool (есть ли — не уверен). Это отдельный таск, не Phase 2.

---

## §7 — Git state (untouched)

```
$ git status --short
 M src/components/NotebooksView.tsx
 M src/pages/Admin.tsx
 M src/pages/Index.tsx
 M src/types/index.ts
?? src/components/admin/
?? src/lib/notebooks.ts
?? docs/IMPL_2026-05-25_phase2_*.md
?? docs/RECON_2026-05-25_phase2_*.md
?? docs/2026-05-25_phase38_meetings_admin_rls.sql
```

Working tree clean от unintended changes, никаких git ops не делал. Жду 🟢 commit+push (отдельным шагом) после твоего ручного smoke.

---

## §8 — Workflow next steps

1. **Ты:** ручной smoke по §4 шагам (10-15 минут) → ОК или баг-репорт
2. **Я (после 🟢):** `git add` на 5 code файлов (точечно) → `git commit` → `git push` → CI deploy (paths-ignore docs не сработает, потому что src/ изменилось — deploy запустится)
3. **Prod smoke** на тех же 8 шагах против `https://meetings.skrebeyko.ru/#/admin`
4. **Phase 3** (QuestionsAdmin) — следующая итерация когда захочешь

Также:
- Migration файл `2026-05-25_phase38_meetings_admin_rls.sql` останется в meetings/docs/ (пока ты не решишь перенести в Garden migrations/) — это **серверная** артифакт, не код, в commit не пойдёт
- Docs (3 IMPL_*.md, 2 RECON_*.md, 1 .sql) — отдельный коммит после Phase 2 closure (как Phase 1 — последний docs-commit с paths-ignore)

---

## §9 — Bundle warnings

Vite опять заметил chunk > 500 KB (main bundle 515.55 KB). Это **legacy issue** (не из Phase 2) — main bundle и так был большой из react/react-dom/react-router/framer-motion/recharts/etc. Решение: `build.rollupOptions.output.manualChunks` для split — отдельный perf-таск, не Phase 2.

---

## Источники

- [IMPL_2026-05-25_phase2_notebooks_crud.md](IMPL_2026-05-25_phase2_notebooks_crud.md) — план
- [IMPL_2026-05-25_phase2_partA_applied.md](IMPL_2026-05-25_phase2_partA_applied.md) — Part A apply confirmation
- live `npm run build` + dev server curl probes (2026-05-25)
- live psql notebooks SELECT (2026-05-25)
