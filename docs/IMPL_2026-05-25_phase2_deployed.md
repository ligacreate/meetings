# IMPL DEPLOYED — NB-RESTORE Phase 2: notebooks CRUD + public price

**Дата:** 2026-05-25
**Тип:** deploy-отчёт. Commit `aa29617..27c04ed` → main → prod via FTP.
**Plan:** [IMPL_2026-05-25_phase2_notebooks_crud.md](IMPL_2026-05-25_phase2_notebooks_crud.md)
**Apply Part A:** [IMPL_2026-05-25_phase2_partA_applied.md](IMPL_2026-05-25_phase2_partA_applied.md)
**Apply Part B:** [IMPL_2026-05-25_phase2_partB_applied.md](IMPL_2026-05-25_phase2_partB_applied.md)

---

## TL;DR

- ✅ **Commit `27c04ed`** (12 files, +2151/−5) → push origin/main → CI deploy → conclusion=success
- ✅ **Bundle hashes изменились** (pre `index-CVEfrnwF.js` → post `index-QFcNkmD8.js`)
- ✅ **Admin chunk deployed:** `Admin-DRkFBBT0.js` 20540 bytes (под лимитом 30 KB)
- ✅ **Secret injection PASSED:** UUID inlined в `label-CcWkVq9u.js` (vite соединил auth.ts с label primitive в shared chunk)
- ✅ **Main bundle isolated:** 516939 bytes, **нет** UUID, **нет** admin code
- ✅ **Anon SELECT с price колонкой:** 3 rows, price="" (default), все поля видны через PostgREST
- ✅ **Regression test:** anon POST /notebooks → 401/42501 (ANOM-004 closed via Part A)
- ⏸ **TG алерты — не проверены** (нет доступа)

---

## §1 — Commit + push

```
aa29617..27c04ed  main -> main
[main 27c04ed] feat(admin): phase 2 — notebooks CRUD + public price render
 12 files changed, 2151 insertions(+), 5 deletions(-)
 create mode 100644 docs/2026-05-25_phase38_meetings_admin_rls.sql
 create mode 100644 docs/IMPL_2026-05-25_phase2_notebooks_crud.md
 create mode 100644 docs/IMPL_2026-05-25_phase2_partA_applied.md
 create mode 100644 docs/IMPL_2026-05-25_phase2_partB_applied.md
 create mode 100644 docs/RECON_2026-05-25_phase2_garden_migration_diff.md
 create mode 100644 docs/RECON_2026-05-25_phase2_notebooks_schema.md
 create mode 100644 src/components/admin/NotebooksAdminTab.tsx
 create mode 100644 src/lib/notebooks.ts
```

Точечный add (6 code + 6 docs), без `-A`, без `--amend`, без `--force`.

---

## §2 — CI deploy

**Run:** [26402167767](https://github.com/ligacreate/meetings/actions/runs/26402167767)
**Status:** completed
**Conclusion:** success
**Workflow:** Deploy to FTP

`paths-ignore` (docs/** + **/*.md) **не** заглушил deploy — потому что коммит трогает и `src/*` (frontend code). Это правильно: deploy запускается когда любой нон-docs файл изменился. .sql тоже под `docs/**`, не вызвал бы deploy сам по себе.

---

## §3 — Bundle hash diff (FTP-deploy перелил всё)

### index.html (source of truth для bundle pointers)

| | pre (`aa29617`) | post (`27c04ed`) | diff |
|---|---|---|---|
| JS | `index-CVEfrnwF.js` | `index-QFcNkmD8.js` | **rebuilt** |
| CSS | `index-Ce-iFV_l.css` | `index-CXOVI666.css` | **rebuilt** |
| index.html size | 2009 байт | 2009 байт | only `<script src>` + `<link href>` updated |

```diff
-  <script type="module" crossorigin src="/assets/index-CVEfrnwF.js"></script>
-  <link rel="stylesheet" crossorigin href="/assets/index-Ce-iFV_l.css">
+  <script type="module" crossorigin src="/assets/index-QFcNkmD8.js"></script>
+  <link rel="stylesheet" crossorigin href="/assets/index-CXOVI666.css">
```

### Main bundle (live FTP)

| Asset | Size on FTP | Δ vs Phase 1 deploy |
|---|---|---|
| `index-QFcNkmD8.js` | 516,939 bytes (504.8 KiB raw) | **+204 bytes** (NotebooksView price + Index.tsx select fix) |
| `index-CXOVI666.css` | (не fetchил separately — но из local build 68.05 KB) | +0.58 KB (NotebooksAdminTab inline classes) |

Совпадает с локальным `npm run build` из [partB applied §2](IMPL_2026-05-25_phase2_partB_applied.md#L82) — vite детерминирован.

### Lazy chunks (deployed, НЕ в index.html)

| Chunk | Size on FTP | Назначение |
|---|---|---|
| `Admin-DRkFBBT0.js` | **20,540 bytes** (~20 KB) | NotebooksAdminTab + form + AlertDialog + Admin guard |
| `Login-C-BUIqJw.js` | 1,491 bytes (~1.5 KB) | Login form |
| `label-CcWkVq9u.js` | 2,535 bytes (~2.5 KB) | **shared chunk: auth.ts + @radix-ui/react-label** (vite соединил dependencies используемые из обоих lazy entry-points) |

**Verdict:**
- Admin chunk **20 KB** — **под ольгиным лимитом 30 KB** ✅
- Все 3 lazy chunk'а доступны на FTP (HTTP 200)
- Lazy chunks **не упомянуты** в index.html — браузер их **не** загружает на главной

---

## §4 — Critical assertion: secret UUID injected (где?)

В Phase 1 UUID был inlined в отдельный `auth-BAfzGxss.js` chunk. В Phase 2 vite **переорганизовал** chunks (после добавления notebooks.ts) — `auth.ts` слился с `@radix-ui/react-label` в shared `label-CcWkVq9u.js` (оба используются и Login, и Admin → один shared chunk).

```bash
$ for chunk in Admin Login label main; do
    curl -sS .../assets/${chunk}-*.js | grep -c "85dbefda-ba8f-4c60-9f22-b3a7acd45b21"
  done
Admin:  0
Login:  0
label:  1   ← ✅ secret here
main:   0   ← public bundle isolated (no admin secret leakage)
```

✅ Secret прошёл в bundle (label chunk). Phase 1 trust-model сохранён: anon не видит UUID (lazy chunk, не загружается при заходе на главную). Admin/Login lazy-import `auth.ts` → label chunk загрузится только когда юзер пойдёт на `#/admin` или `#/login`.

---

## §5 — Prod smoke (public, curl-level)

### 5.1 Anon SELECT notebooks с новой колонкой price ✅

```bash
$ curl -sS "https://api.skrebeyko.ru/notebooks?select=id,title,price,image_url,pdf_url&order=id.asc"
[{"id":2,"title":"Блокнот в точку","price":"","image_url":"...","pdf_url":"..."},
 {"id":3,"title":"Блокнот в линейку","price":"","image_url":"...","pdf_url":"..."},
 {"id":4,"title":"Tesoro notes","price":"","image_url":"...","pdf_url":"..."}]
```

3 rows, **новая `price` колонка отдаётся** (пустая по дефолту). PostgREST schema cache подхватил колонку благодаря `NOTIFY pgrst 'reload schema'` из `ensure_garden_grants()` в Part A migration.

### 5.2 Regression — anon POST остаётся 401/42501 ✅

```bash
$ curl -sS -i -X POST "https://api.skrebeyko.ru/notebooks" -H "Content-Type: application/json" -d '{"title":"__probe_anon__"...}'
HTTP/2 401
proxy-status: PostgREST; error=42501
www-authenticate: Bearer
```

RLS блокирует. ANOM-004 действует. ✅

---

## §6 — Что НЕ в этом отчёте (твоя зона)

| Item | Кто/когда |
|---|---|
| **E2E browser smoke** на `https://meetings.skrebeyko.ru/#/admin` — login Ольгой, create/edit/delete блокнот, проверить public render с ценой | Ты, в incognito, ~10 мин |
| **DevTools Network проверка bundle-split** — открыть главную, убедиться что `Admin-*.js`/`Login-*.js`/`label-*.js` **не загружаются**; перейти на `#/admin` — увидеть как `Admin-DRkFBBT0.js` и `label-CcWkVq9u.js` догружаются | Ты, опционально |
| **TG алерты** окно ~13:10–13:20 МСК (push 13:11Z, deploy ~13:12Z, prod live ~13:14Z) | Глянь у себя если хочешь |
| **Migration .sql relocate в Garden repo** | Твоя зона (commit в garden_claude/garden/migrations/) |

---

## §7 — Git state на конец Phase 2

```
$ git log --oneline -5
27c04ed feat(admin): phase 2 — notebooks CRUD + public price render
aa29617 docs(phase1): NB-RESTORE Phase 1 implementation log + paths-ignore
69e348f feat(admin): phase 1 — auth-guarded admin scaffold
b4734bc chore: remove supabase_meetings bootstrap + actualize env docs
2d416df docs: archive FEAT-002 stage 4 PR body + overflow follow-up

$ git status --short
?? docs/IMPL_2026-05-25_phase2_deployed.md
```

Working tree clean. Branch синхронен с origin/main. Untracked — только этот deploy-отчёт (твой выбор: commit вместе со следующей итерацией или сейчас).

---

## §8 — Что разблокировано

- ✅ **Ольга может через UI создать/редактировать/удалить блокнот** на `meetings.skrebeyko.ru/#/admin`
- ✅ **Цена отображается на главной** (если заполнена)
- ✅ **ANOM-004 закрыт** для notebooks+questions (даже DevTools-эксплойт через authenticated JWT упадёт RLS)
- ✅ **Phase 3 unblocked** — questions имеет admin-RLS, можно делать CRUD когда захочешь

---

## §9 — Open follow-ups

| # | Что | Когда |
|---|---|---|
| O1 | E2E prod smoke (твоя ручная проверка) | сейчас, после твоего «открыла, работает» Phase 2 закроется |
| O2 | **Phase 3** (QuestionsAdmin CRUD) | следующая итерация |
| O3 | **Phase 4** (Storage refactor — `notebook-images` bucket вместо external URL'ов) | после Phase 3 |
| O4 | ANOM-004 на cities (Garden FEAT-018) | low-priority, отдельный Garden-таск |
| O5 | Migration .sql relocate в `garden/migrations/` | по твоему предпочтению |
| O6 | Bundle-split optimization (manualChunks для main >500KB warning) | tech debt, не блокер |

---

## §10 — Workflow next steps

1. **Ты:** E2E ручной smoke на проде (login + create/edit/delete + public render)
2. **Если ОК:** Phase 2 закрыта, ждём 🟢 для Phase 3
3. **Если баг:** revert commit `27c04ed` через `git revert` (НЕ force-push), или hotfix-коммит — на твой выбор

---

## Источники

- [IMPL_2026-05-25_phase2_partA_applied.md](IMPL_2026-05-25_phase2_partA_applied.md) — Garden migration done
- [IMPL_2026-05-25_phase2_partB_applied.md](IMPL_2026-05-25_phase2_partB_applied.md) — frontend apply done
- Commit `27c04ed`
- Deploy run [26402167767](https://github.com/ligacreate/meetings/actions/runs/26402167767)
- Prod: https://meetings.skrebeyko.ru/#/admin
- live curl probes (2026-05-25)
