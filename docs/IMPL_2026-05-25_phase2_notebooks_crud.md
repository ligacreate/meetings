# IMPL — Phase 2 Part B: NotebooksAdminTab CRUD + public price render

**Дата:** 2026-05-25
**Тип:** frontend draft, **не apply** до 🟢
**Зависимость:** Phase 2 Part A ([RECON_phase2_garden_migration_diff.md](RECON_2026-05-25_phase2_garden_migration_diff.md)) **должна быть apply'ена** до prod-deploy этой части. Local-dev — то же: чтение прода всё ещё работает, но create/update/delete упадут до Garden migration.
**Источник:** запрос стратега 2026-05-25, бриф «Phase 2 NB-RESTORE: NotebooksAdmin CRUD» + D1-D5 decisions
**Связанные документы:** [RECON_phase2_notebooks_schema.md](RECON_2026-05-25_phase2_notebooks_schema.md), [RECON_phase2_garden_migration_diff.md](RECON_2026-05-25_phase2_garden_migration_diff.md), [IMPL_phase1_admin_scaffold.md](IMPL_2026-05-24_phase1_admin_scaffold.md)

---

## TL;DR

**5 файлов:**
- `src/lib/notebooks.ts` **(new)** — CRUD API helpers с Bearer JWT
- `src/types/index.ts` **(modified)** — `Notebook.price?: string`
- `src/components/admin/NotebooksAdminTab.tsx` **(new)** — list + form (create/edit) + delete dialog
- `src/pages/Admin.tsx` **(modified)** — вместо заглушки рендерим `<NotebooksAdminTab>` в TabsContent
- `src/components/NotebooksView.tsx` **(modified)** — отобразить `price` под title (если непустая)

UX: **inline-form, не modal** (проще на мобильном, меньше UI surface). Delete — через `<AlertDialog>` confirmation. Toast'ы на success/error. Refetch listа после mutation (не optimistic).

Bundle impact estimate: Admin chunk 8.92 KB → **~22-28 KB** (+13-19 KB: form + dialog + CRUD logic). Main bundle: **+0 KB** (всё в Admin lazy chunk).

Acceptance после Part A apply + Part B deploy:
1. Ольга открывает `/#/admin` → вкладка Блокноты → видит 3 блокнота с title/description/image/price/url
2. «Добавить» → форма expand → заполняет → save → новая карточка в списке + появляется на главной meetings.skrebeyko.ru
3. «Редактировать» на карточке → форма pre-fill → save → изменения видны и в админке, и на главной
4. «Удалить» → confirmation dialog → confirm → карточка пропадает из админки + с главной
5. viktorovna (applicant, не в allowlist) → /admin не пускает → CRUD недоступен
6. Anon → notebooks читаются на главной (включая `price`), POST/PATCH/DELETE — 401/42501

---

## §1 — File 1: `src/lib/notebooks.ts` (new)

```typescript
import { getAuthToken } from '@/lib/auth';
import type { Notebook } from '@/types';

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';

export interface NotebookInput {
  title: string;
  description: string;
  price: string;
  image_url: string;
  pdf_url: string;
}

const NOTEBOOK_COLUMNS = 'id, title, description, price, image_url, pdf_url, created_at';

interface FetchOpts {
  method?: string;
  body?: unknown;
  returnRepresentation?: boolean;
}

const notebooksFetch = async <T>(
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
    const err = new Error(message || `Запрос упал (${response.status})`) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const listNotebooks = (): Promise<Notebook[]> =>
  notebooksFetch<Notebook[]>('notebooks', {
    select: NOTEBOOK_COLUMNS,
    order: 'created_at.desc',
  });

export const createNotebook = async (input: NotebookInput): Promise<Notebook> => {
  const rows = await notebooksFetch<Notebook[]>(
    'notebooks',
    {},
    { method: 'POST', body: [input], returnRepresentation: true },
  );
  return rows[0];
};

export const updateNotebook = async (id: number, patch: Partial<NotebookInput>): Promise<Notebook> => {
  const rows = await notebooksFetch<Notebook[]>(
    'notebooks',
    { id: `eq.${id}` },
    { method: 'PATCH', body: patch, returnRepresentation: true },
  );
  return rows[0];
};

export const deleteNotebook = async (id: number): Promise<void> => {
  await notebooksFetch<void>('notebooks', { id: `eq.${id}` }, { method: 'DELETE' });
};
```

**Заметки:**
- Используем `getAuthToken()` из существующего [src/lib/auth.ts](../src/lib/auth.ts) — не дублируем хелперы.
- `Prefer: return=representation` на POST/PATCH чтобы получать обратно созданную/обновлённую строку.
- Ошибки PostgREST приходят `{message, code, ...}` — извлекаем `.message`. На 401/42501 (если admin в Garden пропал) — будет понятная строка в toast.
- POST `body: [input]` — массив, как PostgREST требует для bulk insert (одна строка тоже массивом).
- `select` includes `price` — должна быть после Part A apply, иначе 400 missing column.

---

## §2 — File 2: `src/types/index.ts` (modified)

```diff
 export interface Notebook {
     id: number;
     title: string;
     description?: string;
+    price?: string;
     image_url?: string;
     pdf_url?: string;
 }
```

**Заметки:**
- `price?: string` — optional в TS (для backward compat с cached старыми данными в localStorage до миграции). В БД `NOT NULL DEFAULT ''` — но из API всегда придёт строка (пустая или нет).
- Не трогаю `created_at` etc — пока не используется в фронте.

---

## §3 — File 3: `src/components/admin/NotebooksAdminTab.tsx` (new, ~280 строк)

Полный компонент — слишком много для inline-блока, поэтому ключевые секции:

### Структура

```tsx
const NotebooksAdminTab = () => {
  const [items, setItems] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'create' } | { kind: 'edit'; item: Notebook }>({ kind: 'list' });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await listNotebooks());
    } catch (err) {
      toast({ title: 'Не удалось загрузить блокноты', description: errMsg(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  // ... render: header + list или form в зависимости от mode
};
```

### List view (mode === 'list')

```tsx
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-medium">Блокноты ({items.length})</h2>
    <Button onClick={() => setMode({ kind: 'create' })} size="sm">+ Добавить</Button>
  </div>

  {loading && <div className="text-sm text-slate-500">Загружаем…</div>}
  {!loading && items.length === 0 && <div className="text-sm text-slate-500">Пока нет блокнотов.</div>}

  <div className="space-y-3">
    {items.map((item) => (
      <div key={item.id} className="flex gap-3 p-3 border rounded-lg">
        <div className="w-16 h-20 shrink-0 bg-muted rounded overflow-hidden">
          {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{item.title}</div>
          <div className="text-sm text-muted-foreground line-clamp-2">{item.description}</div>
          {item.price && <div className="text-sm mt-1">{item.price}</div>}
          {item.pdf_url && <a href={item.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">URL</a>}
        </div>
        <div className="flex flex-col gap-1">
          <Button size="sm" variant="outline" onClick={() => setMode({ kind: 'edit', item })}>Редактировать</Button>
          <Button size="sm" variant="outline" onClick={() => setDeletingId(item.id)}>Удалить</Button>
        </div>
      </div>
    ))}
  </div>
</div>
```

### Form (create/edit)

Inline-form (не modal), с inline валидацией под полями + disabled submit когда invalid:

```tsx
<form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4">
  <h2 className="text-lg font-medium">{mode.kind === 'create' ? 'Новый блокнот' : `Редактируем «${mode.item.title}»`}</h2>

  <Field label="Название*" error={errors.title}>
    <Input value={form.title} onChange={e => setField('title', e.target.value)} disabled={busy} maxLength={200} />
  </Field>

  <Field label="Описание*" error={errors.description}>
    <Textarea value={form.description} onChange={e => setField('description', e.target.value)} disabled={busy} rows={3} />
  </Field>

  <Field label="Цена (например: 1 200 ₽)" error={errors.price}>
    <Input value={form.price} onChange={e => setField('price', e.target.value)} disabled={busy} placeholder="" />
  </Field>

  <Field label="URL картинки*" error={errors.image_url}>
    <Input type="url" value={form.image_url} onChange={e => setField('image_url', e.target.value)} disabled={busy} placeholder="https://..." />
  </Field>

  <Field label="URL покупки*" error={errors.pdf_url}>
    <Input type="url" value={form.pdf_url} onChange={e => setField('pdf_url', e.target.value)} disabled={busy} placeholder="https://izdatelstvo.skrebeyko.ru/..." />
  </Field>

  <div className="flex gap-2">
    <Button type="submit" disabled={busy || !isValid}>
      {busy ? 'Сохраняем…' : 'Сохранить'}
    </Button>
    <Button type="button" variant="ghost" onClick={() => setMode({ kind: 'list' })} disabled={busy}>Отмена</Button>
  </div>
</form>
```

**Field helper:**
```tsx
const Field = ({ label, error, children }: { label: string; error?: string; children: ReactNode }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    {children}
    {error && <div className="text-xs text-red-600">{error}</div>}
  </div>
);
```

### Validation (single function — `validateForm`)

```tsx
const validateForm = (f: NotebookInput): Record<keyof NotebookInput, string | undefined> => {
  const errors: Record<string, string | undefined> = {};
  if (f.title.trim().length < 3) errors.title = 'Минимум 3 символа';
  if (f.description.trim().length < 10) errors.description = 'Минимум 10 символов';
  // price — необязательное (БД NOT NULL DEFAULT '', пустая строка ОК)
  if (!isValidUrl(f.image_url)) errors.image_url = 'Введите корректный URL (https://…)';
  if (!isValidUrl(f.pdf_url)) errors.pdf_url = 'Введите корректный URL покупки';
  return errors as Record<keyof NotebookInput, string | undefined>;
};

const isValidUrl = (s: string): boolean => {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const isValid = Object.values(errors).every((e) => !e);
```

### Save handler

```tsx
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  if (!isValid) return;
  setBusy(true);
  try {
    if (mode.kind === 'create') {
      await createNotebook(form);
      toast({ title: 'Блокнот добавлен' });
    } else {
      await updateNotebook(mode.item.id, form);
      toast({ title: 'Блокнот сохранён' });
    }
    setMode({ kind: 'list' });
    await reload();
  } catch (err) {
    toast({ title: 'Не удалось сохранить', description: errMsg(err), variant: 'destructive' });
  } finally {
    setBusy(false);
  }
};
```

### Delete dialog

```tsx
<AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Удалить блокнот?</AlertDialogTitle>
      <AlertDialogDescription>
        «{items.find(i => i.id === deletingId)?.title}» исчезнет с публичной страницы. Действие необратимо.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
      <AlertDialogAction
        disabled={busy}
        onClick={async () => {
          if (deletingId === null) return;
          setBusy(true);
          try {
            await deleteNotebook(deletingId);
            toast({ title: 'Блокнот удалён' });
            setDeletingId(null);
            await reload();
          } catch (err) {
            toast({ title: 'Не удалось удалить', description: errMsg(err), variant: 'destructive' });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Удаляем…' : 'Удалить'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### errMsg helper

```tsx
const errMsg = (err: unknown): string => (err instanceof Error ? err.message : 'Неизвестная ошибка');
```

**Заметки:**
- **Inline form, не modal** — чтобы на мобильном не было overlay scroll-traps. Только Delete confirm через `<AlertDialog>` (по standard'у).
- **Не optimistic** — после mutation делаю `await reload()`. Простота > латентность; админка редко используется.
- **Busy disable** — все кнопки и поля блокируются на время mutation. Простой защитный паттерн от double-click.
- **`disabled={busy || !isValid}`** на submit — формальная защита, но валидация всегда дробится по полям inline.

---

## §4 — File 4: `src/pages/Admin.tsx` (modified)

```diff
 import MainLayout from '@/components/layout/MainLayout';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { Button } from '@/components/ui/button';
 import { useToast } from '@/hooks/use-toast';
+import NotebooksAdminTab from '@/components/admin/NotebooksAdminTab';

 // ... unchanged guard logic ...

         <Tabs defaultValue="notebooks">
           <TabsList>
             <TabsTrigger value="notebooks">Блокноты</TabsTrigger>
             <TabsTrigger value="questions">Вопросы</TabsTrigger>
           </TabsList>
           <TabsContent value="notebooks">
-            <div className="py-8 text-center text-muted-foreground">
-              Скоро. CRUD блокнотов появится в Phase 2.
-            </div>
+            <NotebooksAdminTab />
           </TabsContent>
           <TabsContent value="questions">
             <div className="py-8 text-center text-muted-foreground">
               Скоро. CRUD вопросов появится в Phase 3.
             </div>
           </TabsContent>
         </Tabs>
```

---

## §5 — File 5: `src/components/NotebooksView.tsx` (modified)

Отображаем цену под title (если непустая), сохраняем существующий layout.

```diff
                 <div>
                   <h3 className="text-lg font-display font-bold text-slate-900 mb-2 leading-tight group-hover:text-primary transition-colors">
                     {notebook.title}
                   </h3>
+                  {notebook.price && (
+                    <div className="text-sm font-medium text-primary mb-2">
+                      {notebook.price}
+                    </div>
+                  )}
                   {notebook.description && (
                     <p className="text-sm text-slate-600 line-clamp-3 mb-4 leading-relaxed">
                       {notebook.description}
                     </p>
                   )}
                 </div>
```

**Заметки:**
- Условный рендер `{notebook.price && (...)}` — пустая строка `''` falsy в JSX, не покажется.
- Цвет `text-primary` — наследует accent цвет темы (как hover на title); можно поменять на `text-slate-900` если хочешь spotlighting цены чуть слабее.
- Mobile / desktop — одинаковый класс (нет shift в grid).

---

## §6 — Cache invalidation

[Index.tsx:128-135](../src/pages/Index.tsx#L128-L135) — `CACHE_VERSION = 'v4'`. Если мы добавляем поле `price` — кешированные блокноты в localStorage будут без price, и публичная страница покажет старые данные до первого fresh fetch.

**Текущее поведение:** SWR pattern в [Index.tsx:160-169](../src/pages/Index.tsx#L160-L169) — сначала из кеша (моментально), потом fetch и refresh. То есть юзер увидит блокноты сразу (без цены), через 1-2 секунды — с ценой.

**Решение:** bump `CACHE_VERSION` до `'v5'` — старый кеш автоматически инвалидируется по существующему cleanup loop в [Index.tsx:152-158](../src/pages/Index.tsx#L152-L158).

```diff
-  const CACHE_VERSION = 'v4';
+  const CACHE_VERSION = 'v5';
```

Это **6-й файл** в diff (modify в Index.tsx). Минимальный, но критичный для UX чистоты.

---

## §7 — Bundle impact estimate

| Chunk | Phase 1 | Phase 2 estimate | Δ |
|---|---|---|---|
| `Admin-*.js` (lazy) | 8.92 KB | **22-28 KB** | +13-19 KB |
| `auth-*.js` (lazy shared) | 1.47 KB | ~1.6 KB | +0.1 KB (импорт notebooks.ts → новая ссылка, но содержимое в другом chunk) |
| `notebooks-*.js` (new lazy shared?) | — | ~2-3 KB | new или включится в Admin chunk |
| `index-*.js` (main) | 515.34 KB | **~515.5 KB** | +0.1-0.2 KB (Index.tsx минимально, NotebooksView.tsx — 5 строк) |

Vite сам решит inline vs separate chunk для notebooks.ts. Главное — **main bundle не растёт значительно** (~+0.2 KB max).

---

## §8 — UX flow (полный, для self-check)

1. Ольга открывает `/#/admin` (Phase 1 guard прошёл) → видит Tabs «Блокноты»/«Вопросы», вкладка Блокноты выбрана default
2. `NotebooksAdminTab` mount → `listNotebooks()` → loading state → 3 карточки
3. Каждая карточка: thumbnail (16×20), title, description (line-clamp-2), price (если есть), URL link, 2 кнопки [Редактировать] [Удалить]
4. Кнопка «+ Добавить» сверху → form expand сверху, list ниже (или form replaces list?)
   - **Решение:** form **заменяет** list (mode === 'create' || 'edit'). На мобильном проще, нет split-screen
   - «Отмена» возвращает к list
5. Form fields:
   - Название (required, min 3) — Input
   - Описание (required, min 10) — Textarea
   - Цена (optional, free-form text) — Input
   - URL картинки (required, valid http(s)://) — Input type=url
   - URL покупки (required, valid http(s)://) — Input type=url
6. Inline validation: красная строка под каждым некорректным полем; submit disabled пока isValid=false
7. На submit:
   - Все поля disabled (`busy=true`)
   - Кнопка показывает «Сохраняем…»
   - На success — toast «Блокнот сохранён», возврат к list, reload
   - На error (любой 4xx/5xx) — toast destructive с PostgREST error message, форма остаётся, можно поправить
8. Edit: тот же form pre-filled. На save: `PATCH /notebooks?id=eq.<n>` + body — все 5 полей (включая price).
9. Delete: AlertDialog «Удалить «<title>»? Действие необратимо.» → confirm → `DELETE /notebooks?id=eq.<n>` → toast «Блокнот удалён» → close dialog → reload
10. После любой mutation — на главной meetings.skrebeyko.ru через ~1-2 sec (SWR) появляются изменения (нужен hard refresh либо подождать TTL кеша)

---

## §9 — Smoke acceptance (после Part A apply + Part B apply)

| # | Шаг | Ожидание |
|---|---|---|
| 1 | `npm run build` локально (с `VITE_MEETINGS_ADMIN_USER_IDS=...`) | OK, Admin chunk ~22-28 KB |
| 2 | Local `npm run dev` → `/#/admin` → login Ольга → Tab «Блокноты» | 3 карточки отобразились |
| 3 | + Добавить → форма → заполнить (все required + URL валидные) → сохранить | toast «Блокнот добавлен», новая карточка в списке |
| 4 | Открыть localhost:8080/ в другой вкладке → главная | через 1-2 sec видны 4 блокнота вместо 3 (после SWR refresh) |
| 5 | Edit 4-го блокнота → изменить цену с пустой на «1 500 ₽» → сохранить | toast «Блокнот сохранён», в админке + на главной цена видна |
| 6 | Delete 4-го блокнота → confirmation → confirm | toast «Блокнот удалён», карточка пропала + на главной 3 блокнота |
| 7 | Login viktorovna → `/#/admin` → «Нет прав» | Phase 1 guard работает, CRUD недоступен |
| 8 | Anon → `/` → видны 3 блокнота с ценами (если есть) | Public read работает |
| 9 | Anon → DevTools → `fetch('/notebooks', {method:'POST',body:'{}'})` к api.skrebeyko.ru | 401 (как раньше) |
| 10 | Любой authenticated не-admin Garden-юзер (если есть JWT) → DevTools → POST /notebooks | **42501 RLS violation** (это Part A эффект, Phase 2 finally закрывает ANOM-004 для notebooks) |

---

## §10 — Что НЕ в этой итерации

- **Storage upload** для image_url — Phase 4 (D3 part of bigger storage refactor)
- **Questions CRUD** — Phase 3 (отдельный 🟢)
- **Sort/reorder блокнотов** — нет use case (3 строки, sorted by created_at)
- **Bulk операции** — нет use case
- **History/audit log** — не запрашивалось, можно добавить отдельно если нужно

---

## §11 — Open questions для тебя

| # | Вопрос | Default |
|---|---|---|
| Q1 | Form layout: **inline replace list** (mode-switch) vs **modal on top** vs **split (form sidebar + list)**? | Inline replace (мобильный friendly, без overlay) |
| Q2 | После save — возврат к list **автоматически** или остаёмся в form'е для дальнейших правок? | Автоматически (toast подтверждает успех) |
| Q3 | Цена required или optional? Я поставил optional (`text NOT NULL DEFAULT ''` — пустая строка ОК) | Optional (БД default уже пустая строка) |
| Q4 | Bump `CACHE_VERSION` v4→v5 — ОК? | Да, иначе старый кеш покажет блокноты без price на 1-2 sec после deploy |
| Q5 | Path: `src/components/admin/NotebooksAdminTab.tsx` (`admin/` подпапка) — ОК? | Согласно SEC_PINS_2026-05-05.md там жили старые admin-компоненты, восстанавливаем структуру |
| Q6 | Phase 2 frontend файлы commit'ить **сразу** или **только после Part A apply** на prod? Если сразу — Phase 2 frontend на проде будет битый (PATCH/POST упадут RLS) до Part A apply. | После Part A apply (build чистый, prod live, можно local-test перед deploy) |

---

## §12 — Workflow

1. **🟢 Part A apply** (отдельный) → smoke probes из [RECON_phase2_garden_migration_diff.md §5](RECON_2026-05-25_phase2_garden_migration_diff.md) → ОК
2. **🟢 Part B apply** (этот) → я записываю 5 файлов + bump CACHE_VERSION → `npm run build` → local smoke
3. **🟢 commit + push** (отдельный, как Phase 1) → CI build → prod deploy
4. **Prod smoke** на 6 сценариях из §9

**Estimate Part B:** apply ~10 мин (5 файлов, не сложно), local smoke 15 мин (E2E как Phase 1 — ты в браузере), commit+push+deploy 5 мин. Итого ~30 мин real time после 🟢.

Если хочешь — можно apply сразу обе части (A=SQL, B=frontend code) одним 🟢 ход'ом, но раздельный workflow безопаснее (Part A прошла smoke до того как frontend пытается писать).
