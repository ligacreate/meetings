# ARCH_CHECK — meetings/admin vs Garden, дублирование функций

**Дата:** 2026-05-05
**Цель:** до правки SEC_PINS (гибридный план) — точно понять, что в meetings/admin дублируется в Garden, а что нет.
**Метод:** static-анализ кода обоих репо. БД не дёргал, curl не делал.
**Источники:**
- meetings: [src/components/admin/](../src/components/admin/)
- garden: [/Users/user/vibecoding/garden_claude/garden/](file:///Users/user/vibecoding/garden_claude/garden/) — `services/dataService.js`, `views/AdminPanel.jsx`, `views/MeetingsView.jsx`, `migrations/2026-05-04_phase18_meetings_anon_read_revoke_events_writes.sql`

---

## TL;DR

| meetings-компонент | строк | дубль в Garden? | путь в Garden | вердикт |
|---|---|---|---|---|
| **EventsAdmin** | 857 | **частично** | `views/AdminPanel.jsx:482,932,1117` (PATCH/DELETE), `views/MeetingsView.jsx` + `services/dataService.js:1737-1894` (POST/PATCH/DELETE через таблицу `meetings` → trigger в events) | дубль PATCH/DELETE, **POST events напрямую — уникален, но не работает** (см. ниже) |
| **CitiesAdmin** | 105 | **нет** | — | единственное место |
| **NotebooksAdmin** | 277 | **нет** | — (только legacy migration script) | единственное место |
| **QuestionsAdmin** | 191 | **нет** | — (только legacy migration script) | единственное место |
| **InstagramExport** | 186 | **нет** (Garden такого не делает), но это локальный канвас + html-to-image, не бд | n/a — клиент-сайд PNG-генератор | **удаляется (по решению Ольги)** |
| **AdminView** + **AdminPanel** | 141 + 104 | — | оборачивает остальное | каркас, без него остальные не работают |

**Итог по гибридному плану:**
- **Удалить:** `InstagramExport.tsx` (точно), плюс **EventsAdmin.tsx** (см. оговорку ниже).
- **Оставить:** `CitiesAdmin.tsx`, `NotebooksAdmin.tsx`, `QuestionsAdmin.tsx` + каркас (`AdminView`, `AdminPanel`).

---

## ⚠️ Критическая контекстная находка (перед SEC_PINS)

**Утверждение Ольги:** «NotebooksAdmin и QuestionsAdmin — живые инструменты, я ими пользуюсь.»
**Что показывает код:** все три admin-компонента (Notebooks, Questions, Cities) делают POST/PATCH/DELETE через **анонимный** PostgREST-fetch (без JWT). После Garden phase 18 (2026-05-04) роль `web_anon` имеет только GRANT SELECT. → **POST/PATCH/DELETE должны возвращать 42501 «permission denied».**

В phase 18-миграции прямо записано:
> «writes на cities/notebooks/questions от authenticated — отдельный таск ANOM-004 (нужна разведка: кто и что туда пишет)»

То есть «authenticated»-роль writes на эти таблицы **возможно** ещё открыты, но meetings/admin **не аутентифицируется** — JWT не передаётся.

**Гипотеза:** «живые инструменты» Ольги работали **до** SEC-001 / phase 18 (когда PostgREST не свитчил роль), а после 2026-05-04 — должны были сломаться. Возможно Ольга последний раз правила тетради/вопросы до субботы и не заметила, что флоу теперь падает с тостом «Не удалось сохранить».

**Что нужно от Ольги перед финализацией SEC_PINS:** одна минута проверки в браузере прямо сейчас:
1. Зайти на `meetings.skrebeyko.ru/#/admin` → PIN `0000`.
2. Вкладка «Блокноты» → «Добавить блокнот» → DevTools → Network → нажать «Создать».
3. Что в ответе на `POST /notebooks`? Если 401/403 — гипотеза подтверждена, инструменты не работают, **спокойно выпиливаются вместе со всеми остальными**. Если 201 — значит `web_anon` имеет writes на notebooks/questions/cities (тогда план гибрида валидный, но это **отдельный P0 для Garden**: web_anon не должна писать).

Это блокирует финализацию SEC_PINS — без этой верификации план «оставить NotebooksAdmin/QuestionsAdmin/CitiesAdmin» построен на песке.

---

## Подробно по компонентам

### EventsAdmin (meetings → 857 строк)

**Что делает:**
- POST events (создание) — [EventsAdmin.tsx:280](../src/components/admin/EventsAdmin.tsx#L280), также POST в `cities` если новый город ([:196](../src/components/admin/EventsAdmin.tsx#L196))
- PATCH events ([:216](../src/components/admin/EventsAdmin.tsx#L216))
- PATCH meetings (sync обратно) ([:249](../src/components/admin/EventsAdmin.tsx#L249))
- DELETE events ([:394](../src/components/admin/EventsAdmin.tsx#L394))

**Что в Garden:**
- Создание событий: **нет прямого INSERT в events**. Garden создаёт meeting в `MeetingsView` (через `dataService.addMeeting`, [dataService.js:1808](file:///Users/user/vibecoding/garden_claude/garden/services/dataService.js)), trigger `sync_meeting_to_event` (упомянут в phase 18 sql:30) автоматически создаёт зеркальный event.
- Редактирование: `AdminPanel.jsx:1117` — `onUpdateEvent` через `dataService.updateEvent` ([dataService.js:1930](file:///Users/user/vibecoding/garden_claude/garden/services/dataService.js)). С двусторонним sync обратно в `meetings` (1948-1979).
- Удаление: `AdminPanel.jsx:932` — `onDeleteEvent` → `dataService.deleteEvent`.

**Вердикт:** PATCH/DELETE — полный дубль Garden. POST events напрямую — **только в meetings**, но это архитектурный анти-паттерн (events — read-replica `meetings`-таблицы), к тому же сейчас не работает (web_anon = SELECT only).

**Рекомендация:** удалить EventsAdmin полностью. Создавать событие = создавать meeting в Garden, всё остальное идёт через Garden's AdminPanel. Это совпадает с твоим решением «админка событий и форма ведущей живут в Garden-фронте» из предыдущей итерации.

### CitiesAdmin (meetings → 105 строк)

**Что делает:**
- POST cities ({name}) — [CitiesAdmin.tsx:30](../src/components/admin/CitiesAdmin.tsx#L30)
- DELETE cities (where name=...) — [CitiesAdmin.tsx:47](../src/components/admin/CitiesAdmin.tsx#L47)

**Что в Garden:** ноль (`grep "'cities'"` в `services/views/components/utils` — пусто). Только в legacy `scripts/legacy/migrate_meetings.js`.

**Вердикт:** **уникален в meetings.** Если cities-таблицу кто-то редактирует — это только здесь. Также неявно используется в EventsAdmin (если автор события вводит «новый город», POST идёт автоматом). После выпиливания EventsAdmin — этот неявный путь умрёт, останется только ручное добавление через CitiesAdmin.

**Рекомендация:** **оставить** (с защитой от хардкоженного PIN).

### NotebooksAdmin (meetings → 277 строк)

**Что делает:**
- POST notebooks — [NotebooksAdmin.tsx:74](../src/components/admin/NotebooksAdmin.tsx#L74)
- PATCH notebooks — [NotebooksAdmin.tsx:53](../src/components/admin/NotebooksAdmin.tsx#L53)
- DELETE notebooks — [NotebooksAdmin.tsx:120](../src/components/admin/NotebooksAdmin.tsx#L120)
- Рендерит публикацию: title, description, image_url (base64), pdf_url

**Что в Garden:** ноль активных. Только в `scripts/legacy/migrate_questions_notebooks.js` (одноразовая миграция данных).

**Вердикт:** **уникален в meetings**, при условии, что Олиа верифицирует работоспособность (см. предупреждение выше).

**Рекомендация:** **оставить** (с защитой от хардкоженного PIN).

### QuestionsAdmin (meetings → 191 строк)

**Что делает:**
- POST questions ({question, order_index}) одиночно — [QuestionsAdmin.tsx:29](../src/components/admin/QuestionsAdmin.tsx#L29)
- POST questions массово (bulk) — [QuestionsAdmin.tsx:66](../src/components/admin/QuestionsAdmin.tsx#L66)
- DELETE questions (where question=...) — [QuestionsAdmin.tsx:86](../src/components/admin/QuestionsAdmin.tsx#L86)

**Что в Garden:** ноль активных. Только в legacy migration.

**Вердикт:** **уникален в meetings**, при условии верификации.

**Особенность:** DELETE по полю `question` (текст вопроса), а не по `id`. Если два вопроса с одинаковым текстом — снесутся оба. Минорный баг, не блокер.

**Рекомендация:** **оставить** (с защитой от хардкоженного PIN).

### InstagramExport (meetings → 186 строк)

**Что делает:** клиент-сайд генератор PNG 1080×1350 для Instagram, через `html-to-image` + `file-saver`. Никаких write-операций в БД.

**Что в Garden:** нет, и не нужно.

**Вердикт:** удаляем по решению Ольги. Бонус: вместе с компонентом уходят зависимости `html-to-image` и `file-saver` из `package.json` — уменьшение бандла + минус 2 транзитивных npm-уязвимости (см. ответ Garden Q-B).

### AdminView + AdminPanel (meetings → 141 + 104 строки)

**Что делает:** PIN-форма (логин клиент-сайд) + табы. Без неё остальные admin-страницы не доступны.

**Вердикт:** оставить как каркас, но **PIN заменить на серверную защиту** (см. SEC_PINS).

---

## Сводка для гибридного плана

**Удаляем (после ревью + верификации Ольгой):**
- `src/components/admin/InstagramExport.tsx` — точно, без условий.
- `src/components/admin/EventsAdmin.tsx` — рекомендую: дублируется Garden + write-путь сломан + 857 строк (треть всей admin-кодовой базы) + POST в cities автоматом тоже исчезнет.
- Зависимости `html-to-image`, `file-saver` из [package.json](../package.json#L51-L49).

**Оставляем (после верификации работоспособности):**
- `src/components/admin/CitiesAdmin.tsx` (105 строк)
- `src/components/admin/NotebooksAdmin.tsx` (277 строк)
- `src/components/admin/QuestionsAdmin.tsx` (191 строка)
- `src/components/admin/AdminPanel.tsx` (упрощается: 5 табов → 3)
- `src/components/AdminView.tsx` (PIN-логика заменяется на server-side gate)

**До этого нужно от Ольги:** 1 минута в браузере — проверить, что POST/PATCH/DELETE в notebooks/questions/cities **не возвращает 401/42501**. Если возвращает — все три тоже выпиливаем (тогда вариант A из SEC_PINS актуален в полном объёме).

---

## Выводы для AUDIT (P2-8 уточнение)

После этого ARCH_CHECK прежний P2-8 «мёртвый admin-write путь в meetings» делится на два:
- **P2-8a** — мёртвый путь в EventsAdmin (PATCH/DELETE/POST events): дублируется Garden, не работает, удаляем.
- **P2-8b** — статус NotebooksAdmin/QuestionsAdmin/CitiesAdmin write-путей **не верифицирован**. По коду должны не работать. Нужна 1-минутная проверка в браузере. После этого: либо они тоже мёртвые (тогда сливаются в P2-8a), либо они живые → значит у `web_anon` есть лишние гранты на эти таблицы → **новый P0 для Garden** (ANOM-004 уже есть в backlog phase 18).
