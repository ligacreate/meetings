# RECON — NB-RESTORE Phase 3: questions CRUD

**Дата:** 2026-05-25
**Тип:** read-only mini-recon. **Без apply** до 🟢.
**Источник:** запрос стратега 2026-05-25, продолжение [IMPL_phase2_deployed.md](IMPL_2026-05-25_phase2_deployed.md)
**Связанные документы:** [RECON_phase2_notebooks_schema.md](RECON_2026-05-25_phase2_notebooks_schema.md), [IMPL_phase2_partA_applied.md](IMPL_2026-05-25_phase2_partA_applied.md), [IMPL_phase2_partB_applied.md](IMPL_2026-05-25_phase2_partB_applied.md)

---

## TL;DR

- **Схема супер-простая:** 4 колонки (`id`, `question text`, `order_index integer`, `created_at`). **Нет category, нет is_active, нет status.** Никаких блокеров.
- **RLS уже admin-only** ✅ — Phase 2 Part A migration сработала, `questions_admin_write` FOR ALL USING/CHECK `is_admin()` живёт. Никаких Garden миграций для Phase 3 **не нужно**.
- **105 строк, order_index 0..104** (с одним пропуском — №4 отсутствует), text varies от коротких до длинных multi-sentence reflective prompts
- **Публичный рендер:** [ReflectionView.tsx](../src/components/ReflectionView.tsx) — берёт `questions: string[]`, показывает **случайный** «Вопрос дня» с кнопкой обновить. Никакого ordering UI на публичке. Index.tsx уже корректно fetch'ит `select: 'question,order_index'`, мапит в `string[]`.
- **Поля формы (2):** `question` (textarea), `order_index` (number).
- **Особенности:** pagination нужна (105 ≥ 50), search input по тексту — нужен (просканировать 105 неудобно). Категория/active filter — **не делаем** (полей нет).
- **Estimate Phase 3:** 30-40 мин (паттерны Phase 2 копируются, схема проще).

---

## §1 — Схема `public.questions`

```
Column      | Type                     | Nullable | Default
------------+--------------------------+----------+--------------------------------
id          | integer                  | NOT NULL | nextval('questions_id_seq')
question    | text                     | NOT NULL |
order_index | integer                  | NOT NULL |
created_at  | timestamptz              | NULL     | now()
```

**Только 4 колонки.** Никакого `category`, `is_active`, `tag`, `author`, `status`.

---

## §2 — RLS state (после Phase 2 Part A migration)

```
                polname                | polcmd | using_clause | with_check
---------------------------------------+--------+--------------+------------
 Allow public read access to questions | r      | true         |
 questions_admin_write                 | *      | is_admin()   | is_admin()
```

✅ **Admin-only writes уже работают.** Anon SELECT public.

`polcmd = '*'` = FOR ALL (INSERT/UPDATE/DELETE/SELECT). SELECT доступен анонимам через `Allow public read access`, writes — только admin (с UUID-allowlist на UI поверх).

**Никаких Garden миграций для Phase 3 не нужно.** Это разница vs Phase 2 — там Part A блокировала, тут разблокирована.

---

## §3 — Данные (live, 2026-05-25)

### Counts
```
 total | min_oi | max_oi | distinct_oi
-------+--------+--------+-------------
   105 |      0 |    104 |         104
```

- **105 строк всего**
- `order_index` от 0 до 104
- **104 distinct** vs 105 rows → есть один **дубликат либо пропуск**

### Sample (top-5 by order_index)
```
 id | order_index |                    q_excerpt (left 80)
----+-------------+--------------------------------------------------
  1 |      0      | Какую красивую историю вы хотите рассказать о своей жизни сегодня?
  2 |      1      | Что пугает вас в переменах? А что страшного в том, чтобы оставаться…
  3 |      2      | Вы сейчас работаете на нужном расстоянии от проблемы? Может быть…
  4 |      3      | Какая текущая доминанта/потребность мешает вам в движении к новому?
  5 |      5      | Чья мечта стала вашей явью? Мечта какого внутреннего голоса осуществилась…
```

⚠ **Пропуск `order_index=4`** между id=4 (order_index=3) и id=5 (order_index=5). Не блокер — публичный рендер берёт random index, sort by `order_index.asc` корректно работает с пропусками. Просто числовая последовательность не сплошная.

Если ты хочешь — могу включить «refit order_index» action в админку (renumber 0..104), но это feature creep, не запрашивалось.

---

## §4 — Где рендерится на публичной части

### [src/components/ReflectionView.tsx](../src/components/ReflectionView.tsx) (74 строки)

```tsx
interface ReflectionViewProps {
  questions: string[];   // ← просто массив строк, без id/order_index
}

// useEffect: setCurrentQuestionIndex(Math.floor(Math.random() * questions.length))
// Кнопка «Обновить»: повторяет random
// Никакого ordering UI на публичке
```

«Вопрос дня» panel — **случайный** вопрос из 105, кнопка обновить → next random. `order_index` используется только на fetch для стабильного **сортирования** массива (чтобы random index был детерминированным относительно индекса в массиве — но при random выборе это не важно).

### Fetch — [Index.tsx:233-236](../src/pages/Index.tsx#L233-L236)

```ts
postgrestFetch<{ question: string }[]>(
  'questions',
  { select: 'question,order_index', order: 'order_index.asc' }
)
```

Получает `{ question, order_index }[]`, мапит в `string[]` (только text). Никакого id не нужно для публики.

**Важно для админки:** мне нужен **полный** `Question` тип с `id` (для DELETE/UPDATE by id) и `order_index` (для display + edit). Public flow продолжает работать с `string[]` (без break compatibility).

---

## §5 — TypeScript типы

[src/types/index.ts](../src/types/index.ts) — сейчас **нет** `Question` interface (только `Event` и `Notebook`). Index.tsx локально использует inline `{ question: string }`.

В Phase 3 добавлю:

```typescript
export interface Question {
  id: number;
  question: string;
  order_index: number;
  created_at?: string;  // не используем в админке, но для completeness
}
```

И в `src/lib/questions.ts` буду использовать `Question` + `QuestionInput`. ReflectionView и Index.tsx mapping в `string[]` останутся как есть.

---

## §6 — Implementation план

### Файлы (4 + 0 опционально)

| Файл | Тип | Что |
|---|---|---|
| `src/lib/questions.ts` | new | `listQuestions/createQuestion/updateQuestion/deleteQuestion` по паттерну [notebooks.ts](../src/lib/notebooks.ts) |
| `src/types/index.ts` | modified | + `Question` interface |
| `src/components/admin/QuestionsAdminTab.tsx` | new | List + search + pagination + inline form + delete dialog |
| `src/pages/Admin.tsx` | modified | + `<QuestionsAdminTab />` вместо «Скоро»-заглушки |

**Не нужно** менять:
- `src/components/ReflectionView.tsx` — публичка работает с `string[]`, не трогаем
- `src/pages/Index.tsx` — fetch уже корректный (`select: 'question,order_index'`)
- **CACHE_VERSION не bumpaem** — структура `string[]` в кеше не меняется, добавление/удаление строк подхватится через SWR refresh

### Поля формы (2)

| Поле | Тип в БД | Form widget | Validation |
|---|---|---|---|
| **Вопрос** (`question`) | text NOT NULL | `<Textarea rows={3}>` | min 10 chars, max ~500 (без точного ограничения в БД, но разумно) |
| **Порядок** (`order_index`) | integer NOT NULL | `<Input type="number" min=0>` | ≥0 integer. На create — auto-suggest `max(order_index)+1`; на edit — pre-fill current. |

### List view особенности

- **Search input** сверху (`Filter по тексту вопроса`) — фильтрует **клиент-side** (105 строк в памяти, мгновенно). Substring case-insensitive match.
- **Pagination** — **25 на страницу** (5 страниц: 25/25/25/25/5 для 105). Кнопки `←` / `→` + индикатор `Страница X из Y`. Без infinite scroll — проще для админ-use-case (sequential review).
- **Sort:** по `order_index ASC` (естественный порядок) — фикс, без переключения. Если будет нужен `created_at DESC` — отдельный таск.
- **Каждый item** — компактная карточка: `[#order_index]  «question text (truncate-2-lines)»  [Edit] [Delete]`.

### Validation rules

- **question**: trim length ≥ 10 (минимум reasonable)
- **order_index**: integer ≥ 0; **уникальность не проверяем на клиенте** (текущий dataset имеет дубликаты? нет, distinct_oi=104 vs 105 — но пропуск, не дубликат). При случайном duplicate — фронт сохранит, БД не упадёт (на order_index нет UNIQUE constraint). Sort станет неоднозначным, но не критично.

### UX details

- **Inline form (replaces list)** — как Phase 2
- **AlertDialog** для delete confirmation с текстом первых 50 chars вопроса
- **Toast** на success/error
- **Refetch list** после mutation

### Bundle impact estimate

Phase 2 Admin chunk = 20.5 KB. Добавление QuestionsAdminTab + search + pagination → ожидаемо **+10-12 KB** (form проще notebooks, нет 5 полей). Итого Admin chunk ~30-32 KB.

⚠ **Близко к лимиту 30 KB** (твой Phase 2 acceptance). Если хочешь — могу:
- (A) Принять рост (~32 KB всё ещё мало для lazy chunk)
- (B) Разделить QuestionsAdminTab на 2 файла (form + list) — vite не обязательно вытащит в отдельный chunk, может остаться одним
- (C) Отдельный lazy chunk через `React.lazy()` для QuestionsAdminTab — будет догружаться только при клике на вкладку «Вопросы». Но это complicates Admin.tsx routing.

**Моя рекомендация: (A) принять.** ~32 KB lazy chunk остаётся незначительным для admin-UX. Если станет 40+ — пересмотрим.

---

## §7 — Open decisions для тебя

| # | Вопрос | Default (мой) |
|---|---|---|
| **D1** | Pagination 25/page vs infinite scroll? | **25/page** (проще, sequential admin review) |
| **D2** | Search — client-side (фильтр по text in JS) vs server-side (`?question=ilike.*query*`)? | **Client-side** (105 строк в памяти, мгновенно) |
| **D3** | Default `order_index` на create — auto `max+1` или admin сам вводит? | **Auto `max+1` pre-fill, но editable** (admin может переопределить) |
| **D4** | Показывать `created_at` в карточке? | **Нет** (low-value для admin-CRUD; если нужно — добавлю) |
| **D5** | Bundle Admin chunk может вырасти до ~32 KB (близко к 30 KB лимит) — принимаем? | **Принимаем** (lazy chunk, всё ещё мало) |
| **D6** | Refit order_index action (renumber 0..104, заполнить пропуск) — добавить кнопку или skip? | **Skip** — не запрашивалось, можно отдельно |

---

## §8 — Workflow (как Phase 2)

1. **Сейчас:** твоё ревью recon + ответы по D1-D6
2. **🟢 implementation diff** → отдельный draft (`IMPL_phase3_questions_crud.md`)
3. **Я ревью + 🟢 apply** → 4 файла + npm run build → local smoke
4. **🟢 commit + push** → CI deploy → prod smoke (curl-level + твоя ручная проверка)

**Estimate:** recon (этот, готов) + impl draft 15 мин + apply 10 мин + commit/push/deploy 10 мин = **~45 мин total**.

---

## §9 — Что **не** входит в Phase 3 (out of scope)

| Item | Куда |
|---|---|
| Cities CRUD | Garden FEAT-018 (D5 из RECON Phase 2) |
| Storage refactor для notebook-images | Phase 4 |
| ANOM-004 для cities | низкоприоритетный Garden-таск |
| `order_index` refit (renumber) | можно сделать отдельным mini-feature, если попросишь |
| `category`/`is_active` колонки | нет в схеме, нет в брифе ольги, не добавляем |

---

## Источники

- live psql (2026-05-25): схема, counts, samples, RLS policies
- [src/components/ReflectionView.tsx](../src/components/ReflectionView.tsx) — публичный рендер
- [src/pages/Index.tsx:233-236](../src/pages/Index.tsx#L233-L236) — fetch
- [src/lib/notebooks.ts](../src/lib/notebooks.ts) — паттерн для questions.ts
- [src/components/admin/NotebooksAdminTab.tsx](../src/components/admin/NotebooksAdminTab.tsx) — паттерн для QuestionsAdminTab.tsx
- [IMPL_phase2_partA_applied.md](IMPL_2026-05-25_phase2_partA_applied.md) — RLS migration уже применена для questions
