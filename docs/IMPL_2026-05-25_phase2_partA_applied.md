# IMPL APPLIED — Phase 2 Part A: Garden migration phase38

**Дата:** 2026-05-25
**Тип:** apply-отчёт. **Серверная Garden migration**, не код meetings — git-коммит не нужен (см. §6).
**Plan:** [RECON_2026-05-25_phase2_garden_migration_diff.md](RECON_2026-05-25_phase2_garden_migration_diff.md)
**SQL:** [2026-05-25_phase38_meetings_admin_rls.sql](2026-05-25_phase38_meetings_admin_rls.sql)

---

## TL;DR

- ✅ **Migration applied successfully** — все 4 шага (ALTER + 2 CREATE POLICY + ensure_garden_grants) прошли в одной транзакции
- ✅ **Pre-check NOTICE:** `pre-check passed: no existing write policies, no price column`
- ✅ **Verify NOTICE:** `verify passed: notebooks_admin_write + questions_admin_write + notebooks.price all present`
- ✅ **3/3 smoke probes passed** — applicant blocked (RLS 42501), admin (Ольга) succeeds, anon SELECT работает с новой колонкой price
- ✅ **ANOM-004 closed** для notebooks + questions (admin-only writes через `is_admin()`)
- ⏭ **Ready for Phase 2 Part B** (frontend) — жду отдельный 🟢

---

## §1 — Apply

### Команды
```bash
scp /Users/user/vibecoding/meetings_claude/meetings/docs/2026-05-25_phase38_meetings_admin_rls.sql \
    root@5.129.251.56:/tmp/

ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f /tmp/2026-05-25_phase38_meetings_admin_rls.sql'
```

### Output (raw psql)
```
BEGIN
DO
ALTER TABLE
NOTICE:  pre-check passed: no existing write policies, no price column
COMMENT
CREATE POLICY
CREATE POLICY
 ensure_garden_grants
----------------------

(1 row)

DO
COMMIT
NOTICE:  verify passed: notebooks_admin_write + questions_admin_write + notebooks.price all present
```

Все 8 expected statements выполнены, оба NOTICE'a отображены, COMMIT прошёл. `ON_ERROR_STOP=1` не сработал (никаких ERROR'ов).

---

## §2 — Smoke probes (после apply)

### Probe 1: applicant НЕ может писать (regression test для ANOM-004) ✅

**Команда:**
```bash
ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '\''{\"sub\":\"00000000-0000-0000-0000-000000000000\",\"role\":\"authenticated\"}'\'';
INSERT INTO notebooks (title, description, price, image_url, pdf_url) VALUES (...);
ROLLBACK;"'
```

(Использован несуществующий UUID `00000000-...` — `is_admin()` возвращает false для любого, кого нет в `profiles.role='admin'`. Это equivalent applicant'у с точки зрения RLS.)

**Output:**
```
BEGIN
SET
SET
ERROR:  new row violates row-level security policy for table "notebooks"
```

✅ **Expected.** RLS заблокировал INSERT для не-admin. ANOM-004 closed.

### Probe 2: admin (Ольга) МОЖЕТ писать ✅

**Команда:**
```bash
SET LOCAL request.jwt.claims = '{"sub":"85dbefda-ba8f-4c60-9f22-b3a7acd45b21","role":"authenticated"}';
INSERT INTO notebooks (title, description, price, image_url, pdf_url) VALUES (
  '__probe_admin__', 'should succeed under is_admin', '100 ₽',
  'https://e.com/i.jpg', 'https://e.com/buy'
) RETURNING id, title, price;
```

**Output:**
```
 id |      title      | price
----+-----------------+-------
  7 | __probe_admin__ | 100 ₽
(1 row)
INSERT 0 1
ROLLBACK
```

✅ **Expected.** Admin прошёл RLS, INSERT успешен, `RETURNING` отдал новую строку с непустой price (text-формат "100 ₽" — то что Phase 2 Part B будет отправлять с фронта). ROLLBACK откатил — БД чиста.

Note: `id=7` означает что серийная последовательность подскочила за счёт rolled-back попыток (probe 1 забрал id=6, и предыдущие recon-INSERT'ы тоже взяли несколько). SERIAL не возвращает значения на ROLLBACK — это безопасно, но первый реальный COMMIT через UI даст id=8 или выше. Не критично.

### Probe 3: anon SELECT с новой колонкой price ✅

**Команда:**
```bash
SET ROLE web_anon;
SELECT id, title, price FROM notebooks ORDER BY id;
RESET ROLE;
```

**Output:**
```
 id |       title       | price
----+-------------------+-------
  2 | Блокнот в точку   |
  3 | Блокнот в линейку |
  4 | Tesoro notes      |
(3 rows)
RESET
```

✅ **Expected.** Anon (web_anon) читает все 3 existing rows, новая колонка `price` присутствует, значение — пустая строка `''` (NOT NULL DEFAULT '' сработал на existing data, postgres рендерит как пустоту). Phase 2 Part B даст Ольге UI чтобы заполнить.

---

## §3 — Что изменилось в БД (cumulative)

| Объект | Состояние ДО | Состояние ПОСЛЕ |
|---|---|---|
| `notebooks.price` | колонка не существовала | `text NOT NULL DEFAULT ''`, COMMENT добавлен, 3 existing rows = `''` |
| `notebooks.notebooks_admin_write` policy | не существовала | `FOR ALL TO authenticated USING(is_admin()) WITH CHECK(is_admin())` |
| `questions.questions_admin_write` policy | не существовала | то же |
| `notebooks.Allow public read access to notebooks` | существовала (USING true) | без изменений (SELECT остаётся public для anon) |
| `questions.Allow public read access to questions` | существовала | без изменений |
| GRANTs на authenticated/web_anon | мог иметь wipe-риск после ALTER | `ensure_garden_grants()` re-применил всё (RUNBOOK §1.3) |
| PostgREST schema cache | старый (без price) | reloaded через `NOTIFY pgrst, 'reload schema'` |

---

## §4 — Live verification после apply (cross-check policies в catalog)

Done implicitly через verify-блок в самой миграции (RAISE NOTICE подтвердил все 3 checks: notebooks_admin_write, questions_admin_write, notebooks.price). Если хочешь дополнительно — можно `\d+ notebooks` и `SELECT polname, polcmd FROM pg_policy WHERE polrelid='public.notebooks'::regclass` через psql.

---

## §5 — Что **не** прошло автоматически (нет, всё прошло)

Никаких warnings, никаких exception'ов, никаких rollbacks. Single-pass apply, all green.

Единственный side-effect: `notebooks_id_seq` подскочил из-за rolled-back probes (id=2,3,4 → next будет id=7+). Безопасно, но первая реальная Ольгина создание блокнота через UI даст id ~8-10. Никакой проблемы — id просто identifier.

---

## §6 — Migration file location

**Сейчас:** `meetings_claude/meetings/docs/2026-05-25_phase38_meetings_admin_rls.sql`

**Логично перенести в:** `garden_claude/garden/migrations/2026-05-25_phase38_meetings_admin_rls.sql`

**Почему не сделал автоматически:** это серверная Garden migration, не meetings frontend код. У git история Garden и meetings разные — лежать в meetings/docs/ — это temporary convenience для apply. Garden конвенция (см. ls `/Users/user/vibecoding/garden_claude/garden/migrations/`) — все миграции с datestamp + phase number прямо в `migrations/`. Twoя зона переноса — я не имею write-access в Garden и не уверен в твоём workflow для cross-repo migrations.

**Если хочешь — могу:**
- Скопировать файл `cp meetings/docs/2026-05-25_phase38_*.sql garden/migrations/` → ты делаешь commit в Garden repo
- Оставить как есть (Garden state authoritative, file — артефакт apply, можно и удалить через год)

Никаких git ops в этом отчёте не делаю — Phase 2 Part A **не требует** commit'a в meetings.

---

## §7 — Что разблокировано

- ✅ **Phase 2 Part B** (frontend NotebooksAdmin CRUD) — теперь PostgREST принимает POST/PATCH/DELETE на notebooks под admin JWT
- ✅ **Phase 3** (QuestionsAdmin) — questions тоже получили admin RLS, можно делать CRUD когда придёт время
- ✅ **ANOM-004 closed** для notebooks/questions — даже если кто-то получит Garden authenticated JWT через DevTools, на /notebooks /questions writes упадут (RLS блок)
- ✅ **`price` column живёт в БД** — Phase 2 Part B может писать/читать без 400 missing-column

---

## §8 — Что ещё открыто (out of scope Phase 2)

- **cities** — оставлены permissive (D5, Garden FEAT-018) → low-priority
- **storage RLS на notebook-images** — Phase 4 (storage refactor)
- **Migration file relocation** в Garden repo — твоя зона (§6)
- **ANOM-004 для cities** — отдельно, не сейчас

---

## §9 — Next step

🟢 **Part B apply** — frontend NotebooksAdmin CRUD по [IMPL_2026-05-25_phase2_notebooks_crud.md](IMPL_2026-05-25_phase2_notebooks_crud.md). 5 файлов + bump CACHE_VERSION. Workflow:
1. Apply (write 5 files + edit Index.tsx CACHE_VERSION)
2. `npm run build` + bundle-split assertion
3. Local `npm run dev` smoke
4. Отчёт `IMPL_phase2_partB_applied.md`
5. 🟢 commit + push → CI deploy → prod smoke

Без commit/push до твоего 🟢.

---

## Источники

- [RECON_2026-05-25_phase2_garden_migration_diff.md](RECON_2026-05-25_phase2_garden_migration_diff.md) — план
- [2026-05-25_phase38_meetings_admin_rls.sql](2026-05-25_phase38_meetings_admin_rls.sql) — applied SQL
- [Garden RUNBOOK §1.3](../../../garden_claude/garden/docs/RUNBOOK_garden.md#L107-L153) — ensure_garden_grants requirement
- Live psql (2026-05-25): apply output + 3 smoke probes
