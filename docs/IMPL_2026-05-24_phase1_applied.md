# IMPL APPLIED — NB-RESTORE Phase 1: admin route scaffold

**Дата:** 2026-05-24
**Тип:** apply-отчёт, **не committed / не pushed** до 🟢 от стратега
**Plan:** [IMPL_2026-05-24_phase1_admin_scaffold.md](IMPL_2026-05-24_phase1_admin_scaffold.md)
**Diff:** 5 файлов (3 новых + 2 modified). Local working tree, branch `main` is up-to-date with origin.

---

## TL;DR

- ✅ Все 5 файлов записаны как планировалось + добавлена **3-я guard-проверка**: UUID-allowlist (`VITE_MEETINGS_ADMIN_USER_IDS`).
- ✅ `npm run build` — чистый, 2127 modules, 0 errors.
- ✅ **Bundle-split assertion PASSED:** admin/login код в отдельных chunks, main bundle +1.7 KB (только Suspense wrapper).
- ✅ Dev server: ready 210ms, все 5 endpoints HTTP 200, env var инжектится корректно.
- ⏸ E2E три сценария (анон/Ольга/viktorovna) **требуют браузера** — у меня нет headless browser tool. Acceptance steps описаны ниже для ручной проверки.

---

## §1 — Изменения vs original plan

В оригинальном [IMPL plan](IMPL_2026-05-24_phase1_admin_scaffold.md) было 2-условный guard (token + role). По твоему feedback'у — **добавил 3-е условие**: UUID-allowlist через env var.

### Что изменилось в коде:

**[src/lib/auth.ts](../src/lib/auth.ts):**
```typescript
const ALLOWED_ADMIN_IDS: ReadonlySet<string> = new Set(
  String(import.meta.env.VITE_MEETINGS_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const isAllowedAdminId = (id: string | null | undefined): boolean =>
  !!id && ALLOWED_ADMIN_IDS.has(id);
```

**[src/pages/Admin.tsx](../src/pages/Admin.tsx) — guard:**
```typescript
if (profile.role !== 'admin') {
  setState({ status: 'forbidden', profile, reason: 'role' });
  return;
}
if (!isAllowedAdminId(profile.id)) {
  setState({ status: 'forbidden', profile, reason: 'allowlist' });
  return;
}
setState({ status: 'ok', profile });
```

Два разных `reason` → два разных сообщения для юзера: «роль не admin» vs «нет в allowlist». Это упрощает отладку (если когда-нибудь Ольга залогинится не своим аккаунтом, или появится новый admin — сразу видно что чинить).

**Default-deny:** если `VITE_MEETINGS_ADMIN_USER_IDS` пуста — `ALLOWED_ADMIN_IDS` пустой Set → **никто** не пройдёт guard. Это safe-by-default: забыть установить env var на проде ≠ открыть доступ всем.

**Защита от ANOM-004:** даже если в Garden RLS останется `WITH CHECK (true)` и любой applicant сможет POST через DevTools — meetings/admin UI всё равно его **не пустит** (allowlist check). Это снимает hard-blocker зависимость от Garden-side фикса для Phase 2-4, как ты упомянула про feedback-trust-model.

---

## §2 — Изменения файлов (factual)

| Файл | Тип | LoC | Подтверждение |
|---|---|---|---|
| [src/lib/auth.ts](../src/lib/auth.ts) | new | 102 | written |
| [src/pages/Login.tsx](../src/pages/Login.tsx) | new | 79 | written |
| [src/pages/Admin.tsx](../src/pages/Admin.tsx) | new | 134 | written |
| [src/App.tsx](../src/App.tsx) | modified | +17 / −6 | edited (lazy + Suspense + RouteFallback) |
| [.env.example](../.env.example) | modified | +10 / 0 | edited via mv-trick (VITE_AUTH_URL + VITE_MEETINGS_ADMIN_USER_IDS) |

`git diff --stat HEAD` (untracked файлы не считаются):
```
 .env.example | 10 ++++++++++
 src/App.tsx  | 23 +++++++++++++++++------
```

---

## §3 — Build + bundle-split assertion

```
VITE_MEETINGS_ADMIN_USER_IDS=85dbefda-ba8f-4c60-9f22-b3a7acd45b21 npm run build
```

| Chunk | Size | gzip | Δ vs main HEAD |
|---|---|---|---|
| `dist/assets/index-CVEfrnwF.js` (main) | 515.34 KB | 166.98 KB | **+1.69 KB** vs prev 513.65 |
| `dist/assets/index-Ce-iFV_l.css` | 67.47 KB | 11.69 KB | +0.07 KB vs prev 67.40 |
| `dist/assets/Admin-BD35N_Db.js` | **8.92 KB** | 3.67 KB | **NEW** (lazy) |
| `dist/assets/Login-D7MNHNay.js` | **2.41 KB** | 1.22 KB | **NEW** (lazy) |
| `dist/assets/auth-BAfzGxss.js` | **1.47 KB** | 0.85 KB | **NEW** (shared between Login/Admin) |

**Modules transformed:** 2116 → 2127 (+11).
**Build time:** 2.15s.
**Errors/warnings:** только cosmetic browserslist age warning, никаких ошибок транспиляции.

**Что это значит:**
- ✅ Admin/Login/auth — **3 отдельных chunk'а**, не попадают в main bundle.
- ✅ Main bundle вырос на **0.33%** (1.69 KB) — это только wrapper-код для `React.lazy()` + `<Suspense>`. Никакого admin-кода в main.
- ✅ Анонимный посетитель `meetings.skrebeyko.ru/` загружает **только** main + css + logo. Lazy chunks догрузятся **только** если он перейдёт на `/login` или `/admin`.

---

## §4 — Dev server smoke (curl probes)

```
VITE_MEETINGS_ADMIN_USER_IDS=85dbefda-ba8f-4c60-9f22-b3a7acd45b21 npm run dev
```

| Probe | Result |
|---|---|
| Vite ready time | **210 ms** |
| `GET http://localhost:8080/` | HTTP 200 |
| `GET /src/lib/auth.ts` (vite transform) | HTTP 200 |
| `GET /src/pages/Login.tsx` (vite transform) | HTTP 200 |
| `GET /src/pages/Admin.tsx` (vite transform) | HTTP 200 |
| `GET /src/App.tsx` (vite transform) | HTTP 200 |
| Env var injection | `import.meta.env.VITE_MEETINGS_ADMIN_USER_IDS = "85dbefda-..."` присутствует в транспилированном auth.ts |
| Dependency optimization | shadcn `@radix-ui/react-label`, `@radix-ui/react-tabs` оптимизированы без ошибок |
| Vite errors/warnings | только browserslist age (cosmetic) |

**Никаких ошибок transform/import resolution.** Все импорты внутри Admin/Login/auth резолвятся.

---

## §5 — E2E acceptance steps (для тебя — ручная проверка в браузере)

Я не могу запустить headless browser для полноценного E2E, поэтому три сценария нужно проверить вручную. Запуск:

```bash
VITE_MEETINGS_ADMIN_USER_IDS=85dbefda-ba8f-4c60-9f22-b3a7acd45b21 npm run dev
# открыть http://localhost:8080/
```

| # | Сценарий | Шаги | Ожидание |
|---|---|---|---|
| 1 | **Анонимный** | DevTools → Application → Local Storage → clear `garden_auth_token`. Открыть `http://localhost:8080/#/admin` | Видим спиннер «Загрузка…» (≤300ms), потом редирект на `#/login`, форма видна |
| 2 | **Ольга (admin + UUID allowed)** | На `/login` ввести `olga@skrebeyko.com` + пароль → «Войти» | Toast не появляется. Редирект на `#/admin`. Видны «Админка» + «Выйти» + Tabs «Блокноты»/«Вопросы» (с заглушками «Скоро. CRUD появится в Phase 2/3») |
| 3 | **Viktorovna (applicant, не в allowlist)** | DevTools → clear `garden_auth_token`. На `/login` ввести `viktorovna7286@gmail.com` + пароль → «Войти» | Редирект на `#/admin` → guard срабатывает → видим «Нет прав» + «У вашего аккаунта роль «applicant», а нужна «admin».» + 2 кнопки |
| 4 | **Bundle-split в браузере** | Открыть `http://localhost:8080/` (главная) с DevTools Network → filter JS | В chunks **только main + ui assets**, **нет** `Login-*.js`, `Admin-*.js`, `auth-*.js` |
| 5 | **Lazy chunk on demand** | На главной открыть Network, очистить, перейти на `#/login` | Видим, как **появляется** `Login-D7MNHNay.js` (~2.4 KB) — догружается лениво |
| 6 | **Persistent auth** | После шага 2 — F5 на `#/admin` | Снова проверка token+profile+allowlist, спиннер ≤300ms, потом сразу админка (без редиректа на login) |
| 7 | **Logout** | Кликнуть «Выйти» в админке | Редирект на `/login`, в DevTools localStorage `garden_auth_token` отсутствует |

### Edge case (бонус): reason='allowlist'

Это сценарий, который ты не задавала, но он есть в guard: **если в Garden появится новый юзер с `role='admin'`, но его UUID не добавлен в `VITE_MEETINGS_ADMIN_USER_IDS`** — он увидит «Ваш аккаунт не в списке разрешённых администраторов meetings» (reason='allowlist'), а не «нет роли admin». Это для отладки админ-доступа без путаницы.

---

## §6 — Что НЕ применено и почему

| Не сделано | Причина |
|---|---|
| Local E2E с тремя реальными логинами | Нет headless browser в моей среде. Шаги описаны выше — твоя ручная проверка. |
| Test для viktorovna pass | Не запрашивала пароль, и не знаю можно ли его узнать. Если нужно автоматизировать E2E — нужен Playwright + creds. |
| Commit / push / deploy | Workflow: жду 🟢 от тебя после ручного smoke. |
| `.env` для local-dev | Не создавал — env var передаётся прямо в команду `VITE_MEETINGS_ADMIN_USER_IDS=... npm run dev`. Если хочешь персистентный `.env`, дай 🟢 и сделаю mv-trick'ом. |
| CI/GitHub Actions env var | На проде нужно `VITE_MEETINGS_ADMIN_USER_IDS=85dbefda-...` в [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (или в repo secrets). Если этого не сделать — **prod-сборка получит пустой allowlist и никого не пустит**. **Это hard blocker для прод-deploy**, см. §7. |

---

## §7 — ⚠️ Hard blocker для prod-deploy

`VITE_MEETINGS_ADMIN_USER_IDS` — **build-time** env var (vite inlines его в bundle). Если на GitHub Actions runner'е её нет — `dist/assets/index.js` поедет с **пустым allowlist**, и никто (включая тебя) не пройдёт guard.

**Варианты:**

**(A) GitHub repo secret + workflow update.** Самое безопасное и расширяемое.
```yaml
# .github/workflows/deploy.yml
      - name: Build
        env:
          VITE_MEETINGS_ADMIN_USER_IDS: ${{ secrets.VITE_MEETINGS_ADMIN_USER_IDS }}
        run: npm run build
```
Добавить repo secret `VITE_MEETINGS_ADMIN_USER_IDS` со значением `85dbefda-ba8f-4c60-9f22-b3a7acd45b21`.

**(B) Hardcoded в workflow.** Проще, но UUID светится в публичной истории workflow.
```yaml
      - name: Build
        env:
          VITE_MEETINGS_ADMIN_USER_IDS: 85dbefda-ba8f-4c60-9f22-b3a7acd45b21
        run: npm run build
```
UUID — **не секрет** (это публичный идентификатор пользователя в БД), он и так попадает в bundle. Но в workflow yaml — это видимая конвенция, что менее красиво.

**(C) Hardcoded fallback в auth.ts.** Самый плохой: убирает гибкость.
```typescript
String(import.meta.env.VITE_MEETINGS_ADMIN_USER_IDS || '85dbefda-ba8f-4c60-9f22-b3a7acd45b21')
```
Не рекомендую — переплетает конфиг с кодом, при появлении 2-го admin нужно править исходник.

**Моя рекомендация:** (A). Дай 🟢 + значение secret'а — обновлю workflow.

---

## §8 — Open follow-ups (вне Phase 1)

| # | Что | Когда |
|---|---|---|
| F1 | JWT refresh / 401-handler в PostgREST-вызовах CRUD | Phase 2 |
| F2 | NotebooksAdmin CRUD форма + Bearer-обёртка | Phase 2 |
| F3 | QuestionsAdmin CRUD + fix `DELETE by id` | Phase 3 |
| F4 | Storage refactor: image upload в Supabase Storage (`notebook-images` bucket) вместо base64 | Phase 4 |
| F5 | ANOM-004 Garden-migration (RLS `is_admin()` tightening) — **снят как hard blocker** благодаря UUID-allowlist, но всё равно остаётся как defense-in-depth для admin write surface | отдельный Garden-таск, без deadline |

---

## §9 — Workflow

- ✅ Apply done
- ✅ Build + bundle-split assertion done
- ✅ Dev server smoke done (curl probes, env injection verified)
- ⏸ Manual E2E (3 scenarios) — твоя ручная проверка через `npm run dev`
- ⏸ Commit + push — жду 🟢
- ⏸ Workflow update (`VITE_MEETINGS_ADMIN_USER_IDS` secret) — **hard blocker** для prod-deploy, см. §7

Когда ручной smoke ок + решён вариант secret'а → дай 🟢 + я делаю commit (или сразу commit + workflow patch одним коммитом, по твоему выбору).
