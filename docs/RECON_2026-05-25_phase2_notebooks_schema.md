# RECON — NB-RESTORE Phase 2: notebooks schema + CRUD blocker

**Дата:** 2026-05-25
**Тип:** read-only mini-recon. Никаких изменений.
**Источник:** запрос стратега 2026-05-25, продолжение [IMPL_2026-05-24_phase1_deployed.md](IMPL_2026-05-24_phase1_deployed.md)
**Связанные документы:** [RECON_2026-05-24_nb_restore.md](RECON_2026-05-24_nb_restore.md), [IMPL_2026-05-24_phase1_admin_scaffold.md](IMPL_2026-05-24_phase1_admin_scaffold.md)

---

## 🚨 TL;DR — HARD BLOCKER

**Phase 2 frontend CRUD как заявлено не заработает без Garden-миграции.** RLS на `notebooks` (и `questions`) включён, но **нет INSERT/UPDATE/DELETE policies** — только SELECT. Любой POST/PATCH/DELETE даже с валидным admin JWT упадёт RLS violation.

Состояние **изменилось** с момента recon NB_RESTORE (24-го мая): тогда §3 фиксировал `WITH CHECK (true)` permissive policies на CRUD. Кто-то их снёс между 24 и 25 мая (на notebooks и questions, **не** на cities).

Решение требуется до Phase 2 frontend apply — см. §6 (3 варианта Garden-миграции).

Бонус-mismatch: твой бриф предполагает поле **«цена»** — его в схеме нет. Реальные поля: title/description/image_url/pdf_url. Подробнее §1.

---

## §1 — Схема `public.notebooks`

```
Column      | Type                     | Nullable | Default
------------+--------------------------+----------+--------------------------------
id          | integer                  | NOT NULL | nextval('notebooks_id_seq')
title       | text                     | NOT NULL |
description | text                     | NOT NULL |
image_url   | text                     | NULL     |
pdf_url     | text                     | NULL     |
created_at  | timestamptz              | NULL     | now()
```

**Только 6 колонок.** Никакого `price`, `sort_order`, `status`.

### Mismatch vs твой бриф

| Твой бриф | Реальная колонка | Что делаем |
|---|---|---|
| «Название» (required, min 3) | `title` text NOT NULL | ✅ матч |
| **«Цена»** (number, > 0, RUB) | ❌ нет в схеме | **decision point** — добавлять колонку Garden-миграцией или убрать из формы? |
| «Ссылка на покупку» (URL) | `pdf_url` text | ✅ матч **семантически** (см. §2 — там лежат ссылки на товары izdatelstvo, не PDF). Имя колонки misleading — рекомендую переименовать. |
| «Картинка URL» (text) | `image_url` text | ✅ матч |
| (не в брифе, но в схеме) | `description` text NOT NULL | используется на публичной странице — нужно поле в форме |

Если хочешь "цена" — нужна Garden-миграция `ALTER TABLE notebooks ADD COLUMN price text` (по аналогии с [events.price из `20251130*.sql`](https://github.com/ligacreate/meetings/commit/2d416df#diff-supabase_meetings_20251130181534)). И тогда **NotebooksView.tsx тоже надо обновить** — публичная страница цену не показывает сейчас (см. §3).

---

## §2 — Текущие данные (live, 2026-05-25)

```
 id |       title       | description | image_url      | pdf_url
----+-------------------+-------------+----------------+--------
  2 | Блокнот в точку   | Формат А5…  | supabase.co/…  | izdatelstvo.skrebeyko.ru/delo-goda/tproduct/…
  3 | Блокнот в линейку | Формат B5…  | supabase.co/…  | izdatelstvo.skrebeyko.ru/delo-goda/tproduct/…
  4 | Tesoro notes      | Коуч…       | supabase.co/…  | izdatelstvo.skrebeyko.ru/tesoro
```

3 строки. Все `image_url` — Supabase Storage (см. [Phase 0 cleanup отчёт](IMPL_2026-05-24_phase1_admin_scaffold.md) — открытый follow-up DATA-REHOST-NOTEBOOK-IMAGE). Все `pdf_url` — товарные страницы на izdatelstvo, **не PDF**.

`id=1` отсутствует — была удалена ранее. SERIAL продолжает после 4, следующий INSERT даст `id=5`.

---

## §3 — Где рендерится на публичной части

### [src/components/NotebooksView.tsx](../src/components/NotebooksView.tsx) (75 строк)

```tsx
<LazyImage src={notebook.image_url} alt={notebook.title} ... />
<h3>{notebook.title}</h3>
{notebook.description && <p>{notebook.description}</p>}
<button onClick={() => window.open(notebook.pdf_url || 'https://izdatelstvo.skrebeyko.ru', '_blank')}>
  Почитать больше
</button>
```

Используются **4 поля:** `id` (key), `title`, `description`, `image_url`, `pdf_url`. **Цена не отображается.** Кнопка ведёт на `pdf_url` (товарная страница izdatelstvo), text — "Почитать больше" (не "Купить").

### Откуда данные

[src/pages/Index.tsx:241-244](../src/pages/Index.tsx#L241-L244):
```ts
postgrestFetch<Notebook[]>(
  'notebooks',
  { select: 'id, title, description, image_url, pdf_url, created_at', order: 'created_at.desc' }
)
```

Без JWT (anon role), SELECT. ✅ Работает (RLS permissive на SELECT). Сортировка по `created_at DESC` — последний созданный сверху.

### TypeScript тип [src/types/index.ts:23-29](../src/types/index.ts#L23-L29)
```ts
export interface Notebook {
    id: number;
    title: string;
    description?: string;
    image_url?: string;
    pdf_url?: string;
}
```

`description` помечен опциональным в TS, но в БД он NOT NULL. Несоответствие — но безопасное (`?` строже, чем требуется). Для admin-формы я буду требовать description как в БД.

---

## §4 — GRANTs (table-level privileges)

```
   grantee    | privilege_type 
---------------+----------------
 authenticated | DELETE
 authenticated | INSERT
 authenticated | SELECT
 authenticated | UPDATE
 web_anon      | SELECT
 gen_user      | <all>
```

✅ На уровне GRANTs `authenticated` имеет SELECT/INSERT/UPDATE/DELETE. Если бы RLS не блокировал — CRUD под JWT работал бы.

---

## §5 — RLS state — **здесь блокер**

### RLS включён на всех трёх таблицах

```
  relname  | rls_enabled | rls_forced
-----------+-------------+------------
 cities    | t           | f
 notebooks | t           | f
 questions | t           | f
```

### Policies — текущее состояние (live, 2026-05-25)

```
 polname                               | polcmd | using_clause | with_check
---------------------------------------+--------+--------------+------------
 Allow delete cities                   | d      | true         |
 Allow insert cities                   | a      |              | true
 Allow public read access to cities    | r      | true         |
 Allow update cities                   | w      | true         |
 Allow public read access to notebooks | r      | true         |   ← только SELECT
 Allow public read access to questions | r      | true         |   ← только SELECT
```

| Таблица | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `cities` | ✅ permissive | ✅ permissive | ✅ permissive | ✅ permissive |
| **`notebooks`** | ✅ permissive | ❌ **нет policy** | ❌ **нет policy** | ❌ **нет policy** |
| **`questions`** | ✅ permissive | ❌ **нет policy** | ❌ **нет policy** | ❌ **нет policy** |

**При включённом RLS отсутствие policy = блокировка.** GRANTs ничего не дают.

### Дельта vs RECON_2026-05-24

[RECON_nb_restore §3](RECON_2026-05-24_nb_restore.md#L161-L172) от 24-го утверждал:
> | RLS policies | events_* (`USING (true)` для всех CRUD) | cities_* (`WITH CHECK (true)`) | **notebooks_* (`WITH CHECK (true)`)** | **questions_* (`WITH CHECK (true)`)** |

То есть **сутки назад были permissive WITH CHECK true policies** на notebooks/questions для CRUD. Сегодня их **нет**. Кто-то снёс точечно — затронул только notebooks+questions, не cities. Возможно это и есть частичный ANOM-004-fix Garden-стороной (см. RECON_nb_restore §7 hard-blocker R1) — но без admin-only replacement.

Это значит реальная **production policy posture** изменилась, и моя Phase 1 trust-model (`UI-allowlist защищает, ANOM-004 ditched`) теперь работает only because Garden случайно снёс policies — но любая будущая Garden-миграция, которая ВЕРНЁТ permissive policies, опять откроет surface. Стратегически правильнее закрепить admin-only через `is_admin()` — см. §6 (A).

### Live probes (decisive evidence)

**psql под role authenticated:**
```sql
SET ROLE authenticated;
INSERT INTO notebooks (title, description) VALUES ('__probe__', 'recon test') RETURNING id;
-- ERROR: new row violates row-level security policy for table "notebooks"
```

**PostgREST без JWT:**
```
POST /notebooks → HTTP 401, code 42501, "permission denied for table notebooks"
```

Live POST с админ-JWT не пробил (не запрашивал твой пароль), но **результат предсказуем по psql probe**: PostgREST вернёт 401 либо 403 от RLS — в любом случае CRUD не заработает.

---

## §6 — Decision-point: Garden-миграция (3 варианта)

**`public.is_admin()` функция в Garden DB существует ✅** — можно использовать.

### (A) ⭐ Recommended — admin-only через `is_admin()`

```sql
-- Migration: e.g. phase39_meetings_admin_writes.sql
CREATE POLICY "notebooks_admin_insert" ON public.notebooks
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "notebooks_admin_update" ON public.notebooks
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "notebooks_admin_delete" ON public.notebooks
  FOR DELETE TO authenticated USING (public.is_admin());

-- Аналогично для questions
-- (cities — оставить permissive, либо тоже затянуть — отдельный вопрос)
```

**Плюсы:**
- Стандартный Garden pattern (есть в `08_meetings_rls.sql`, `16_course_progress_rls.sql`, phase24/25/27/28)
- Defence-in-depth с UI-allowlist (`VITE_MEETINGS_ADMIN_USER_IDS`)
- ANOM-004 closed for notebooks/questions
- Новый admin в Garden автоматически работает (без миграции)

**Минусы:**
- Нужна Garden migration → ждать Garden-команду / стратега
- Если `is_admin()` вернёт false для тебя — diagnostic: проверить `profiles.role` (уже подтвердили = admin)

**Estimate:** 0.5h Garden migration + apply + reload PostgREST. **БЛОКЕР для Phase 2 frontend на проде.**

### (B) Permissive policies (revert к прежнему состоянию)

```sql
CREATE POLICY "Allow insert notebooks" ON public.notebooks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update notebooks" ON public.notebooks FOR UPDATE USING (true);
CREATE POLICY "Allow delete notebooks" ON public.notebooks FOR DELETE USING (true);
-- + аналогично questions
```

**Плюсы:**
- Быстро (6 строк миграции)
- Фронтенд CRUD сразу работает
- Соответствует cities posture (consistency)

**Минусы:**
- Возвращает ANOM-004: любой `authenticated`-юзер Сада может писать через DevTools
- Trust-model уже принят как low-risk per Phase 1 commit message — но осознанно
- Тащить ANOM-004 forever

**Estimate:** 0.25h.

### (C) Hardcoded UUID-allowlist в RLS (mirror UI allowlist)

```sql
CREATE POLICY "notebooks_meetings_admin_writes" ON public.notebooks
  FOR ALL TO authenticated
  USING (auth.uid()::text IN ('85dbefda-ba8f-4c60-9f22-b3a7acd45b21'))
  WITH CHECK (auth.uid()::text IN ('85dbefda-ba8f-4c60-9f22-b3a7acd45b21'));
```

**Плюсы:**
- Точное зеркало UI allowlist — defence-in-depth максимальный
- Не зависит от `profiles.role` (даже если кто-то поменяет роль через `is_admin()` workaround — UUID не пройдёт)

**Минусы:**
- Hardcoded UUID в SQL — плохо для maintenance (новый admin = новая Garden миграция)
- Дублирует list (UI и DB должны быть в sync вручную)
- Не Garden-стандарт

**Estimate:** 0.25h.

---

## §7 — Дополнительный flag: `notebook.id=2.image_url` всё ещё на supabase.co

Все 3 текущих `image_url` указывают на `https://rqdsletjyncigvesufqe.supabase.co/storage/v1/object/public/notebook-images/...` — Supabase Storage, который мы **уже не используем** для нового кода (после SUPABASE-CLEANUP).

Это не блокер Phase 2 (CRUD форма просто принимает любую URL-строку), но:
- Если когда-то supabase.co отключится — все 3 картинки тетрадей исчезнут на проде
- Phase 4 Storage refactor должна это решить (rehost в собственный bucket или CDN)

Не моя зона в Phase 2. Просто фиксирую как открытый risk.

---

## §8 — Что считать «полем формы» (зависит от §1 + §6 + §10 решений)

### Если поле «Цена» **не нужно** (минимум вариаций)

| Поле | Тип | Required | Validation |
|---|---|---|---|
| Название (title) | text | ✅ | min 3 chars |
| Описание (description) | textarea | ✅ NOT NULL в БД | min 10 chars |
| Картинка URL (image_url) | url | ✅ practically (без неё иконка-fallback) | HTML5 url + https |
| Ссылка покупки (pdf_url) | url | ✅ practically (без неё кнопка ведёт на izdatelstvo home) | HTML5 url + https |

### Если поле «Цена» нужно — **дополнительно** Garden migration

```sql
ALTER TABLE notebooks ADD COLUMN price text;
```

И **NotebooksView.tsx** надо обновить чтобы цену показать на публичной странице. Эта работа выходит за scope Phase 2 как заявлено («только CRUD форма»).

---

## §9 — UX/Validation план для Phase 2 (после decision)

Это **черновик**, finalize после твоего ответа по §6 и §8.

| Aspect | План |
|---|---|
| Layout | Карточки (как [NotebooksView.tsx](../src/components/NotebooksView.tsx)), но компактнее — admin-режим |
| Add | Кнопка «Добавить блокнот» сверху → inline form expand (не modal, проще для mobile) |
| Edit | На каждой карточке кнопка «Редактировать» → той же inline form пред-заполненной |
| Delete | Кнопка «Удалить» → `<AlertDialog>` confirmation (shadcn) → `DELETE /notebooks?id=eq.<n>` |
| Loading | Кнопки disabled + сообщение «Сохраняем…» во время API запроса |
| Errors | `useToast({ variant: 'destructive', title, description })` для 4xx (без `window.alert`) |
| Success | `useToast({ title: 'Блокнот сохранён' })` + list reload |
| Optimistic update | Не делаю в Phase 2 — после save делаю refetch listNotebooks(). Простота > оптимистика. |
| Validation | inline (под полем) + блок submit (button disabled) |

### API layer

Добавлю в [src/lib/auth.ts](../src/lib/auth.ts) или новый файл `src/lib/notebooks.ts`:
- `listNotebooks(): Promise<Notebook[]>` — GET (без JWT можно, но с JWT тоже работает — единый authFetch)
- `createNotebook(input): Promise<Notebook>` — POST с Bearer + `Prefer: return=representation`
- `updateNotebook(id, patch): Promise<Notebook>` — PATCH с Bearer
- `deleteNotebook(id): Promise<void>` — DELETE с Bearer

### Bundle impact (предварительная оценка)

Phase 1 Admin chunk = 8.92 KB. После добавления NotebooksAdmin (форма + dialog + list) — ожидаемо **+15-25 KB** в Admin chunk. Главный bundle не растёт.

---

## §10 — Open decisions для тебя

| # | Решение | Опции |
|---|---|---|
| **D1** | Кто и когда делает Garden-миграцию для RLS? | (A) ты говоришь Garden-стратегу / делаешь сама. (B) я пишу SQL для миграции + ты копируешь в Garden migrations? Я в meetings-repo, не Garden — могу подготовить файл, но apply — твоя зона. |
| **D2** | Какой RLS вариант — A/B/C из §6? | A recommended |
| **D3** | Поле «Цена» — нужно или убираем? | Если нужно — ещё одна Garden migration (ALTER TABLE) + правка NotebooksView |
| **D4** | Переименовать `pdf_url` → `purchase_url` или `external_url`? Misleading имя — задумывался как PDF, фактически — товарная страница. | Pure cosmetic, требует Garden migration + миграции данных (обновить вызовы PostgREST везде) — можно отложить |
| **D5** | Затягиваем ли `cities` тем же RLS-подходом, или оставляем permissive? | Out of scope Phase 2 (cities — Garden FEAT-018 по плану), решение можно отложить |

---

## §11 — Workflow предложение

1. **Сейчас:** твой ответ по D1-D5 (особенно D1, D2, D3 — они блокируют дальнейшее)
2. **После D1 решения:** если я пишу SQL — подготовлю файл в `docs/` или `garden_migrations/` (на твой выбор) с finalized policies + smoke probes
3. **После Garden apply:** verify через `SET ROLE authenticated; INSERT INTO notebooks ...` → success
4. **После RLS ок:** Phase 2 IMPL draft (с finalized полями из D3) → твоё ревью → 🟢 apply
5. **Local + prod smoke** на трёх сценариях:
   - Ольга (admin + allowlist): create/edit/delete работает
   - viktorovna (applicant): не пускается даже к /admin → CRUD недоступен
   - аноним: SELECT работает (публичная страница), POST 401 (как было)

---

## Источники

- live psql (2026-05-25): схема, данные, policies, RLS state, GRANTs, `is_admin()` existence, INSERT probe
- live curl (2026-05-25): PostgREST POST /notebooks без JWT → 401/42501
- [RECON_2026-05-24_nb_restore.md §3](RECON_2026-05-24_nb_restore.md) — для сравнения и обнаружения дельты
- [src/components/NotebooksView.tsx](../src/components/NotebooksView.tsx) — публичный рендер
- [src/pages/Index.tsx:241-244](../src/pages/Index.tsx#L241-L244) — fetch
- [src/types/index.ts:23-29](../src/types/index.ts#L23-L29) — TS тип
- [src/lib/auth.ts](../src/lib/auth.ts) — auth helpers из Phase 1 (использует Bearer для PostgREST)
