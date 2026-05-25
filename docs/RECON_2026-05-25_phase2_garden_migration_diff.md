# RECON — Phase 2 Part A: Garden migration diff (phase38)

**Дата:** 2026-05-25
**Тип:** draft SQL migration + review, **не apply** до 🟢
**SQL-файл:** [`2026-05-25_phase38_meetings_admin_rls.sql`](2026-05-25_phase38_meetings_admin_rls.sql) (рядом, для scp/apply)
**Источник:** RECON_2026-05-25_phase2_notebooks_schema.md §6 решения D1-D3 от Ольги
**Связанные документы:** [RECON_phase2_notebooks_schema.md](RECON_2026-05-25_phase2_notebooks_schema.md), [Garden RUNBOOK §1.3](../../../garden_claude/garden/docs/RUNBOOK_garden.md#L107-L153)

---

## TL;DR

Миграция делает **3 действия в одной транзакции**:
1. `ALTER TABLE notebooks ADD COLUMN price text NOT NULL DEFAULT ''`
2. `CREATE POLICY notebooks_admin_write FOR ALL TO authenticated USING(is_admin()) WITH CHECK(is_admin())`
3. То же для `questions_admin_write`

Плюс RUNBOOK §1.3 — `SELECT public.ensure_garden_grants()` в конце транзакции (Timeweb wipe-protection).

Обёрнуто в `BEGIN/COMMIT` с **pre-check assertion** (защита от двойного apply) и **verify assertion** (защита от silent failure → ROLLBACK).

**Phase:** 38 (следующий после [phase37_pvl_onboarding_atomic.sql](../../../garden_claude/garden/migrations/2026-05-23_phase37_pvl_onboarding_atomic.sql)). Совпадает с твоим предложением.

**ANOM-004 закрывается** для notebooks/questions (cities — отдельно, out of scope D5).

---

## §1 — Что меняем

| # | Действие | Reasoning |
|---|---|---|
| 1 | `ALTER TABLE public.notebooks ADD COLUMN price text NOT NULL DEFAULT '';` | D3 — добавить «цена» (text для гибкости форматирования: «1 200 ₽», «от 990 ₽», «—»). `NOT NULL DEFAULT ''` безопасно для 3 существующих строк (default fills). |
| 2 | `COMMENT ON COLUMN notebooks.price IS '...'` | Documentation для будущих читателей схемы — `price` text-only, рендеринг на фронте. |
| 3 | `CREATE POLICY notebooks_admin_write ... FOR ALL TO authenticated USING(is_admin()) WITH CHECK(is_admin())` | D2(A) — admin-only writes. `FOR ALL` = INSERT/UPDATE/DELETE/SELECT, но существующая permissive SELECT `Allow public read access to notebooks` остаётся → SELECT остаётся public (RLS OR-summing). Одна policy вместо трёх — твоя формулировка `notebooks_admin_write` (singular). |
| 4 | `CREATE POLICY questions_admin_write ... FOR ALL TO authenticated USING(is_admin()) WITH CHECK(is_admin())` | То же для questions. |
| 5 | `SELECT public.ensure_garden_grants();` | RUNBOOK §1.3 — Timeweb-wipe protection после DDL. Function идемпотентна, SECURITY DEFINER, в конце вызывает `NOTIFY pgrst, 'reload schema'` → PostgREST подхватит обе policies + новую колонку **сразу после COMMIT**. |

---

## §2 — Pre-check assertion (защита от двойного apply)

```sql
DO $$
DECLARE
    existing_write_cnt int;
    price_exists       boolean;
BEGIN
    SELECT count(*) INTO existing_write_cnt
      FROM pg_policy
     WHERE polrelid IN ('public.notebooks'::regclass, 'public.questions'::regclass)
       AND polcmd <> 'r';  -- SELECT-policies (anon read) допустимы

    IF existing_write_cnt > 0 THEN
        RAISE EXCEPTION 'pre-check failed: % non-SELECT policy(ies) ...', existing_write_cnt;
    END IF;

    -- + проверка что price колонка ещё не существует
END $$;
```

**Сценарии:**
- ✅ **Чистый apply** (текущий prod state): existing_write_cnt=0, price_exists=false → pass, миграция идёт дальше.
- ❌ **Повторный apply** (если случайно запустят дважды): existing_write_cnt > 0 → `RAISE EXCEPTION` → `ROLLBACK` → ничего не записывается. Сообщение объясняет что делать (DROP existing policies manually).
- ❌ **Конфликт имён** (если кто-то уже создал `notebooks_admin_write` руками): тоже cn > 0 → fail. Это правильно — не молча перезаписать чужую policy.

Это **strict guard** (не idempotent). Альтернатива была бы `DROP POLICY IF EXISTS ... CREATE POLICY`, но это позволяет случайно затереть чужую policy с тем же именем. Strict assertion лучше для первого apply конкретной миграции.

---

## §3 — Verify assertion (защита от silent failure)

```sql
DO $$
DECLARE
    nb_policy_ok bool; q_policy_ok bool; price_ok bool;
BEGIN
    SELECT EXISTS(...) INTO nb_policy_ok;  -- notebooks_admin_write
    SELECT EXISTS(...) INTO q_policy_ok;   -- questions_admin_write
    SELECT EXISTS(...) INTO price_ok;      -- notebooks.price column

    IF NOT nb_policy_ok THEN RAISE EXCEPTION 'verify failed: notebooks_admin_write missing'; END IF;
    -- + 2 similar checks

    RAISE NOTICE 'verify passed: ...';
END $$;
```

**Зачем:** даже если все CREATE POLICY и ALTER TABLE прошли без ERROR, верификация подтверждает что они действительно записались в catalog. На случай странных edge cases с обработкой нотификаций или mid-transaction commit (не должно случаться в PostgreSQL, но cheap insurance).

При fail — `ROLLBACK` всей транзакции, ничего не остаётся.

---

## §4 — Apply процедура

### Команды (как phase37 / RUNBOOK)

```bash
# 1. Копируем SQL на сервер
scp /Users/user/vibecoding/meetings_claude/meetings/docs/2026-05-25_phase38_meetings_admin_rls.sql \
    root@5.129.251.56:/tmp/

# 2. Apply под gen_user (owner) — нужен для CREATE POLICY
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -f /tmp/2026-05-25_phase38_meetings_admin_rls.sql'
```

### Ожидаемый stdout при успешном apply

```
BEGIN
NOTICE:  pre-check passed: no existing write policies, no price column
ALTER TABLE
COMMENT
CREATE POLICY
CREATE POLICY
 ensure_garden_grants
----------------------
 
(1 row)
NOTICE:  verify passed: notebooks_admin_write + questions_admin_write + notebooks.price all present
COMMIT
```

### Если что-то пошло не так

`psql -f` остановится на первом `RAISE EXCEPTION`. Поскольку всё в `BEGIN/COMMIT` — transaction откатится, БД не изменится. Сообщение об ошибке укажет на причину (pre-check duplicate / verify silent failure).

---

## §5 — Post-apply smoke (через psql, не SQL-файл)

После успешного apply — быстрая live verification:

```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
-- Probe 1: applicant НЕ может писать (regression test для ANOM-004)
SET ROLE authenticated;
SET LOCAL request.jwt.claims = $JC$ {\"sub\":\"00000000-0000-0000-0000-000000000000\",\"role\":\"authenticated\"} $JC$;
BEGIN;
INSERT INTO notebooks (title, description) VALUES ('\''__probe_applicant__'\'', '\''should fail'\'');
-- expect: new row violates row-level security policy
ROLLBACK;
RESET ROLE;

-- Probe 2: admin (Ольга) МОЖЕТ писать
SET ROLE authenticated;
SET LOCAL request.jwt.claims = $JC$ {\"sub\":\"85dbefda-ba8f-4c60-9f22-b3a7acd45b21\",\"role\":\"authenticated\"} $JC$;
BEGIN;
INSERT INTO notebooks (title, description) VALUES ('\''__probe_admin__'\'', '\''should succeed'\'') RETURNING id, title;
-- expect: 1 row inserted
ROLLBACK;
RESET ROLE;

-- Probe 3: price колонка читается
SELECT id, title, price FROM notebooks ORDER BY id;
-- expect: 3 rows with price='' (default empty string)
"'
```

Если все три пройдут — Phase 2 Part A полностью закрыт, можно apply'ить Part B (frontend).

---

## §6 — Rollback план

Если после apply обнаружим что-то неожиданное:

```sql
BEGIN;
DROP POLICY notebooks_admin_write ON public.notebooks;
DROP POLICY questions_admin_write ON public.questions;
ALTER TABLE public.notebooks DROP COLUMN price;
SELECT public.ensure_garden_grants();
COMMIT;
```

**Risk при rollback'е:** если Phase 2 Part B (frontend) уже задеплоен и пытается читать `notebooks.price` — получит missing-column 400. План: rollback Part A → откатить Part B в meetings (revert commit) → re-deploy.

Учитывая что Part B зависит от Part A, лучше: rollback **сначала** Part B (revert + deploy), потом Part A SQL.

---

## §7 — Risks

| # | Риск | Mitigation |
|---|---|---|
| R1 | Timeweb wipe GRANTs после ALTER TABLE | `ensure_garden_grants()` в конце transaction (RUNBOOK §1.3). Plus cron `/opt/garden-monitor/check_grants.sh` ловит wipes. |
| R2 | `is_admin()` вернёт false для тебя по какой-то причине | Уже подтвердили твой `profiles.role = 'admin'` (recon §2). При диагностике: `SELECT public.is_admin();` под `SET ROLE authenticated; SET LOCAL request.jwt.claims = ...` |
| R3 | PostgREST не подхватит schema reload | `ensure_garden_grants()` сам делает `NOTIFY pgrst, 'reload schema'`. Если не сработает — ручной reload: `ssh root@... 'docker restart postgrest'` |
| R4 | На повторный apply (случайно) — exception, но **состояние БД может остаться partially applied** | Нет, всё в `BEGIN/COMMIT`. Pre-check assertion срабатывает **до** DDL → ничего не написано. |
| R5 | `gen_user` не имеет прав на CREATE POLICY | `gen_user` — owner таблицы (GRANTs `ALL` в recon §4 включают TRIGGER, REFERENCES — это указывает на owner-level). Если вдруг нет CREATE POLICY — `RAISE EXCEPTION` остановит транзакцию. |
| R6 | ANOM-004 reintroduction в будущем | После apply — добавить в `RUNBOOK_garden.md` правило: «не возвращать permissive RLS на notebooks/questions без архитектурного review». |

---

## §8 — Что **не** входит в эту миграцию (out of scope)

- **cities** — D5, отдельный таск Garden FEAT-018. Сейчас cities имеет permissive `WITH CHECK (true)` на CRUD — anon write blocked GRANT'ами (web_anon только SELECT), authenticated permissive. Тянуть в admin-only — нужно отдельно с проверкой что admin Сада + admin meetings == admin cities (или это разные роли).
- **storage RLS** на `notebook-images` bucket — оригинальные phase 18 / RECON §7 упоминают тоже permissive RLS. Это для Phase 4 (storage refactor).
- **events** — у нас trigger sync с meetings table в Garden, отдельная история, не trogает.
- **переименование pdf_url → purchase_url** — D4 ditched, отдельный refactor.

---

## §9 — Open для обсуждения

| # | Вопрос | Default |
|---|---|---|
| Q1 | `price text NOT NULL DEFAULT ''` — ОК? Альтернативы: `numeric(10,2)` или `text NULL` (без default). | text + DEFAULT '' (твой план) |
| Q2 | Migration файл живёт в `meetings/docs/` или ты сразу копируешь в `garden/migrations/`? | Сейчас в `meetings/docs/2026-05-25_phase38_meetings_admin_rls.sql`. После apply — переместить в Garden repo `migrations/` (твоё решение, я не имею Garden write access). |
| Q3 | Точное имя phase в Garden — `phase38` или другое? | phase38 (после phase37, твоё предложение совпадает). |
| Q4 | Smoke probe в §5 запускать **после** или **вместе** с apply? | Отдельно — apply сначала atomic, потом smoke. |

---

## §10 — Workflow

1. **Сейчас:** твоё ревью этого draft'а + SQL (см. file)
2. **🟢 apply** → я делаю scp + ssh + psql `-f /tmp/...` (или ты, по предпочтению)
3. **Smoke probes** из §5 → ожидаем 3 OK (applicant fails, admin succeeds, price reads)
4. **Перемещение migration файла** в Garden repo (твоя зона)
5. **Дальше:** Phase 2 Part B (frontend) — отдельный 🟢 после Part A apply, draft готовится параллельно

**Estimate Part A:** 5 мин apply + 3 мин smoke = ~10 мин real time после 🟢.
