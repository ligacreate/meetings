# PR title

```
feat(events): two contact buttons + 404 cleanup (FEAT-002 stage 4)
```

(65 символов, под 70.)

---

# PR body

## Summary

Замена единственной кнопки «Записаться» на карточке встречи на две кнопки контакта с ведущей: **💬 Telegram** (всегда) + **🔵 ВКонтакте** (если у ведущей заполнен `host_vk`). Без оплаты, без слова «Записаться» — клик уводит сразу в личку ведущей.

- Расширил тип `Event` полями `host_telegram: string` + `host_vk: string` (non-optional, non-nullable по contract'у Garden phase 22).
- Добавил `safeHref` helper с whitelist `https://t.me/` + `https://vk.me/` и `URL().protocol === 'https:'` guard. Любой невалидный URL → silent skip кнопки. **Закрывает AUDIT P1-2 (XSS via unvalidated `<a href>`).**
- Pill-стиль в тон `NotebooksView` «Почитать больше»: `bg-secondary` → `bg-primary` на hover, без border, smooth transition 300 ms. Slate-нейтральная палитра по продуктовому решению (без брендовых `#0088CC`/`#0077FF`).
- Бонусом: убрал DEBUG INFO leak с `/#/admin` (показывал `location.pathname` юзеру) — отдельным мелким коммитом `chore(404)`.

## Что закрывает

| Issue | Источник | Описание |
|---|---|---|
| **AUDIT P1-2** | XSS via unvalidated `<a href>` | safeHref с https-whitelist; применён к новым host_telegram/host_vk и historically registration_link; defence-in-depth поверх Garden server-side canonicalization |
| **DEBUG INFO leak** | `/#/admin` показывал `location.pathname` end-юзеру | мелкий `chore(404)` в этом же PR, отдельным коммитом |

Refs: `e3c0bf2` (feat events), `562f0b8` (chore 404).

## Bundle impact

Baseline = main после SEC_PINS merge (`f87dcee`).

| Метрика | baseline | этот PR | Δ |
|---|---|---|---|
| `dist/` total | 664 K | 664 K | 0 (округление) |
| `index.js` raw | 512.23 KB | **513.66 KB** | **+1.43 KB** |
| `index.js` gzip | 165.46 KB | **166.22 KB** | **+0.76 KB** |
| `index.css` | 67.56 KB / gzip 11.71 KB | без изменений | 0 |
| Modules transformed | 2116 | 2116 | 0 (safeHref + VkIcon inline в EventsView, не новые модули) |

## Verification

- ✅ `npx tsc --noEmit -p tsconfig.app.json` — exit 0.
- ✅ `npm run build` — exit 0, 2116 modules transformed in ~3s.
- ✅ **Local UI smoke** — Claude in Chrome 2026-05-06: **12/12 acceptance criteria green**, включая особо проверенные:
  - **E/F** — финальный pill-стиль кнопок (`bg-secondary` → `bg-primary` на hover) совпадает с тоном NotebooksView «Почитать больше».
  - **L** — `/#/admin` чистый, **DEBUG INFO leak убран** (`hasDebugInfo === false` подтверждено живьём).
- ✅ **Re-verify по Garden 2026-05-06 hotfix** (через `curl https://api.skrebeyko.ru/events`):
  - **0/158** events с `http://`-схемой во всей таблице (был 31, после Garden UPDATE ↔ trigger sync_meeting_to_event → 0).
  - **0/18** upcoming events с пустым `host_telegram` — контракт Garden «непустое в 100% после backfill» соблюдён для всех видимых юзерам карточек.
  - **2/18** upcoming events с непустым `host_vk` — VK-кнопка появится у двух карточек, остальные 16 покажут только TG.
- ⏳ **Prod smoke**: pending after FTP-deploy.

## Documentation refs

- [`docs/RECON_2026-05-05_feat002_meetings_buttons.md`](docs/RECON_2026-05-05_feat002_meetings_buttons.md) — RECON для этого этапа, был согласован стратегом ранее в SEC_PINS PR. Реализация в этом PR соответствует §4 (структура карточки + safeHref + контракт Garden) с финальной правкой §4.5 (никакого fallback на `registration_link` — Garden подтвердил 100% backfill, реальность 0/18 upcoming с пустым TG).

Новых doc-файлов в этом PR нет.

## Test plan (для prod smoke после FTP-deploy)

- [ ] `curl -s https://meetings.skrebeyko.ru/` → HTTP 200 + HTML с `<div id="root">`.
- [ ] `curl -s https://meetings.skrebeyko.ru/assets/index-*.js | grep -E "['\"]0000['\"]|['\"]1111['\"]"` → пусто (PIN-ов в проде по-прежнему нет).
- [ ] `curl -s https://meetings.skrebeyko.ru/assets/index-*.js | grep -aoE "host_telegram|host_vk|Telegram|ВКонтакте"` — каждое находится (новые поля и подписи кнопок в bundle).
- [ ] Claude in Chrome визуально на проде:
  - страница рендерится, события грузятся из PostgREST;
  - на карточках встреч **две** кнопки: TG (всегда) + VK (только у тех 2/18, у кого `host_vk` непустой);
  - **pill-стиль**: в покое нейтральный фон → на hover уезжает в primary, плавный 300 ms transition;
  - клик «Telegram» открывает `https://t.me/<u>` в новой вкладке (target=_blank, rel=noopener noreferrer);
  - клик «ВКонтакте» открывает `https://vk.me/<id>` в новой вкладке;
  - mobile (<sm): кнопки stacked column-ом, full width каждая;
  - desktop (sm+): кнопки в row, equal width (`flex-1`);
  - `/#/admin` → страница «Страница не найдена», **без DEBUG INFO блока** (закрытие leak'а из коммита #2);
  - DevTools/Console — без красных ошибок.
- [ ] `npm audit` на свежей сборке прода — **16 vulnerabilities** (без изменений vs SEC_PINS merge).
- [ ] Bundle на проде: `dist/` ≈ 664 K, `index.js` ≈ 513.66 KB / gzip 166.22 KB. Δ vs SEC_PINS base ≈ +1.43 KB raw / +0.76 KB gzip.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
