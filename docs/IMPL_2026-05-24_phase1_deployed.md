# IMPL DEPLOYED — NB-RESTORE Phase 1: admin route scaffold

**Дата:** 2026-05-24
**Тип:** deploy-отчёт. Commit b4734bc..69e348f → main → prod via FTP.
**План:** [IMPL_2026-05-24_phase1_admin_scaffold.md](IMPL_2026-05-24_phase1_admin_scaffold.md)
**Apply:** [IMPL_2026-05-24_phase1_applied.md](IMPL_2026-05-24_phase1_applied.md)

---

## TL;DR

- ✅ **Commit `69e348f`** (6 files, +346/−6) → push origin/main → CI deploy → conclusion=success → prod live
- ✅ **Bundle hashes изменились** (pre `index-CV7cEk1a.js` → post `index-CVEfrnwF.js`) как и должно
- ✅ **3 lazy chunks деплоились на FTP:** `Admin-BD35N_Db.js` (9.0KB), `Login-D7MNHNay.js` (2.5KB), `auth-BAfzGxss.js` (1.5KB)
- ✅ **Critical: secret прошёл** — UUID `85dbefda-...` inlined в задеплоенный `auth` chunk: `new Set("85dbefda-ba8f-4c60-9f22-b3a7acd45b21".split(","))`
- ⏸ **TG алерты — не проверены** (нет доступа). Тебе глянуть окно ~10:00–10:10 МСК

---

## §1 — Commit + push

```
b4734bc..69e348f  main -> main
[main 69e348f] feat(admin): phase 1 — auth-guarded admin scaffold
 6 files changed, 346 insertions(+), 6 deletions(-)
 create mode 100644 src/lib/auth.ts
 create mode 100644 src/pages/Admin.tsx
 create mode 100644 src/pages/Login.tsx
```

Точечный add (5 code + workflow), без `-A`, без `--amend`, без `--force`. Docs ([IMPL_*_admin_scaffold.md](IMPL_2026-05-24_phase1_admin_scaffold.md), [IMPL_*_applied.md](IMPL_2026-05-24_phase1_applied.md), и этот) остались untracked — твой отдельный docs-коммит.

---

## §2 — CI deploy

**Run:** [26388644208](https://github.com/ligacreate/meetings/actions/runs/26388644208)
**Status:** completed
**Conclusion:** success
**Workflow:** Deploy to FTP ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml))

Note: первый Monitor (поллинг через python heredoc) словил PARSE_ERROR — `$status`/`$workflow_runs` в bash-в-double-quoted python collidoval с bash variable expansion. Пересобрал на jq + одинарные кавычки. К моменту второго monitor'а run уже completed — поллинг на первой итерации застал готовый success. Bundle smoke сделан сразу после.

---

## §3 — Bundle hash diff

### index.html (single source of truth для bundle pointers)

| | pre (`b4734bc`) | post (`69e348f`) | diff |
|---|---|---|---|
| JS | `index-CV7cEk1a.js` | `index-CVEfrnwF.js` | **rebuilt** |
| CSS | `index-DqBcd1OJ.css` | `index-Ce-iFV_l.css` | **rebuilt** |
| index.html size | 2009 байт | 2009 байт | identical (только hash в src/href обновился) |

### Main bundle sizes (live FTP)

| Asset | Size | Δ vs pre |
|---|---|---|
| `index-CVEfrnwF.js` | 516,738 байт (504.6 KB raw) | **+1.7 KB** (Suspense wrapper) |
| `index-Ce-iFV_l.css` | 67,465 байт (65.9 KB raw) | +0.07 KB |

Все размеры совпадают с локальным `npm run build` из [IMPL applied §3](IMPL_2026-05-24_phase1_applied.md) — vite детерминирован, CI build = local build.

### Lazy chunks (deployed но НЕ в index.html — догружаются по требованию)

| Chunk | Size on FTP | HTTP | Назначение |
|---|---|---|---|
| `assets/Admin-BD35N_Db.js` | 9,155 байт (8.94 KB) | 200 | Admin page (lazy) |
| `assets/Login-D7MNHNay.js` | 2,481 байт (2.42 KB) | 200 | Login page (lazy) |
| `assets/auth-BAfzGxss.js` | 1,480 байт (1.44 KB) | 200 | Shared auth lib (lazy) |

✅ Все 3 chunk'а доступны на FTP, **но не упомянуты в `<script>`/`<link>` тегах** в `index.html`. Браузер их **не запрашивает** при первой загрузке главной — только когда роутер вызывает lazy import.

---

## §4 — Critical assertion: secret injection в bundle

Это **главная проверка** prod-deploy для Phase 1. Если GitHub secret `VITE_MEETINGS_ADMIN_USER_IDS` не был добавлен или workflow `env:` не прокинул — ты сама не пройдёшь guard. Поэтому грепнул UUID в задеплоенном auth chunk:

```bash
$ curl -sS https://meetings.skrebeyko.ru/assets/auth-BAfzGxss.js | grep -oE 'new Set\("[^"]*"\.split[^)]*\)'
new Set("85dbefda-ba8f-4c60-9f22-b3a7acd45b21".split(",")
```

✅ Vite inline'нул env var в bundle как литерал. Secret прошёл. ALLOWED_ADMIN_IDS будет `Set { "85dbefda-ba8f-4c60-9f22-b3a7acd45b21" }` в runtime. Твой prod аккаунт (id=85dbefda-...) пройдёт guard.

Если бы secret был пуст — было бы `new Set("".split(",")` → пустой Set → никто не прошёл бы. Это не наш случай.

---

## §5 — Prod smoke (ручная проверка)

| # | Сценарий | URL | Ожидание |
|---|---|---|---|
| 1 | Анон | https://meetings.skrebeyko.ru/#/admin (incognito) | Спиннер ≤300ms → редирект на `#/login`, форма видна |
| 2 | Ольга | войти через форму на `#/login` | Редирект на `#/admin`, две вкладки «Блокноты»/«Вопросы» с заглушками |
| 3 | viktorovna | clear localStorage → войти через `#/login` | `#/admin` → «Нет прав» + role «applicant» |
| 4 | Bundle-split | DevTools Network на главной | **Нет** Login/Admin/auth chunks. Только index-CVEfrnwF.js + css |
| 5 | Lazy on demand | DevTools Network → перейти `#/login` | Появляются `Login-D7MNHNay.js` + `auth-BAfzGxss.js` |
| 6 | Hard refresh | F5 на `#/admin` после логина | Спиннер ≤300ms → сразу админка (token persistent в localStorage) |

CinC 2 сценария ты уже подтвердила локально (anon → login form; admin → AdminPage). На проде то же самое + правильный bundle URL prefix.

---

## §6 — TG алерты

❌ **Не проверил — у меня нет доступа к твоему Telegram.** Окно для проверки: **~10:00–10:10 МСК** (push 09:58Z, deploy ~09:59Z, prod live ~10:01Z).

Если что-то прилетело по push/build/deploy — пришли скрин, разберёмся.

---

## §7 — Что НЕ в этом отчёте

- **Полный E2E с реальными логинами** — нужен браузер. Ольга проверяет вручную (см. §5).
- **Production verification под viktorovna** — не запрашивал creds, ты сама.
- **Phase 2-4** (CRUD, storage) — отдельные итерации.
- **ANOM-004 в Garden** — снят как блокер per trust-model (см. commit message), отдельный low-prio Garden-таск.

---

## §8 — Git state на конец Phase 1

```
$ git log --oneline -3
69e348f feat(admin): phase 1 — auth-guarded admin scaffold
b4734bc chore: remove supabase_meetings bootstrap + actualize env docs
2d416df docs: archive FEAT-002 stage 4 PR body + overflow follow-up

$ git status --short
?? docs/IMPL_2026-05-24_phase1_admin_scaffold.md
?? docs/IMPL_2026-05-24_phase1_applied.md
?? docs/IMPL_2026-05-24_phase1_deployed.md
```

Working tree clean (кроме 3 untracked docs). Branch ahead origin/main на 0 (только что pushed).

---

## §9 — Open items

| # | Что | Когда |
|---|---|---|
| O1 | Ручной prod smoke 3 сценария (см. §5) | сейчас (после твоего сообщения «открыла, работает» можем закрывать Phase 1) |
| O2 | Docs-коммит для трёх IMPL_*.md | по твоему решению — отдельным коммитом, либо к Phase 2 |
| O3 | Phase 2: NotebooksAdmin CRUD | следующая итерация |
| O4 | Phase 3: QuestionsAdmin CRUD + fix DELETE by id | после Phase 2 |
| O5 | Phase 4: Storage refactor (base64 → notebook-images bucket) | после Phase 3 |

---

## Источники

- [IMPL_2026-05-24_phase1_admin_scaffold.md](IMPL_2026-05-24_phase1_admin_scaffold.md) — original plan
- [IMPL_2026-05-24_phase1_applied.md](IMPL_2026-05-24_phase1_applied.md) — apply report
- [RECON_2026-05-24_nb_restore.md](RECON_2026-05-24_nb_restore.md) — recon (parent doc)
- Commit: `69e348f`
- Deploy run: [26388644208](https://github.com/ligacreate/meetings/actions/runs/26388644208)
- Prod: https://meetings.skrebeyko.ru/#/admin
