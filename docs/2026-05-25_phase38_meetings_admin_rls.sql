-- migrations/2026-05-25_phase38_meetings_admin_rls.sql
--
-- NB-RESTORE Phase 2 Part A — RLS unblocker для notebooks/questions admin
-- writes + price column для notebooks.
--
-- Корень задачи: phase 18 ANOM-004 fixup (или последующий patch) снял
-- permissive `WITH CHECK (true)` policies для INSERT/UPDATE/DELETE с
-- notebooks и questions, не оставив admin-only замены. На сегодня
-- (2026-05-25) на этих таблицах есть только SELECT policy. Дельта
-- против recon NB_RESTORE §3 (24-го утверждал WITH CHECK true policies).
-- На cities permissive policies сохранились — patch был точечный.
--
-- Probe: SET ROLE authenticated; INSERT INTO notebooks (...) →
-- "new row violates row-level security policy" — подтверждено
-- (см. RECON_2026-05-25_phase2_notebooks_schema.md §5).
--
-- Это блокирует Phase 2 frontend CRUD (meetings/admin) даже под
-- валидным admin JWT. Эта миграция:
--
--   1) Добавляет колонку price (text NOT NULL DEFAULT '') в notebooks,
--      по решению Ольги D3 от 2026-05-25. Будет отображаться на
--      публичной странице (NotebooksView.tsx правка в Phase 2 Part B).
--      Не блокер — пустые цены безопасны для существующих 3 строк.
--
--   2) Восстанавливает admin-only RLS на write-команды через
--      public.is_admin() — standard Garden pattern (08_meetings_rls,
--      25_app_settings, 26_shop_items, phase28_treasury_mvp).
--      Используется FOR ALL — одна policy на INSERT/UPDATE/DELETE,
--      по решению Ольги от 2026-05-25 (имя policy в plural-singular
--      `notebooks_admin_write` подразумевает все write-команды).
--      SELECT не дублируется этой policy — RLS суммирует permissive
--      через OR; существующий "Allow public read access to notebooks"
--      (USING true) продолжает давать anon-доступ.
--
--   3) Вызывает ensure_garden_grants() в конце транзакции согласно
--      RUNBOOK_garden.md §1.3 — Timeweb managed-Postgres regularly
--      wipes GRANTs после schema-changing миграций (ALTER TABLE
--      попадает в этот класс). Это первый защитный слой; второй —
--      /opt/garden-monitor/check_grants.sh cron.
--
-- Pre-check assertion: предотвращает дубликаты, если apply'д случайно
-- запустят дважды на одном БД. Если notebooks_admin_write или
-- questions_admin_write уже существуют — fail + ROLLBACK.
--
-- Verify-блок: после apply подтверждает что (a) обе новые policies
-- созданы, (b) price колонка добавлена. Fail здесь → ROLLBACK всей
-- транзакции, ничего не запишется.
--
-- ANOM-004 closure: после apply ANOM-004 для notebooks/questions
-- закрыт (admin-only writes через is_admin()). cities остаётся
-- permissive — отдельный таск (Garden FEAT-018, D5 в RECON).
--
-- Apply (через scp + psql под gen_user из /opt/garden-auth/.env):
--
--   scp docs/2026-05-25_phase38_meetings_admin_rls.sql root@5.129.251.56:/tmp/
--   ssh root@5.129.251.56 'set -a && . /opt/garden-auth/.env && set +a && \
--     PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
--     -f /tmp/2026-05-25_phase38_meetings_admin_rls.sql'
--
-- Rollback план (если что-то пошло не так после apply):
--   DROP POLICY notebooks_admin_write ON public.notebooks;
--   DROP POLICY questions_admin_write ON public.questions;
--   ALTER TABLE public.notebooks DROP COLUMN price;
--   SELECT public.ensure_garden_grants();

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- Pre-check: убедиться что миграция ещё не applyлась (avoid duplicate).
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    existing_write_cnt int;
    price_exists       boolean;
BEGIN
    SELECT count(*)
      INTO existing_write_cnt
      FROM pg_policy
     WHERE polrelid IN ('public.notebooks'::regclass, 'public.questions'::regclass)
       AND polcmd <> 'r';  -- not SELECT (anon read policy allowed)

    IF existing_write_cnt > 0 THEN
        RAISE EXCEPTION
          'pre-check failed: % non-SELECT policy(ies) already exist on notebooks/questions; aborting to avoid duplicate. Drop existing manually before re-apply.',
          existing_write_cnt;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'notebooks' AND column_name = 'price'
    ) INTO price_exists;

    IF price_exists THEN
        RAISE EXCEPTION
          'pre-check failed: notebooks.price column already exists; aborting (drop manually if intentional re-apply).';
    END IF;

    RAISE NOTICE 'pre-check passed: no existing write policies, no price column';
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 1. Колонка price (D3, Ольга 2026-05-25).
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.notebooks
  ADD COLUMN price text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.notebooks.price IS
  'Display-only price string (e.g. "1 200 ₽"). Free-form text — frontend rendering responsibility. Empty string = price hidden.';

-- ────────────────────────────────────────────────────────────────────
-- 2. RLS policy: notebooks_admin_write (FOR ALL — INSERT/UPDATE/DELETE).
-- ────────────────────────────────────────────────────────────────────
CREATE POLICY notebooks_admin_write
  ON public.notebooks
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────────────
-- 3. RLS policy: questions_admin_write (FOR ALL — INSERT/UPDATE/DELETE).
-- ────────────────────────────────────────────────────────────────────
CREATE POLICY questions_admin_write
  ON public.questions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────────────
-- 4. RUNBOOK §1.3 — re-apply grants после DDL (защита от Timeweb wipe).
--    Идемпотентная, SECURITY DEFINER, в конце также делает
--    NOTIFY pgrst 'reload schema' (PostgREST подхватит сразу).
-- ────────────────────────────────────────────────────────────────────
SELECT public.ensure_garden_grants();

-- ────────────────────────────────────────────────────────────────────
-- Verify: новые policies созданы + price колонка существует.
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    nb_policy_ok bool;
    q_policy_ok  bool;
    price_ok     bool;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname = 'notebooks_admin_write'
           AND polrelid = 'public.notebooks'::regclass
    ) INTO nb_policy_ok;

    SELECT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname = 'questions_admin_write'
           AND polrelid = 'public.questions'::regclass
    ) INTO q_policy_ok;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'notebooks'
           AND column_name = 'price'
    ) INTO price_ok;

    IF NOT nb_policy_ok THEN
        RAISE EXCEPTION 'verify failed: notebooks_admin_write policy missing after apply';
    END IF;
    IF NOT q_policy_ok THEN
        RAISE EXCEPTION 'verify failed: questions_admin_write policy missing after apply';
    END IF;
    IF NOT price_ok THEN
        RAISE EXCEPTION 'verify failed: notebooks.price column missing after apply';
    END IF;

    RAISE NOTICE 'verify passed: notebooks_admin_write + questions_admin_write + notebooks.price all present';
END $$;

COMMIT;
