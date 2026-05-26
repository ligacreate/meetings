# IMPL — Phase 3: QuestionsAdminTab CRUD

**Дата:** 2026-05-25
**Тип:** frontend draft, **не apply** до 🟢
**Зависимость:** ✅ Phase 2 Part A уже apply'd — RLS `questions_admin_write FOR ALL USING(is_admin())` живёт на проде. Никаких Garden миграций.
**Источник:** запрос стратега 2026-05-25, defaults D1-D6 ✅
**Связанные документы:** [RECON_phase3_questions_schema.md](RECON_2026-05-25_phase3_questions_schema.md), [IMPL_phase2_partB_applied.md](IMPL_2026-05-25_phase2_partB_applied.md)

---

## TL;DR

**4 файла** (без Part A — RLS уже admin-only после Phase 2):
- `src/lib/questions.ts` **(new)** — CRUD API helpers (паттерн notebooks.ts)
- `src/types/index.ts` **(modified)** — добавить `Question` interface
- `src/components/admin/QuestionsAdminTab.tsx` **(new)** — list + search + pagination 25/page + inline form + delete dialog
- `src/pages/Admin.tsx` **(modified)** — render `<QuestionsAdminTab>` вместо заглушки

**Никаких** правок в Index.tsx / ReflectionView.tsx — публичный flow работает с `string[]`, не ломается. CACHE_VERSION не bumpaем.

**Bundle estimate:** Admin chunk 20.5 KB → **~30-32 KB** (D5 approved).

**Acceptance:** ты в `/#/admin` → вкладка «Вопросы» → 105 строк paged, search фильтрует, create/edit/delete работают, на публичной «Вопрос дня» подхватывает изменения через SWR (~1-2 sec).

---

## §1 — File 1: `src/lib/questions.ts` (new, ~85 строк)

```typescript
import { getAuthToken } from '@/lib/auth';
import type { Question } from '@/types';

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';

export interface QuestionInput {
  question: string;
  order_index: number;
}

const QUESTION_COLUMNS = 'id, question, order_index, created_at';

interface FetchOpts {
  method?: string;
  body?: unknown;
  returnRepresentation?: boolean;
}

const questionsFetch = async <T>(
  path: string,
  params: Record<string, string> = {},
  opts: FetchOpts = {},
): Promise<T> => {
  const url = new URL(path, POSTGREST_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.returnRepresentation) headers.Prefer = 'return=representation';

  const response = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.error || text;
    } catch {
      // keep raw text
    }
    const err = new Error(message || `Запрос упал (${response.status})`) as Error & {
      status: number;
    };
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const listQuestions = (): Promise<Question[]> =>
  questionsFetch<Question[]>('questions', {
    select: QUESTION_COLUMNS,
    order: 'order_index.asc',
  });

export const createQuestion = async (input: QuestionInput): Promise<Question> => {
  const rows = await questionsFetch<Question[]>(
    'questions',
    {},
    { method: 'POST', body: [input], returnRepresentation: true },
  );
  return rows[0];
};

export const updateQuestion = async (
  id: number,
  patch: Partial<QuestionInput>,
): Promise<Question> => {
  const rows = await questionsFetch<Question[]>(
    'questions',
    { id: `eq.${id}` },
    { method: 'PATCH', body: patch, returnRepresentation: true },
  );
  return rows[0];
};

export const deleteQuestion = async (id: number): Promise<void> => {
  await questionsFetch<void>('questions', { id: `eq.${id}` }, { method: 'DELETE' });
};
```

**Заметки:**
- 1-в-1 паттерн `notebooks.ts`, только колонки/имена `question`/`order_index`
- `DELETE by id` (не by text) — Phase 1 recon упоминал прежний баг в legacy admin (`question=eq.<text>` мог снести 2 вопроса с одинаковым текстом). Мы сразу делаем правильно.
- `order: 'order_index.asc'` — естественный порядок для админ-обзора

---

## §2 — File 2: `src/types/index.ts` (modified)

```diff
 export interface Notebook {
     id: number;
     title: string;
     description?: string;
     price?: string;
     image_url?: string;
     pdf_url?: string;
 }
+
+export interface Question {
+    id: number;
+    question: string;
+    order_index: number;
+    created_at?: string;
+}
```

**Заметки:**
- `created_at?` optional — не используем в админке, но completeness. Если решим показать — без правки типа.
- `question` matches DB column name (не `text`/`content`).

---

## §3 — File 3: `src/components/admin/QuestionsAdminTab.tsx` (new, ~280 строк)

Полный код:

```tsx
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  createQuestion,
  deleteQuestion,
  listQuestions,
  updateQuestion,
  type QuestionInput,
} from '@/lib/questions';
import type { Question } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 25;

type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; item: Question };

const EMPTY_FORM: QuestionInput = {
  question: '',
  order_index: 0,
};

const validateForm = (
  f: QuestionInput,
): Partial<Record<keyof QuestionInput, string>> => {
  const errors: Partial<Record<keyof QuestionInput, string>> = {};
  if (f.question.trim().length < 10) errors.question = 'Минимум 10 символов';
  if (!Number.isInteger(f.order_index) || f.order_index < 0) {
    errors.order_index = 'Целое число ≥ 0';
  }
  return errors;
};

const errMsg = (err: unknown): string =>
  err instanceof Error ? err.message : 'Неизвестная ошибка';

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    {children}
    {error && <div className="text-xs text-red-600">{error}</div>}
  </div>
);

const QuestionsAdminTab = () => {
  const [items, setItems] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [form, setForm] = useState<QuestionInput>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await listQuestions());
    } catch (err) {
      toast({
        title: 'Не удалось загрузить вопросы',
        description: errMsg(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.question.toLowerCase().includes(q));
  }, [items, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const setField = <K extends keyof QuestionInput>(k: K, v: QuestionInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const errors = validateForm(form);
  const isValid = Object.values(errors).every((e) => !e);

  const openCreate = () => {
    const maxOrder = items.reduce((m, it) => Math.max(m, it.order_index), -1);
    setForm({ question: '', order_index: maxOrder + 1 });
    setMode({ kind: 'create' });
  };

  const openEdit = (item: Question) => {
    setForm({ question: item.question, order_index: item.order_index });
    setMode({ kind: 'edit', item });
  };

  const cancelForm = () => {
    setMode({ kind: 'list' });
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || mode.kind === 'list') return;
    setBusy(true);
    try {
      if (mode.kind === 'create') {
        await createQuestion(form);
        toast({ title: 'Вопрос добавлен' });
      } else {
        await updateQuestion(mode.item.id, form);
        toast({ title: 'Вопрос сохранён' });
      }
      cancelForm();
      await reload();
    } catch (err) {
      toast({
        title: 'Не удалось сохранить',
        description: errMsg(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deletingId === null) return;
    setBusy(true);
    try {
      await deleteQuestion(deletingId);
      toast({ title: 'Вопрос удалён' });
      setDeletingId(null);
      await reload();
    } catch (err) {
      toast({
        title: 'Не удалось удалить',
        description: errMsg(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (mode.kind !== 'list') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4 mt-4">
        <h2 className="text-lg font-medium">
          {mode.kind === 'create' ? 'Новый вопрос' : `Редактируем вопрос #${mode.item.id}`}
        </h2>

        <Field label="Текст вопроса *" error={errors.question}>
          <Textarea
            value={form.question}
            onChange={(e) => setField('question', e.target.value)}
            disabled={busy}
            rows={4}
          />
        </Field>

        <Field label="Порядок (order_index) *" error={errors.order_index}>
          <Input
            type="number"
            min={0}
            step={1}
            value={form.order_index}
            onChange={(e) => setField('order_index', Number(e.target.value))}
            disabled={busy}
          />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !isValid}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelForm} disabled={busy}>
            Отмена
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <h2 className="text-lg font-medium">Вопросы ({items.length})</h2>
        <div className="flex gap-2">
          <Input
            placeholder="Поиск по тексту…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full sm:w-64"
          />
          <Button onClick={openCreate} size="sm">
            + Добавить
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Загружаем…</div>}
      {!loading && filtered.length === 0 && (
        <div className="text-sm text-slate-500">
          {search ? 'Ничего не найдено.' : 'Пока нет вопросов.'}
        </div>
      )}

      <div className="space-y-2">
        {pageItems.map((item) => (
          <div key={item.id} className="flex gap-3 p-3 border rounded-lg items-start">
            <div className="text-xs font-mono text-muted-foreground pt-0.5 shrink-0 w-12">
              #{item.order_index}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm line-clamp-2">{item.question}</div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button size="sm" variant="outline" onClick={() => openEdit(item)} disabled={busy}>
                Редактировать
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeletingId(item.id)}
                disabled={busy}
              >
                Удалить
              </Button>
            </div>
          </div>
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0 || busy}
          >
            ←
          </Button>
          <div className="text-sm text-muted-foreground">
            Страница {safePage + 1} из {pageCount}
            {filtered.length !== items.length && ` (найдено ${filtered.length})`}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1 || busy}
          >
            →
          </Button>
        </div>
      )}

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && !busy && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить вопрос?</AlertDialogTitle>
            <AlertDialogDescription>
              «{(items.find((i) => i.id === deletingId)?.question || '').slice(0, 80)}
              {(items.find((i) => i.id === deletingId)?.question || '').length > 80 ? '…' : ''}»
              исчезнет навсегда. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={handleDelete}>
              {busy ? 'Удаляем…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuestionsAdminTab;
```

**Ключевые особенности:**
- **PAGE_SIZE = 25** константа сверху, легко поменять
- **useMemo** для `filtered` — пересчёт только когда items/search меняется
- **`safePage`** — защита от out-of-bounds после search (например, был на странице 4 из 5, поиск сократил до 2 страниц → автоматически "5" клампится в "2")
- **`openCreate()`** делает `maxOrder + 1` через reduce — гарантировано выше всех существующих
- **Search resets page to 0** — `setPage(0)` при изменении search
- **Pagination footer** показывается только если `pageCount > 1` (иначе занимает место зря)
- **AlertDialog truncate 80 chars** для длинных вопросов (105 строк включает 200+ char prompts)

---

## §4 — File 4: `src/pages/Admin.tsx` (modified)

```diff
 import MainLayout from '@/components/layout/MainLayout';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { Button } from '@/components/ui/button';
 import { useToast } from '@/hooks/use-toast';
 import NotebooksAdminTab from '@/components/admin/NotebooksAdminTab';
+import QuestionsAdminTab from '@/components/admin/QuestionsAdminTab';

 // ... unchanged guard logic ...

           <TabsContent value="notebooks">
             <NotebooksAdminTab />
           </TabsContent>
           <TabsContent value="questions">
-            <div className="py-8 text-center text-muted-foreground">
-              Скоро. CRUD вопросов появится в Phase 3.
-            </div>
+            <QuestionsAdminTab />
           </TabsContent>
```

Никаких других изменений в Admin.tsx — guard, header, logout остаются как есть.

---

## §5 — Что **не** меняем (и почему)

| Файл | Почему |
|---|---|
| `src/pages/Index.tsx` | Fetch уже корректный: `select: 'question,order_index'`. Мапит в `string[]` для ReflectionView. Не ломаем. |
| `src/components/ReflectionView.tsx` | Принимает `string[]`, показывает random «Вопрос дня». Никаких полей для добавления — публичка не меняется. |
| `CACHE_VERSION` (Index.tsx) | Структура `string[]` в кеше не меняется (текст вопросов меняется, но это контент, не shape). SWR refresh подхватит новые/изменённые/удалённые через 1-2 sec на главной. |
| `src/lib/auth.ts` | Никаких новых auth helpers. `getAuthToken` уже используется в questions.ts через импорт. |
| `.env.example` | Никаких новых env vars. |

---

## §6 — Bundle impact estimate

| Chunk | Phase 2 | Phase 3 estimate | Δ |
|---|---|---|---|
| `Admin-*.js` (lazy) | 20,540 bytes | **~30,000-32,000 bytes** | **+10-12 KB** |
| `index-*.js` (main) | 516,939 bytes | **~516,939 bytes** | **+0** (ничего не трогаем в shared/public) |
| `label-*.js` (shared) | 2,535 bytes | ~2,535 bytes | 0 |

Phase 2 acceptance limit был 30 KB. Phase 3 может слегка превысить (32 KB). **D5 уже approved** — принимаем.

Vite может re-organize chunks (как было между Phase 1→2 когда auth.ts перепрыгнул в label-chunk). Реальное распределение увижу после `npm run build`.

---

## §7 — Smoke acceptance (после apply + deploy)

| # | Шаг | Ожидание |
|---|---|---|
| 1 | Login Ольгой → вкладка «Вопросы» | Видишь header «Вопросы (105)», search input, кнопка «+ Добавить», 25 первых вопросов, pagination footer «Страница 1 из 5» |
| 2 | Кликни «→» → страница 2 | Видишь вопросы 26-50 |
| 3 | Введи в search «мечт» | Filter моментально, pagination обнуляется на стр. 1, footer показывает «(найдено N)» |
| 4 | Очисти search → «+ Добавить» | Форма expand сверху. `order_index` pre-filled = 105 (max+1) |
| 5 | Заполни «Test Phase 3 question» (>10 chars) → Сохранить | toast «Вопрос добавлен», список refresh, новый вопрос на последней странице |
| 6 | Найди через search «Test Phase 3» → Edit → измени текст → Сохранить | toast «Вопрос сохранён», изменения в списке |
| 7 | Delete тестовый → AlertDialog с превью текста → Confirm | toast «Вопрос удалён», вопрос пропадает, count в header стал 105 |
| 8 | Открой главную meetings.skrebeyko.ru → секция «Вопрос дня» → Обновить пару раз | Видишь random вопрос из 105 (не из удалённого test) — confirms SWR подхватил |
| 9 | Anon DevTools → `fetch('/questions', {method:'POST', ...})` | 401/42501 (Part A RLS работает) |

---

## §8 — Workflow (как Phase 2)

1. **🟢 apply Part B** (этот) → 4 файла + `npm run build` + bundle assertion + local smoke (`npm run dev` с env var)
2. Отчёт `IMPL_phase3_applied.md`
3. **🟢 commit + push** → CI deploy → prod smoke
4. Отчёт `IMPL_phase3_deployed.md`

**Estimate:** apply ~10 мин, build+local ~10 мин, commit+push+deploy ~5 мин = **~25 мин total**.

---

## §9 — Open для тебя (минимум — defaults closed)

| # | Что | Default |
|---|---|---|
| Q1 | Имена action buttons «Редактировать»/«Удалить» (как notebooks) или короче «Изм.»/«Уд.»? | как notebooks (consistency) |
| Q2 | После Phase 3 — закрываем NB-RESTORE entirely, или есть ещё что-то перед Phase 4 (storage)? | Phase 4 storage — отдельный 🟢 потом |

---

## Источники

- [RECON_phase3_questions_schema.md](RECON_2026-05-25_phase3_questions_schema.md) — recon
- [src/lib/notebooks.ts](../src/lib/notebooks.ts) — паттерн API
- [src/components/admin/NotebooksAdminTab.tsx](../src/components/admin/NotebooksAdminTab.tsx) — паттерн компонента
- [src/pages/Admin.tsx](../src/pages/Admin.tsx) — точка врезки
