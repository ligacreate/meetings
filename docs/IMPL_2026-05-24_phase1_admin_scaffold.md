# IMPL — NB-RESTORE Phase 1: admin route scaffold (auth-guard, без CRUD)

**Дата:** 2026-05-24
**Тип:** draft impl-plan, **не apply** до 🟢 от стратега
**Скоп:** lazy-loaded `/admin` маршрут + auth-check + scaffold с двумя вкладками. Без CRUD, без storage, без cities.
**Архитектура:** Variant (a) из [RECON_2026-05-24_nb_restore.md §5](RECON_2026-05-24_nb_restore.md) — admin-bundle в meetings, reuse `auth.skrebeyko.ru`.

---

## TL;DR

- **5 файлов:** 3 новых ([src/lib/auth.ts](../src/lib/auth.ts), [src/pages/Login.tsx](../src/pages/Login.tsx), [src/pages/Admin.tsx](../src/pages/Admin.tsx)) + 2 модификации ([src/App.tsx](../src/App.tsx), [.env.example](../.env.example)).
- **Lazy chunk** через `React.lazy()` — admin-код **не входит в публичный bundle** (vite автоматически создаёт отдельный chunk).
- **Auth flow:** 2 запроса вместо 1 — `POST /auth/login` → token, потом `GET /profiles?id=eq.<sub>&select=role` через PostgREST. `/auth/me` отдаёт **только auth user без role**, поэтому role читается из `profiles` (как в Garden).
- **Storage key** `localStorage.garden_auth_token` — та же конвенция что в Garden. Если у Ольги уже залогинен Garden в том же браузере — это **не shareable** (разные origins), но ключ одинаковый ради консистентности кода.
- **JWT decode** для извлечения `sub` claim — мини-helper, скопирован с [garden/services/jwtUtils.js](../../../garden_claude/garden/services/jwtUtils.js).

---

## §0 — Verify (auth API contract reality)

Перед написанием — curl-probe (2026-05-24):

| Endpoint | Без JWT | С плохими creds |
|---|---|---|
| `GET https://auth.skrebeyko.ru/auth/me` | `401 {"error":"Missing token"}` | — |
| `POST https://auth.skrebeyko.ru/auth/login` body `{email,password}` | — | `401 {"error":"Invalid credentials"}` |
| `GET https://auth.skrebeyko.ru/api/profile/me` | `404 Cannot GET` | — |
| `GET https://api.skrebeyko.ru/profiles?select=id,role` | `401 {"code":"42501","message":"permission denied for table profiles"}` | — |

### Auth flow для admin-проверки (как в Garden)

[garden/services/dataService.js:1235-1256](../../../garden_claude/garden/services/dataService.js#L1235-L1256) и [garden/services/dataService.js:1472-1486](../../../garden_claude/garden/services/dataService.js#L1472-L1486):

```js
// login: 2 запроса
const { token, user } = await POST /auth/login  // { user.id, user.email — без role! }
setAuthToken(token)
const profile = await GET /profiles?id=eq.<user.id>  // через PostgREST под JWT — role здесь

// getCurrentUser (mount): тоже 2 запроса
const { user } = await GET /auth/me  // { user.id, email — без role }
const profile = await GET /profiles?id=eq.<user.id>
```

**Поэтому ольгин план "GET /auth/me → role===admin" — неточный.** `/auth/me` возвращает auth user (id, email, name), а role хранится в `profiles` (PostgREST таблица под RLS, доступна только с JWT). Делаю как Garden — два запроса.

---

## §1 — Архитектурный breakdown

### Новые файлы

| Файл | Назначение | Размер |
|---|---|---|
| `src/lib/auth.ts` | `getAuthToken/setAuthToken`, `login(email, password)`, `getCurrentProfile()`, `extractSubFromToken()`, типы `Profile`/`AuthError` | ~80 строк |
| `src/pages/Login.tsx` | Форма email+password, вызов `login()`, редирект на `/admin` | ~110 строк |
| `src/pages/Admin.tsx` | Mount-guard (token? profile? role==='admin'?) → 3 состояния (loading/forbidden/ok). Scaffold с `<Tabs>` («Блокноты»/«Вопросы») и заглушками. | ~120 строк |

### Изменённые

| Файл | Что |
|---|---|
| `src/App.tsx` | Импорт `lazy` + `Suspense`, два новых маршрута `/login` и `/admin` (оба lazy-loaded) |
| `.env.example` | Добавить `VITE_AUTH_URL=` (опциональная, default `https://auth.skrebeyko.ru`) |

### Принципы

- **Один guard, не два.** `RequireAdmin` компонент-обёртка избыточна для Phase 1 — проверка живёт прямо в `Admin.tsx::useEffect`. При появлении CRUD-страниц (Phase 2) можно вынести в `<RequireAdmin>{children}</RequireAdmin>` без боли.
- **Lazy через `React.lazy()`**, не через `react-router` data API — у нас `react-router-dom@6.30.1` и обычный `<Routes>`, а не `createBrowserRouter`. Vite/Rollup создаёт отдельный chunk для каждого dynamic import — это даёт точный bundle-split.
- **Storage key `garden_auth_token`** — та же конвенция что в Garden (см. [recon §4](RECON_2026-05-24_nb_restore.md#L199-L213)). При cross-origin localStorage **не shareable**, но имя одинаковое для будущей унификации.
- **Без `@tanstack/react-query`** для auth-операций — login и profile-fetch одноразовы, useState достаточно. React Query уже есть в проекте, но overkill для этого.

---

## §2 — Diffs

### 2.1 `src/lib/auth.ts` (new)

```typescript
const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.skrebeyko.ru';
const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';
const TOKEN_KEY = 'garden_auth_token';

export interface Profile {
  id: string;
  email?: string;
  name?: string;
  role: string;
}

export interface AuthError extends Error {
  status?: number;
}

export const getAuthToken = (): string => localStorage.getItem(TOKEN_KEY) || '';

export const setAuthToken = (token: string | null): void => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export const extractSubFromToken = (token: string): string | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return payload.sub || null;
  } catch {
    return null;
  }
};

const authFetch = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const url = new URL(path, AUTH_URL);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };
  const token = getAuthToken();
  if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`;

  const response = await fetch(url.toString(), { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(
      (data as { error?: string }).error || `Ошибка запроса (${response.status})`
    ) as AuthError;
    err.status = response.status;
    throw err;
  }
  return data as T;
};

/** POST /auth/login → { token, user }. Token сохраняется в localStorage. */
export const login = async (email: string, password: string): Promise<{ userId: string }> => {
  const data = await authFetch<{ token: string; user: { id: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  setAuthToken(data.token);
  return { userId: data.user.id };
};

/** GET /profiles?id=eq.<sub>&select=id,email,name,role. Требует JWT в localStorage. */
export const getCurrentProfile = async (): Promise<Profile | null> => {
  const token = getAuthToken();
  if (!token) return null;
  const sub = extractSubFromToken(token);
  if (!sub) return null;

  const url = new URL('profiles', POSTGREST_URL);
  url.searchParams.set('id', `eq.${sub}`);
  url.searchParams.set('select', 'id,email,name,role');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (response.status === 401) {
    setAuthToken(null);
    return null;
  }
  if (!response.ok) {
    const err = new Error(`PostgREST profile fetch failed (${response.status})`) as AuthError;
    err.status = response.status;
    throw err;
  }
  const rows = (await response.json()) as Profile[];
  return rows[0] || null;
};

export const logout = (): void => setAuthToken(null);
```

**Заметки:**
- На 401 от PostgREST → `setAuthToken(null)` (auto-cleanup истёкшего токена), возвращаем `null` чтобы guard перенаправил на /login.
- Email normalize (trim + lowercase) — как в [garden/services/dataService.js:20](../../../garden_claude/garden/services/dataService.js#L20).
- На `/auth/me` пока не опираемся — не нужен в Phase 1 (login сам возвращает user.id, getCurrentProfile использует sub из токена).

---

### 2.2 `src/pages/Login.tsx` (new)

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/lib/auth';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка входа';
      toast({ title: 'Не удалось войти', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout showFooter={false}>
      <div className="max-w-sm mx-auto py-12 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-medium">Вход в админку</h1>
          <p className="text-sm text-muted-foreground">
            Тот же email и пароль, что в Саду.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !email || !password}
          >
            {submitting ? 'Входим…' : 'Войти'}
          </Button>
        </form>
      </div>
    </MainLayout>
  );
};

export default Login;
```

**Заметки:**
- `MainLayout` переиспользуем — то же оформление, что у `Index`.
- Toaster подключён через `App.tsx::<Toaster />`, поэтому `useToast()` работает без дополнительных провайдеров.
- `autoComplete="current-password"` — браузерам можно подсказать сохранять/подставлять.

---

### 2.3 `src/pages/Admin.tsx` (new)

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken, getCurrentProfile, logout, type Profile } from '@/lib/auth';
import MainLayout from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type GuardState =
  | { status: 'loading' }
  | { status: 'ok'; profile: Profile }
  | { status: 'forbidden'; profile: Profile };

const Admin = () => {
  const [state, setState] = useState<GuardState>({ status: 'loading' });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!getAuthToken()) {
        navigate('/login');
        return;
      }
      try {
        const profile = await getCurrentProfile();
        if (cancelled) return;
        if (!profile) {
          navigate('/login');
          return;
        }
        if (profile.role === 'admin') {
          setState({ status: 'ok', profile });
        } else {
          setState({ status: 'forbidden', profile });
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Ошибка проверки доступа';
        toast({ title: 'Ошибка', description: message, variant: 'destructive' });
        navigate('/login');
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [navigate, toast]);

  if (state.status === 'loading') {
    return (
      <MainLayout showFooter={false}>
        <div className="py-12 text-center text-muted-foreground">Проверяем доступ…</div>
      </MainLayout>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <MainLayout showFooter={false}>
        <div className="max-w-sm mx-auto py-12 space-y-4 text-center">
          <h1 className="text-2xl font-display font-medium">Нет прав</h1>
          <p className="text-sm text-muted-foreground">
            У вашего аккаунта роль «{state.profile.role}», а нужна «admin».
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => navigate('/')}>Вернуться на главную</Button>
            <Button
              variant="outline"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Войти под другим аккаунтом
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout showFooter={false}>
      <div className="py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-medium">Админка</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Выйти
          </Button>
        </div>

        <Tabs defaultValue="notebooks">
          <TabsList>
            <TabsTrigger value="notebooks">Блокноты</TabsTrigger>
            <TabsTrigger value="questions">Вопросы</TabsTrigger>
          </TabsList>
          <TabsContent value="notebooks">
            <div className="py-8 text-center text-muted-foreground">
              Скоро. CRUD блокнотов появится в Phase 2.
            </div>
          </TabsContent>
          <TabsContent value="questions">
            <div className="py-8 text-center text-muted-foreground">
              Скоро. CRUD вопросов появится в Phase 3.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Admin;
```

**Заметки:**
- `cancelled`-флаг для unmount-safe (если юзер уходит до завершения guard-промиса).
- На любой ошибке guard — `navigate('/login')` (consistent UX, не оставляем юзера в полузагрузке).
- «Выйти» — `logout() + navigate('/login')`, никакого подтверждения (быстрая операция, легко повторить логин).

---

### 2.4 `src/App.tsx` (modified)

```diff
 import { Toaster } from "@/components/ui/toaster";
 import { Toaster as Sonner } from "@/components/ui/sonner";
 import { TooltipProvider } from "@/components/ui/tooltip";
 import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
 import Index from "./pages/Index";
 import NotFound from "./pages/NotFound";
-import { useEffect } from "react";
+import { lazy, Suspense, useEffect } from "react";
+
+const Login = lazy(() => import("./pages/Login"));
+const Admin = lazy(() => import("./pages/Admin"));

 const queryClient = new QueryClient();

 const RedirectHandler = () => {
   const location = useLocation();
   const navigate = useNavigate();

   useEffect(() => {
     if (location.pathname.startsWith('/tgWebAppData')) {
       navigate('/');
     }
   }, [location, navigate]);

   return null;
 };

 const App = () => {
   return (
     <QueryClientProvider client={queryClient}>
       <TooltipProvider>
         <Toaster />
         <Sonner />
         <HashRouter>
           <RedirectHandler />
-          <Routes>
-            <Route path="/" element={<Index />} />
-            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
-            <Route path="*" element={<NotFound />} />
-          </Routes>
+          <Suspense fallback={null}>
+            <Routes>
+              <Route path="/" element={<Index />} />
+              <Route path="/login" element={<Login />} />
+              <Route path="/admin" element={<Admin />} />
+              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
+              <Route path="*" element={<NotFound />} />
+            </Routes>
+          </Suspense>
         </HashRouter>
       </TooltipProvider>
     </QueryClientProvider>
   );
 };

 export default App;
```

**Заметки:**
- `<Suspense fallback={null}>` — на момент загрузки lazy-chunk показываем пустоту. Login/Admin загружаются быстро (~5-10KB), мерцание не успеет визуально проявиться. Альтернатива — спиннер, но overkill.
- Lazy импорт обёрнут на оба маршрута — login тоже не нужен публичному юзеру, не грузим заранее.
- HashRouter сохраняем (не меняем routing strategy в этой фазе) — `/admin` будет `https://meetings.skrebeyko.ru/#/admin`.

---

### 2.5 `.env.example` (modified)

```diff
 # Optional: override the PostgREST API base URL.
 # Defaults to https://api.skrebeyko.ru if unset.
 VITE_POSTGREST_URL=
+
+# Optional: override the auth service URL.
+# Defaults to https://auth.skrebeyko.ru if unset.
+VITE_AUTH_URL=
```

**Заметка:** read-deny на `.env*` снова актуален — нужен mv-trick (как в SUPABASE-CLEANUP) или ручная правка. Помечу в финальном отчёте.

---

## §3 — Bundle-split verification план

После apply:
1. `npm run build`
2. Проверить `dist/assets/` — должны появиться **два дополнительных chunk'а**, например:
   - `dist/assets/Login-<hash>.js` (~5-8KB) — login форма
   - `dist/assets/Admin-<hash>.js` (~8-12KB) — admin scaffold
3. Замерить размер главного chunk'а — **не должен значительно вырасти** от текущего `index-CV7cEk1a.js` 513.65KB:
   ```bash
   ls -lh dist/assets/*.js
   ```
4. DevTools проверка после deploy:
   - Открыть `https://meetings.skrebeyko.ru/` инкогнито
   - Network → reload → отфильтровать `.js` — увидеть только main chunk, **никакого** Login/Admin
   - Перейти на `#/admin` — увидеть, что Admin chunk **догружается** в этот момент

Если admin-chunk попадает в main bundle (например, из-за неосторожного импорта типов на верхнем уровне) — это **bug**, который должен быть пойман на этом шаге.

---

## §4 — Smoke acceptance (после apply + deploy)

| # | Шаг | Ожидание |
|---|---|---|
| 1 | Открыть `https://meetings.skrebeyko.ru/#/admin` анонимно | Через ~200ms — редирект на `#/login`, форма видна |
| 2 | Ввести валидные creds Ольги (admin) → «Войти» | Toast не появляется, редирект на `#/admin`, вкладки «Блокноты»/«Вопросы» видны с заглушками |
| 3 | Hard refresh на `#/admin` | Снова проверяет token+role, показывает админку без формы (token остался в localStorage) |
| 4 | Залогиниться как applicant (не admin) | После submit — попадаем на `/admin` → «Нет прав» + кнопка «Вернуться на главную» |
| 5 | Открыть `https://meetings.skrebeyko.ru/` (главная) с DevTools Network | В chunks **нет** `Login-*.js` / `Admin-*.js` (lazy-load) |
| 6 | Кликнуть «Выйти» в админке | Редирект на `/login`, localStorage `garden_auth_token` очищен |

Не входит в acceptance Phase 1 (Phase 2-4):
- Создание/редактирование/удаление notebooks/questions
- Storage upload для notebook images
- Cities (отдельный таск — Garden FEAT-018)
- ANOM-004 fix (RLS tightening в Garden)

---

## §5 — Open questions / known unknowns

1. **Не-admin role в `profiles`:** что именно лежит в `profile.role` у applicant/gardener/mentor? Если Garden ENUM включает `admin|applicant|gardener|mentor` (см. [garden/utils/roles.js](../../../garden_claude/garden/utils/roles.js)) — проверка `=== 'admin'` корректна. Если бывает `null`/пусто — добавить `(profile.role || '').toLowerCase() === 'admin'` для safety. **Рекомендую strict-сравнение для Phase 1**, потому что любая нестандартная роль → forbidden — это правильный default.

2. **JWT expiry:** в Phase 1 нет refresh-логики. Если токен истёк → PostgREST вернёт 401 → guard переведёт на /login → re-login. Это терпимо для админки (редко используется), но **не для CRUD flows в Phase 2**. Тогда нужно либо refresh-флоу, либо catch 401 на каждом PostgREST-вызове и редирект.

3. **HashRouter vs BrowserRouter:** `/admin` будет работать как `/#/admin`. Если когда-нибудь захочется чистый `/admin` (без `#`) — потребуется отдельный таск (миграция на BrowserRouter + server-side fallback в FTP-хостинге, что нетривиально).

4. **Race condition на login → navigate('/admin'):** мы вызываем `setAuthToken(token)` синхронно перед `navigate`. На /admin сразу читаем токен — должно работать (localStorage синхронен). Edge-case если браузер вдруг async — в Phase 1 не парится, в Phase 2 можно добавить small assertion.

5. **CORS на `/profiles` под Authorization header:** recon §3 подтверждает `Access-Control-Allow-Origin: *` для `api.skrebeyko.ru`. Probe с OPTIONS + Authorization preflight не делал, но в Garden работает — confident.

6. **Cleanup старого `tgWebAppData` редиректа:** `RedirectHandler` в App.tsx остаётся как есть (не моя тема, не трогаю).

---

## §6 — Что НЕ в этой фазе

| Phase | Скоп |
|---|---|
| **2** | NotebooksAdmin — CRUD форма (title/description/image_url/pdf_url), reuse `postgrestRequest('POST/PATCH/DELETE')` с Bearer |
| **3** | QuestionsAdmin — CRUD форма (question/order_index), плюс fix `DELETE by id` вместо `by text` |
| **4** | Storage refactor — переключение image upload на Supabase Storage `notebook-images` bucket вместо base64 |
| **сторонне** | Cities — отдельная задача (Garden FEAT-018, не входит в NB-RESTORE) |
| **Garden-side** | ANOM-004 — миграция, переписывающая RLS `WITH CHECK (true)` на `is_admin()` для notebooks/questions/cities. **Hard blocker для Phase 2-4**, не для Phase 1 (scaffold не пишет в БД). |

---

## §7 — Effort estimate

- Apply (новые/изменённые файлы): 15-20 мин
- Local smoke (`npm run dev` + login flow): 10-15 мин
- Build + bundle-split assertion: 5 мин
- Commit + push + deploy + prod smoke: ~10 мин (deploy ~2 мин CI)

**Итого:** 40-50 мин до зелёного на проде.

---

## §8 — Action items для стратега (перед 🟢)

- [ ] Подтвердить scope: только scaffold + auth-guard, без CRUD ✅ из задачи
- [ ] Подтвердить storage key: `garden_auth_token` (а не отдельный `meetings_auth_token`)
- [ ] Подтвердить strict-compare role `=== 'admin'` (vs tolerant `toLowerCase`)
- [ ] Подтвердить `<Suspense fallback={null}>` (vs спиннер)
- [ ] Готов ли тестовый аккаунт applicant (role != admin) для acceptance шага 4?

Если все ответы дефолтные/yes — готов к apply по 🟢.

---

## Источники

- [RECON_2026-05-24_nb_restore.md](RECON_2026-05-24_nb_restore.md) — архитектурный recon
- [garden/services/dataService.js:8-118, 1235-1486](../../../garden_claude/garden/services/dataService.js) — auth/profile паттерны
- [garden/services/jwtUtils.js](../../../garden_claude/garden/services/jwtUtils.js) — JWT sub-decoder
- live probes (2026-05-24): /auth/me, /auth/login, /api/profile/me, /profiles
- [src/App.tsx](../src/App.tsx), [src/pages/Index.tsx](../src/pages/Index.tsx), [src/components/layout/MainLayout.tsx](../src/components/layout/MainLayout.tsx) — точки врезки
