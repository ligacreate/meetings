# REPORT — fix overflow двух кнопок контакта (FEAT-002 follow-up)

**Дата:** 2026-05-07
**Коммит:** 62cf08d (auto-deployed Deploy to FTP run #4, 46s)
**Связано:** этап 4 FEAT-002 (PR #2, deploy 2026-05-06)

## Симптом
На карточках с обеими кнопками контакта (TG + ВК) кнопка
«ВКонтакте» обрезалась/выходила за правую рамку карточки.
Воспроизводилось на xl (3 колонки 277px) и на грани md.
Дополнительно — у пользователей Яндекс.Браузера/расширений
Translate подпись «Telegram» автоматически переводилась в
«Телеграмма» (с лишней «м»).

## Recon
См. docs/RECON_2026-05-07_feat002_buttons_overflow.md.
Ключевые цифры: карточка xl ≈ 277px, min-content «ВКонтакте»
139–154px, «Telegram» ~80–110px, gap-2 — overflow
гарантирован арифметически. flex-1 не спасает: дефолтный
`min-width: auto` flex-item-а равен min-content слова.

## Решение
Точечный фикс в src/components/EventsView.tsx, три строки:
1. Контейнер кнопок: `flex flex-col sm:flex-row gap-2` →
   `flex flex-col gap-2` (vertical stack всегда).
2. Подпись TG-кнопки: `<span>Telegram</span>` →
   `<span>Телеграм</span>` (кириллица, симметрично с
   «ВКонтакте», заодно гасит авто-перевод).
3. aria-label TG: «...в Telegram» → «...в Телеграм».

CONTACT_BUTTON_CLASS не трогали. Расхождение с брифом этапа 4
(px-5 py-2 vs px-6 py-4 font-bold) — отдельный хвост, в этот
фикс не включён.

## Verification
- tsc + build — exit 0, 513.65 KB JS.
- Auto-deploy через .github/workflows/deploy.yml (FTP) сработал
  штатно, run #4, 46s, зелёный.
- Prod smoke через Claude in Chrome 2026-05-07 — 8/8 PASS:
  bundle-хеш сменился (Zk3XqCO9 → CV7cEk1a), две карточки с
  двумя кнопками найдены, вертикальный стек, «ВКонтакте» не
  обрезана, подписи «Телеграм» на обеих TG-кнопках, клики
  ведут на t.me/vk.me, консоль чистая, layout стабилен и на
  1280px.

## Что НЕ сделано (намеренно)
- Не правили CONTACT_BUTTON_CLASS под бриф этапа 4.
- Не делали глобального replace «Telegram» → «Телеграм» в
  репо (в админке EventsAdmin.tsx и в типах остались
  латинские технические упоминания).
- Не трогали Garden/PostgREST/host_telegram нормализацию.
