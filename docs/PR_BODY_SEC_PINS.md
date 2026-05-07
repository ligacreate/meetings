# PR title

```
sec-pins: remove dead admin + mapview
```

(37 символов — короче 70, совпадает с заголовком commit #2.)

---

# PR body

## Summary

Полное удаление мёртвой админки meetings (после verification 2026-05-05: phase 18 в Garden корректно блокирует анонимные write'ы — admin-флоу физически сломан с 2026-05-04, защищать нечего).

- Выпил 7 admin-компонентов + dead MapView + dead lib/postgrest.ts wrapper.
- Удалены 8 npm пакетов (4 mapview/admin + 4 unused-deps Lot #1 из knip).
- Bundle 2.4M → 664K (−73 %), 17 → 16 npm vulns.

## Что закрывает

| Issue | Источник | Описание |
|---|---|---|
| **AUDIT P0-1** | hardcoded PINs `0000`/`1111` в публичном бандле | плотный фикс через выпил админки |
| **AUDIT P1-1** | `setShowAllCities` ReferenceError на «Сбросить» | отдельный коммит `b7dcbf1` |
| **AUDIT P1-4** | дубликат PostgREST-клиента (`lib/postgrest.ts` ↔ inline в Index.tsx) | inline в Index.tsx остался единственной реализацией |
| **AUDIT P1-5** | Mapbox token UI prompt | вместе с MapView |
| **AUDIT P2-2** | мёртвый MapView | удалён |
| **AUDIT P2-8** | dead admin-write code (verification 2026-05-05: POST /notebooks без JWT → 503/401 + 42501) | удалён |
| **npm vuln** | `protocol-buffers-schema` (transitive через `mapbox-gl`) | автоматически после `npm uninstall mapbox-gl` |

Refs: `b7dcbf1` (P1-1), `c4acd8a` (sec-pins), `3abe4e4` (gitignore).

## Bundle impact

| Метрика | main (baseline) | branch (HEAD) | Δ |
|---|---|---|---|
| `dist/` total | 2.4 M | **664 K** | **−1.76 M (−73 %)** |
| `index.js` | 522.47 KB / gzip 168.78 KB | **512.23 KB / gzip 165.46 KB** | −10 KB / −3 KB |
| `index.css` | 75.77 KB / gzip 12.67 KB | **67.56 KB / gzip 11.71 KB** | −8 KB / −1 KB |
| `mapbox-gl.js` | **1663.41 KB / gzip 460.90 KB** | — (chunk gone) | **−1664 KB / −461 KB** |
| `mapbox-gl.css` | 38.63 KB | — | −39 KB |
| `AdminView.js` (lazy) | 91.23 KB | — | −91 KB |
| Modules transformed | 2155 | 2116 | −39 |
| `npm audit` total | 17 | **16** | −1 (`protocol-buffers-schema`) |

## Verification

- ✅ `npx tsc --noEmit -p tsconfig.app.json` — exit 0 (P1-1 закрыт).
- ✅ `npm run build` — exit 0 (built in 3.47s, 2116 modules).
- ✅ Local auto-smoke: dev-сервер старт без stderr; `curl /` → HTML с `<div id="root">`; `grep "['\"]0000['\"]|['\"]1111['\"]"` на `dist/assets/*.js` — пусто; код-walk по правкам в `App.tsx`/`Index.tsx`/`EventsView.tsx` — все админ/MapView/setShowAllCities-references вычищены.
- ✅ Live UI smoke от Claude in Chrome 2026-05-05 — 8/8 acceptance criteria green:
  1. публичная страница рендерится;
  2. календарь работает (переключение месяцев);
  3. фильтр городов работает;
  4. кнопка «Сбросить» — без ErrorBoundary (P1-1 фикс подтверждён живьём);
  5. кнопка «Записаться» открывает TG-ссылку из `registration_link`;
  6. `/#/admin` показывает основную страницу (HashRouter);
  7. DevTools/Console — пусто;
  8. Network — никаких 4xx/5xx кроме нормальной работы PostgREST.
- ⏳ Prod smoke: pending after FTP-deploy.

## Documentation refs

Все 7 doc-файлов — в коммите `c4acd8a`:

| Документ | Описание |
|---|---|
| `docs/SEC_PINS_2026-05-05.md` | план полного выпила админки (Variant A) и acceptance criteria |
| `docs/ARCH_CHECK_meetings_admin_2026-05-05.md` | карта дублирования meetings/admin ↔ Garden, базис для решения «выпиливаем всё» |
| `docs/AUDIT_meetings_2026-05-05.md` | полный AUDIT-001 с severity-сводкой; в этом PR закрыты P0-1, P1-1, P1-4, P1-5, P2-2, P2-8 |
| `docs/NB_RESTORE_PLAN.md` | будущий таск NB-RESTORE (P1, после FEAT-002 этап 4) — три варианта восстановления Notebooks/Questions/Cities админки |
| `docs/RECON_2026-05-05_feat002_meetings_buttons.md` | RECON для будущего этапа 4 FEAT-002 (TG/VK кнопки в карточке) |
| `docs/GARDEN_QA_2026-05-05.md` | ответы Garden-стратегу: каталог 13 write-вызовов + классификация 17 npm vulns |
| `docs/PAUSE_C_KNIP_REPORT_2026-05-05.md` | knip findings (33 шт), три лота с рекомендациями; Лот #1 применён в этом PR |

## Test plan (для prod smoke после FTP-deploy)

- [ ] `curl -s https://meetings.skrebeyko.ru/` → HTTP 200 + HTML с `<div id="root">`.
- [ ] `curl -s https://meetings.skrebeyko.ru/assets/index-*.js | grep -E "['\"]0000['\"]|['\"]1111['\"]"` → пусто (PIN-ов в проде нет).
- [ ] Claude in Chrome визуально:
  - страница рендерится, события грузятся из PostgREST;
  - кнопка «Сбросить» работает без ErrorBoundary (P1-1);
  - кнопка «Записаться» открывает TG-ссылку из `registration_link`;
  - `/admin/` через прямой URL → 200 + главная страница (Apache SPA-fallback переписывает на index.html, React загружает с path «/admin/» без хеша, HashRouter трактует как «/»). PIN-формы НЕТ.
  - `/#/admin` через HashRouter → 200 + страница NotFound (fallback маршрут). PIN-формы НЕТ. Уже подтверждено Claude in Chrome smoke 2026-05-05 (пункт H, 8/8 green).
  - DevTools/Console — без красных ошибок.
- [ ] `npm audit` на проде build — 16 vulnerabilities (was 17), `protocol-buffers-schema` ушёл.
- [ ] Bundle на проде — `dist/` ≈ 664K, `mapbox-gl-*.js` отсутствует.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
