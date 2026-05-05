# Pause C — knip findings + рекомендации

**Дата:** 2026-05-05
**Ветка:** `chore/sec-pins-remove-admin`
**Контекст:** шаг 5 из плана apply [SEC_PINS_2026-05-05.md](SEC_PINS_2026-05-05.md). После шага 4 (`npm uninstall html-to-image file-saver @types/file-saver mapbox-gl`) запущен `npx knip --include dependencies,exports`.
**Whitelist стратега «не трогать»:**
- Тип `Event` со всеми полями, включая будущие `host_telegram` / `host_vk` (расширяются в этапе 4).
- `CACHE_VERSION` константа.
- `registration_link` / `EventsView` events flow / `Index.tsx` events fetch — публичный read.
- `cmdk` (city-фильтр в EventsView).
- shadcn-обёртки в `src/components/ui/` — если сомневаешься, оставляй и помечай «keep, low cost».

---

## Сводка от knip

- **32 unused dependencies** + **1 unused devDependency** в `package.json`.
- **24 unused exports** внутри `src/components/ui/*` и `src/lib/dateUtils.ts`.

Полный текст вывода knip — внизу документа в Приложении.

---

## Категоризация по риску (моя классификация)

### Лот #1 — «безопасно удалить, нулевой риск» (3 dep + 1 devDep)

Пакеты, которые **вообще никем не импортируются** (ни из публичного кода, ни из `ui/*.tsx` обёрток):

| Пакет | Тип | hits | Комментарий |
|---|---|---|---|
| `@hookform/resolvers` | dep | 0 | без файлов-импортёров |
| `date-fns` | dep | 0 | без файлов-импортёров |
| `zod` | dep | 0 | без файлов-импортёров |
| `@tailwindcss/typography` | devDep | 0 | не подключён в `tailwind.config.ts`, не в `src/` |

**Команда:** `npm uninstall @hookform/resolvers date-fns zod @tailwindcss/typography`. Никаких файлов трогать не надо. Закрывает 4 из 33 knip-findings без diff'а в `src/`.

**Моя рекомендация: 🟢 удалить.**

---

### Лот #2 — «удалить с каскадом» (29 пакетов + ~30 ui/-файлов)

Пакеты, которые импортируются **только** мёртвыми ui/-обёртками. Чтобы их безопасно удалить, надо удалить и сами обёртки.

| Группа | Пакет → ui-обёртка |
|---|---|
| Radix без публичных consumers | `@radix-ui/react-accordion` → `accordion.tsx` |
|  | `@radix-ui/react-alert-dialog` → `alert-dialog.tsx` |
|  | `@radix-ui/react-aspect-ratio` → `aspect-ratio.tsx` |
|  | `@radix-ui/react-avatar` → `avatar.tsx` |
|  | `@radix-ui/react-checkbox` → `checkbox.tsx` |
|  | `@radix-ui/react-collapsible` → `collapsible.tsx` |
|  | `@radix-ui/react-context-menu` → `context-menu.tsx` |
|  | `@radix-ui/react-dropdown-menu` → `dropdown-menu.tsx` |
|  | `@radix-ui/react-hover-card` → `hover-card.tsx` |
|  | `@radix-ui/react-label` → `label.tsx`, `form.tsx` |
|  | `@radix-ui/react-menubar` → `menubar.tsx` |
|  | `@radix-ui/react-navigation-menu` → `navigation-menu.tsx` |
|  | `@radix-ui/react-progress` → `progress.tsx` |
|  | `@radix-ui/react-radio-group` → `radio-group.tsx` |
|  | `@radix-ui/react-scroll-area` → `scroll-area.tsx` |
|  | `@radix-ui/react-select` → `select.tsx` |
|  | `@radix-ui/react-separator` → `separator.tsx` |
|  | `@radix-ui/react-slider` → `slider.tsx` |
|  | `@radix-ui/react-switch` → `switch.tsx` |
|  | `@radix-ui/react-tabs` → `tabs.tsx` |
|  | `@radix-ui/react-toggle` → `toggle.tsx` |
|  | `@radix-ui/react-toggle-group` → `toggle-group.tsx` |
| Другие deps | `embla-carousel-react` → `carousel.tsx` |
|  | `input-otp` → `input-otp.tsx` |
|  | `react-day-picker` → `calendar.tsx` |
|  | `react-hook-form` → `form.tsx` |
|  | `react-resizable-panels` → `resizable.tsx` |
|  | `recharts` → `chart.tsx` |
|  | `vaul` → `drawer.tsx` |
| Каскад внутри ui/ | `sidebar.tsx` зависит от sheet/skeleton/separator/input/button/tooltip — sidebar в публичной части не используется, можно удалять вместе со sheet/skeleton/separator/input |
|  | `pagination.tsx` зависит от `button.tsx` (нужный) — pagination сам мёртвый, button оставляем |

#### Реально живые ui/-обёртки (используются публикой или транзитивно)

- `badge` (EventsView) ✅
- `button` (NotFound + транзитивно: pagination/alert-dialog/calendar/carousel) ✅
- `command` (EventsView) ✅
- `dialog` (через command — `import { Dialog, DialogContent }` в `command.tsx:7`) ✅ **transitive**
- `lazy-image` (EventsView, NotebooksView) ✅
- `popover` (EventsView) ✅
- `sonner` (App) ✅
- `toast` (App, use-toast.ts, через toaster) ✅
- `toaster` (App) ✅
- `tooltip` (App) ✅

#### Влияние удаления Лота #2 на bundle / audit

- **Bundle (`dist/`):** **0 изменений.** Vite уже tree-shake'ит — после шага 4 чанк собирается только из живых модулей. Подтверждено: `dist/` после шага 4 = 664K, не уменьшится.
- **`node_modules` size:** заметно меньше (CI `npm ci` чуть быстрее).
- **`npm audit`:** возможно уйдёт ещё 1-2 transitive, но большинство сидит в общих пакетах (rollup, vite, eslint deps), от удаления не уйдут.
- **Поддержка:** меньше шума в knip / outdated в будущем; плюс никто случайно не возьмёт мёртвый компонент в новый код.

#### Стоимость удаления Лота #2

- ~30 файлов в `src/components/ui/` удаляются.
- Большой diff (+3000 deletions примерно).
- Рискованные точки: `dialog.tsx` (нужен для command, **не удалять**), `button.tsx` (нужен для NotFound + транзитивно). Если ошибиться — build сломается.
- Реальная польза для конечного пользователя: ноль (bundle не меняется).

#### Три варианта решения по Лоту #2

- **2-A:** удалить через `npm uninstall` 29 пакетов, **не трогая `ui/*.tsx`**. После этого ui-обёртки становятся «висячими»: tsx-файлы существуют, но импортов из node_modules больше нет → IDE кричит, сборка проходит **только пока их никто не импортирует** (сейчас никто).
  - Минус: грязная `ui/` папка с broken IDE-experience.
- **2-B:** удалить пакеты И обёртки разом. Чисто, но ~30 файлов и ~3000 deletions в diff'e — большой шум на ровном месте. Стратег явно сказал «keep, low cost».
- **2-C:** оставить всё как есть. Retain-стратегия для shadcn. Bundle не страдает.

**Моя рекомендация: 🟡 2-C — оставить всё.** Это совпадает с прямой директивой стратега. Пользы для рантайма нет, риска регрессии больше нуля.

---

### Лот #3 — Unused exports внутри ui/ и dateUtils (24 шт)

#### shadcn-обёртки (19 экспортов)

Это именованные exports из shadcn:
- `badgeVariants`, `buttonVariants` (cva-варианты),
- `CommandDialog`, `CommandShortcut` (alt-режимы command-меню),
- `DialogPortal`/`Overlay`/`Close`/`Trigger`/`Header`/`Footer`/`Title`/`Description` (полный Dialog API),
- `ToastAction`, `Tooltip`/`TooltipTrigger`/`TooltipContent` (полный Tooltip API),
- `toast`, `reducer` из `use-toast.ts`,
- `toast` из `sonner.tsx`.

Внутри shadcn это нормально — обёртки выставляют полный API, но текущий код использует подмножество. По директиве «keep, low cost» — **retain**.

#### `src/lib/dateUtils.ts` (5 функций)

- `resolveCityTimeZone`
- `normalizeEventTimeLabel`
- `parseEventDate`
- `formatEventTime`
- `formatEventDateTimeForViewer`

Одна из них (`resolveCityTimeZone`) использовалась в `admin/EventsAdmin.tsx` — сейчас осиротела после удаления админки. По защитному принципу whitelist'а стратега («events flow остаётся, dateUtils не трогать») — рекомендую **retain**: может пригодиться в этапе 4 при работе с TG/VK URL-валидацией и часовыми поясами.

**Моя рекомендация: 🟡 retain все 24 unused exports.** Bundle от них не страдает (tree-shake удаляет неиспользуемые именованные exports на чанк-уровне).

---

## Итоговая рекомендация — что добавить в этот PR

| Лот | Что | Моя рекомендация |
|---|---|---|
| #1 | uninstall `@hookform/resolvers`, `date-fns`, `zod`, `@tailwindcss/typography` | **🟢 удалить** (нулевой риск) |
| #2 | uninstall 29 Radix/прочих deps + ~30 ui/ файлов | **🟡 2-C: не трогать** (low-cost retain, директива стратега) |
| #3 | 24 unused exports в `ui/*` и `dateUtils.ts` | **🟡 retain** (директива стратега) |

Если стратег предпочтёт другой выбор по Лоту #2 (например, 2-A — `npm uninstall` без удаления tsx) — готов сделать; нужны прямые указания.

---

## tsc и build после правок шагов 3-4 + удаления `lib/postgrest.ts` + фикса P1-1

```
$ npx tsc --noEmit -p tsconfig.app.json
(пусто — ошибок нет)

$ npm run build
✓ 2116 modules transformed
✓ built in 2.14s
dist/index.html             1.89 kB
dist/assets/...css        67.56 kB (gzip 12)
dist/assets/...js        512.25 kB (gzip 165)
```

`dist/`: 2.4M (main) → **664K** (текущая ветка), **−73 %**.

---

## Что жду от стратега

1. 🟢 на удаление **Лота #1** (4 пакета через `npm uninstall`)?
2. Решение по **Лоту #2** — A / B / C?
3. Решение по **Лоту #3** — retain или подрезать?

После твоих ответов:
- применяю выбранные правки;
- запускаю шаг 7 (`npm run build`);
- иду в паузу Г с финальными bundle-цифрами.

---

## Приложение А — полный вывод knip

```
$ npx knip --include dependencies,exports

Unused dependencies (32)
@hookform/resolvers              package.json:14:6
@radix-ui/react-accordion        package.json:15:6
@radix-ui/react-alert-dialog     package.json:16:6
@radix-ui/react-aspect-ratio     package.json:17:6
@radix-ui/react-avatar           package.json:18:6
@radix-ui/react-checkbox         package.json:19:6
@radix-ui/react-collapsible      package.json:20:6
@radix-ui/react-context-menu     package.json:21:6
@radix-ui/react-dropdown-menu    package.json:23:6
@radix-ui/react-hover-card       package.json:24:6
@radix-ui/react-label            package.json:25:6
@radix-ui/react-menubar          package.json:26:6
@radix-ui/react-navigation-menu  package.json:27:6
@radix-ui/react-progress         package.json:29:6
@radix-ui/react-radio-group      package.json:30:6
@radix-ui/react-scroll-area      package.json:31:6
@radix-ui/react-select           package.json:32:6
@radix-ui/react-separator        package.json:33:6
@radix-ui/react-slider           package.json:34:6
@radix-ui/react-switch           package.json:36:6
@radix-ui/react-tabs             package.json:37:6
@radix-ui/react-toggle           package.json:39:6
@radix-ui/react-toggle-group     package.json:40:6
date-fns                         package.json:46:6
embla-carousel-react             package.json:47:6
input-otp                        package.json:49:6
react-day-picker                 package.json:53:6
react-hook-form                  package.json:55:6
react-resizable-panels           package.json:56:6
recharts                         package.json:58:6
vaul                             package.json:62:6
zod                              package.json:63:6

Unused devDependencies (1)
@tailwindcss/typography  package.json:67:6

Unused exports (24)
badgeVariants                 src/components/ui/badge.tsx:29:17
buttonVariants                src/components/ui/button.tsx:47:18
CommandDialog                 src/components/ui/command.tsx:124:3
CommandShortcut               src/components/ui/command.tsx:130:3
DialogPortal                  src/components/ui/dialog.tsx:86:3
DialogOverlay                 src/components/ui/dialog.tsx:87:3
DialogClose                   src/components/ui/dialog.tsx:88:3
DialogTrigger                 src/components/ui/dialog.tsx:89:3
DialogHeader                  src/components/ui/dialog.tsx:91:3
DialogFooter                  src/components/ui/dialog.tsx:92:3
DialogTitle                   src/components/ui/dialog.tsx:93:3
DialogDescription             src/components/ui/dialog.tsx:94:3
toast                         src/components/ui/sonner.tsx:27:19
ToastAction                   src/components/ui/toast.tsx:110:3
Tooltip                       src/components/ui/tooltip.tsx:28:10
TooltipTrigger                src/components/ui/tooltip.tsx:28:19
TooltipContent                src/components/ui/tooltip.tsx:28:35
reducer                       src/hooks/use-toast.ts:71:14
toast                         src/hooks/use-toast.ts:186:20
resolveCityTimeZone           src/lib/dateUtils.ts:105:14
normalizeEventTimeLabel       src/lib/dateUtils.ts:172:14
parseEventDate                src/lib/dateUtils.ts:187:14
formatEventTime               src/lib/dateUtils.ts:213:14
formatEventDateTimeForViewer  src/lib/dateUtils.ts:293:14
```
