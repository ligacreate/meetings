# RECON — overflow двух кнопок контакта (FEAT-002 follow-up)

**Дата:** 2026-05-07
**Контекст:** после деплоя FEAT-002 этап 4 (PR #2, 2026-05-06 13:26 МСК) на
карточках событий с заполненными `host_telegram` и `host_vk` вторая кнопка
(«ВКонтакте») визуально выходит за правый край карточки. На карточках с
одной кнопкой проблемы нет.
**Режим:** READ-ONLY. Никаких правок не вносилось.

---

## A. Layout

### A.1. CONTACT_BUTTON_CLASS — фактический список классов

[src/components/EventsView.tsx:37-43](src/components/EventsView.tsx#L37-L43):

```tsx
const CONTACT_BUTTON_CLASS =
  "flex-1 flex items-center justify-center gap-2 " +
  "px-5 py-2 rounded-full " +
  "bg-secondary hover:bg-primary " +
  "text-secondary-foreground hover:text-primary-foreground " +
  "text-sm font-medium " +
  "transition-all duration-300";
```

Расшифровка:

| класс | значение | эффект |
|---|---|---|
| `flex-1` | `flex: 1 1 0%` | кнопка-flex-item стремится поделить ширину родителя поровну, **но min-width = min-content по умолчанию** (см. A.5) |
| `flex items-center justify-center` | `display: flex; align-items: center; justify-content: center` | сам тег `<a>` — ещё один flex-контейнер: иконка + лейбл по центру |
| `gap-2` | `gap: 0.5rem` (8px) | расстояние между иконкой и текстом внутри кнопки |
| `px-5 py-2` | `padding: 0.5rem 1.25rem` (8px вертикаль, 20px горизонталь × 2 = 40px) | padding пилюли |
| `rounded-full` | `border-radius: 9999px` | пилюля |
| `bg-secondary` / `hover:bg-primary` | CSS-vars из [src/index.css](src/index.css) | neutral-pill в покое, primary при наведении |
| `text-secondary-foreground` / `hover:text-primary-foreground` | то же | контрастный текст |
| `text-sm` | `font-size: 0.875rem` (14px), `line-height: 1.25rem` | мелкий текст |
| `font-medium` | `font-weight: 500` | НЕ `font-bold` — расхождение с гипотезой в брифе |
| `transition-all duration-300` | плавное изменение всех свойств 300ms | ховер-анимация |

> **Важно:** в брифе сказано, что у кнопки `text-sm font-bold` и `px-6 py-4`.
> В коде — `text-sm font-medium` и `px-5 py-2`. Кнопка вдвое тоньше по
> вертикали и чуть уже по горизонтали, чем предполагалось. Это меняет
> арифметику, но не убирает overflow (см. A.4).

### A.2. Контейнер двух кнопок и breakpoint `sm`

[src/components/EventsView.tsx:540](src/components/EventsView.tsx#L540):

```tsx
<div className="flex flex-col sm:flex-row gap-2">
```

- `flex-col` (mobile-first) → кнопки в столбик.
- `sm:flex-row` → переключение в строку.
- `gap-2` → 8px между кнопками.

[tailwind.config.ts](tailwind.config.ts) **не переопределяет** `theme.screens`
— оверрайд `screens` сделан только для утилиты `container`
([tailwind.config.ts:9-15](tailwind.config.ts#L9-L15)). Значит, breakpoint-
утилиты (`sm:`/`md:`/`lg:`/`xl:`) используют **дефолты Tailwind**:

| | min-width |
|---|---|
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | 1536px |

Итого: при viewport ≥ 640px кнопки выстраиваются в строку.

### A.3. Цепочка контейнеров от кнопки до сетки карточек

Снизу вверх:

| уровень | классы | файл:строка |
|---|---|---|
| flex-row кнопок | `flex flex-col sm:flex-row gap-2` | [EventsView.tsx:540](src/components/EventsView.tsx#L540) |
| блок «цена + кнопки» | `mt-auto pt-4 flex flex-col w-full gap-4 border-t border-slate-100` | [EventsView.tsx:527](src/components/EventsView.tsx#L527) |
| контент-зона карточки | `flex-1 flex flex-col px-2 w-full items-start text-left` | [EventsView.tsx:466](src/components/EventsView.tsx#L466) |
| **карточка** | `bg-white rounded-[2.5rem] p-4 ... flex flex-col h-full md:min-h-[44rem]` | [EventsView.tsx:443](src/components/EventsView.tsx#L443) |
| **сетка карточек** | `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8` | [EventsView.tsx:423](src/components/EventsView.tsx#L423) |
| секция events | `space-y-6` | [EventsView.tsx:396](src/components/EventsView.tsx#L396) |
| корень EventsView | `space-y-8` (без width) | [EventsView.tsx:245](src/components/EventsView.tsx#L245) |
| `<main>` MainLayout | `flex-1 w-full max-w-4xl mx-auto px-6 md:px-0 pb-20` | [src/components/layout/MainLayout.tsx:27](src/components/layout/MainLayout.tsx#L27) |

Сетка карточек: **1 / 2 / 2 / 3 колонки** на mobile / md / lg / xl. Между ними
`gap-8` = 32px. Контейнер `<main>` с `max-w-4xl` = **896px**, `mx-auto`,
`px-6` (24px × 2) на mobile, `px-0` от md.

### A.4. Расчёт ширины карточки и кнопки по breakpoint'ам

Внутри карточки доступная ширина для блока кнопок = ширина карточки −
`p-4` (16×2=32px) − `px-2` (8×2=16px) = **ширина_карточки − 48px**.

| viewport | grid cols | main inner | ширина карточки | inner после p-4+px-2 | ширина одной кнопки (с gap-2 между) |
|---|---|---|---|---|---|
| 375px (iPhone) | 1 | 327 (375−48) | 327 | 279 | n/a — кнопки `flex-col` (одна под другой), занимают всю строку |
| 640px (sm) | 1 | 592 | 592 | 544 | (544−8)/2 = **268** |
| 768px (md) | 2 | 768 (px-0 при md) | (768−32)/2 = **368** | 320 | (320−8)/2 = **156** |
| 1024px (lg) | 2 | 896 (max-w-4xl кэп) | (896−32)/2 = **432** | 384 | (384−8)/2 = **188** |
| 1280px (xl+) | **3** | 896 (кэп) | (896−64)/3 ≈ **277** | 229 | (229−8)/2 ≈ **110** |

Минимальный intrinsic-width одной кнопки (контент + padding):

- иконка `w-4 h-4` = 16px
- `gap-2` (внутри кнопки) = 8px
- лейбл «ВКонтакте» (9 символов) при `text-sm` 14px Manrope `font-medium` ≈
  **75–90px** (нужно измерить точно — Manrope шире Inter)
- лейбл «Telegram» (8 символов) при тех же параметрах ≈ **70–80px**
- горизонтальный padding `px-5` = 20+20 = 40px

Итого минимум:
- ВК ≈ 16 + 8 + ~85 + 40 ≈ **~149px** (диапазон 139–154)
- TG ≈ 16 + 8 + ~75 + 40 ≈ **~139px** (диапазон 129–144)

Сравнение с доступной шириной:

| breakpoint | доступно одной кнопке | мин ВК ~149 | мин TG ~139 | overflow? |
|---|---|---|---|---|
| sm (1col) | 268 | ✅ | ✅ | нет |
| md (2col, viewport 768) | 156 | ⚠️ на грани | ✅ | возможно — требует измерения |
| lg (2col, viewport ≥1024) | 188 | ✅ | ✅ | нет |
| **xl (3col, viewport ≥1280)** | **110** | ❌ **−39px** | ❌ **−29px** | **да, обе кнопки шире доступного места, ВК шире → визуально выпирает справа** |

> **Требует измерения в Claude in Chrome:** точная ширина word-glyph
> «ВКонтакте» / «Telegram» в Manrope 14px/500 на проде. Мои оценки
> 75–90px / 70–80px — приближение по средней ширине символа Manrope
> ~0.55–0.65em. Реальное значение нужно снять либо `getBoundingClientRect()`
> через DevTools, либо измерением канвасом. От этого зависит, есть ли
> overflow на md (viewport 768–823px) или только на xl.

Что точно: **на xl breakpoint overflow гарантирован арифметически** — даже
оптимистичная оценка (75px ВК + 16 + 8 + 40 = 139px) > 110px доступных.

### A.5. `flex-1` есть — почему overflow не уходит

В брифе А.5 предполагается, что у кнопки нет `flex-1`. **На самом деле есть**
([EventsView.tsx:38](src/components/EventsView.tsx#L38), первая строка
конкатенации). `flex-1` = `flex: 1 1 0%` (`flex-grow:1; flex-shrink:1;
flex-basis:0%`).

Почему этого недостаточно:

1. По спеке flex-items имеют **`min-width: auto`** по умолчанию. Для
   неперенесимого контента (одно слово «ВКонтакте» без пробелов и без
   `word-break`) `min-width: auto` ≈ **min-content** ≈ ширина самого слова.
2. `flex: 1 1 0%` позволяет кнопке съёжиться **до min-width**, не ниже.
3. Когда сумма min-content всех flex-items + gap > ширина flex-container,
   получается overflow: items занимают свой min-content, лишняя ширина
   уходит за пределы parent. Без `overflow: hidden` на родителе содержимое
   просто визуально вылезает.

Проверка `overflow: hidden`:
- Карточка: `bg-white rounded-[2.5rem] p-4 ...` — **нет** `overflow-hidden`.
- Контент-зона: `flex-1 flex flex-col px-2 w-full ...` — **нет**.
- Блок «цена+кнопки»: `mt-auto pt-4 flex flex-col w-full gap-4 ...` — **нет**.
- Flex-row кнопок: `flex flex-col sm:flex-row gap-2` — **нет**.
- Глобальный CSS на `clean-card` / `event-card-title` —
  [src/index.css:99-129](src/index.css#L99-L129) — **нет**.

Значит: визуально вторая кнопка может рисоваться за правым краем карточки
(за `rounded-[2.5rem]`), не обрезаясь — браузер не клипает по border-radius
без явного `overflow: hidden`. То, что пользователь называет «подрезается»
— это визуальное ощущение «кнопка вышла за тень/корпус карточки», а не
clipping в строгом смысле.

---

## B. Текст «Телеграмма» vs «Telegram»

### B.6. grep по репо

`grep -rn -E "Телеграм|Telegram"` (без `node_modules`, `dist`):

**Источники (`src/`):**
- [src/components/EventsView.tsx:546](src/components/EventsView.tsx#L546): `aria-label="Написать ведущей в Telegram"`
- [src/components/EventsView.tsx:550](src/components/EventsView.tsx#L550): `<span>Telegram</span>`

**Только латиница «Telegram». Кириллических вариантов «Телеграм» / «Телеграмма» в `src/` НЕТ ВООБЩЕ.**

Документация (для справки):
- `docs/AUDIT_meetings_2026-05-05.md`
- `docs/GARDEN_QA_2026-05-05.md`
- `docs/PR_BODY_FEAT002_S4.md`
- `docs/RECON_2026-05-05_feat002_meetings_buttons.md`
- `docs/SEC_PINS_2026-05-05.md`
- `docs/NB_RESTORE_PLAN.md`

В `*.json` / `*.html` / `*.css` — кириллических Телеграм-вариантов **нет**.

### B.7. Проверка prod-бандла

```
$ curl -s https://meetings.skrebeyko.ru/
  → src="/assets/index-Zk3XqCO9.js"

$ curl -sI https://meetings.skrebeyko.ru/assets/index-Zk3XqCO9.js
  HTTP/1.1 200 OK
  Content-Length: 515029
  Last-Modified: Wed, 06 May 2026 10:24:11 GMT   ← 13:24 МСК = совпадает с deploy 13:26
  ETag: "69fb16cb-7dbd5"

$ curl -s https://meetings.skrebeyko.ru/assets/index-Zk3XqCO9.js \
    | grep -aoE "Телеграмм?а?|Telegram" | sort -u
  Telegram
```

В проде в bundled JS — **только `Telegram` (латиница)**. Никакой
«Телеграмма» / «Телеграм» нет. Бандл **не** stale, его mtime совпадает с
указанным в брифе временем деплоя.

Дополнительная проверка кириллических подписей кнопок:

```
$ curl -s https://.../assets/index-Zk3XqCO9.js \
    | grep -aoE "ВКонтакте" | sort -u
  ВКонтакте
```

«ВКонтакте» в бандле есть (как и ожидается из исходника, [EventsView.tsx:562](src/components/EventsView.tsx#L562)).

### B.8. Источник лейбла из Garden API?

[src/types/index.ts:1-21](src/types/index.ts#L1-L21) — у `Event` поля
**только** `host_telegram: string`, `host_vk: string`. Никаких
`host_telegram_label`, `host_vk_label`, `tg_button_text` и подобных нет.

[src/pages/Index.tsx:107](src/pages/Index.tsx#L107) — Supabase `select`
явно перечисляет колонки, и среди них тоже только `host_telegram, host_vk`
(без label-полей).

В JSX лейбл захардкожен:
- `<span>Telegram</span>` ([EventsView.tsx:550](src/components/EventsView.tsx#L550))
- `<span>ВКонтакте</span>` ([EventsView.tsx:562](src/components/EventsView.tsx#L562))

**Подпись кнопки никаким образом не приходит из Garden API.** Она
полностью статична на фронте.

### B-вывод. Откуда «Телеграмма» на скриншоте

Источников «Телеграмма» нет ни в репо, ни в проде. Бандл свежий. Подпись
не приходит из API. Остаются версии за пределами кода:

1. **Авто-перевод браузера** — Яндекс.Браузер по умолчанию переводит
   страницы с английских вкраплений; «Telegram» в русскоязычном
   контексте часто переводится как «Телеграмма». Это самая вероятная
   причина.
2. **Переводящее расширение** — Google Translate, Mate Translate и т.п.
3. **Скриншот сделан на странице, переведённой через right-click → "Перевести"**.

> **Требует уточнения у пользователя:** в каком браузере сделан скриншот,
> включён ли авто-перевод, был ли страница переведена вручную. Если
> подтверждается версия с переводом — это **не баг**, а артефакт клиентской
> среды. Менять подпись «Telegram» → «Телеграм» на стороне фронта — это
> отдельное продуктовое решение (стратегу).

---

## C. Скриншот → причина

Описание со скриншота: средняя по ширине карточка, кнопки **в строке**, ВК
выпирает за правый край. По данным A.4 это значит, что viewport
пользователя ≥ **640px** (sm-row включён) и при этом карточка достаточно
узкая, чтобы две кнопки не помещались.

Сценарии:
- viewport ≥ 1280px (xl) — карточка ~277px (3-col grid). **Гарантированный
  overflow** обоих лейблов; ВК (более длинный) вылезает дальше TG.
- viewport 768–823px (узкий md) — карточка ~368–388px. Возможно overflow,
  если реальная ширина «ВКонтакте» в Manrope 14px/500 ≈ 90px (нужно
  измерить). На грани.

**Почему именно ВК, а не TG, выходит за правый край:**

1. В flex-row порядок DOM = порядок отрисовки: TG слева, ВК справа.
2. Оба flex-item имеют `flex-1` (одинаковый flex-basis 0, одинаковый grow
   и shrink). При нехватке места min-content одного слова держит ширину
   item-а: TG min-content ≈ 139px, ВК min-content ≈ 149px (оценка).
3. Flex-расчёт: общая ширина items + gap > ширина row. Браузер раздаёт
   доступное пространство пропорционально, но **не ниже min-content**.
   Поскольку min-content ВК больше, ВК «толкает» row дальше вправо.
4. Левый край row фиксирован (он привязан к `flex-col` стэку выше). Правый
   край row уходит за пределы parent на величину overflow. Поскольку TG
   слева — он остаётся внутри карточки. ВК справа — он принимает на себя
   весь overflow и визуально торчит за правый край.

В одиночной кнопке (только TG или только ВК) `flex-1` тянет кнопку на всю
ширину parent (max-content ≤ available width при одиночном item, либо при
overflow — single-item не «толкает» себя — он просто overflow один). На
практике одиночная кнопка с лейблом 8–9 символов спокойно влезает даже в
самую узкую карточку (xl: 229px доступно, ~149px нужно), поэтому в этом
сценарии проблемы нет.

> **Требует измерения в Claude in Chrome:**
> 1. Реальная ширина viewport на скриншоте (можно прикинуть по другим
>    элементам — есть/нет 3-колоночная сетка).
> 2. Точная вычисленная ширина «ВКонтакте» / «Telegram» в Manrope 14px/500
>    через `getComputedTextLength()` или DevTools box-model.
> 3. Реальная ширина одной карточки и реальный overflow в пикселях
>    (через DevTools на live-странице).

---

## Открытые вопросы стратегу

1. **На каких breakpoint'ах overflow подтверждён?** На xl (≥1280px) —
   гарантированно по арифметике. На md (768–823px) — возможно, требует
   измерения в браузере. Стратегу решить, чинить ли только xl-кейс или
   на всех breakpoint'ах разом.
2. **«Telegram» vs «Телеграм»** — в коде и в бандле только латиница.
   Скриншот с «Телеграмма» почти наверняка — авто-перевод браузера у
   пользователя. Стратегу:
   а) Подтвердить с пользователем (какой браузер, перевод включён?).
   б) Решить, не стоит ли всё равно русифицировать подпись («Телеграм»),
      чтобы избежать перевода (и тогда лейбл будет управляться нами, а
      не Яндекс-переводчиком).
3. **`overflow: hidden` на карточке?** Сейчас его нет, поэтому
   button-overflow визуально вылезает за `rounded-[2.5rem]`, но не
   клипается. Это вопрос дизайна: показать честный overflow (как сейчас)
   или жёстко обрезать.
4. **Подпись «ВКонтакте» — самое длинное слово.** Если решение будет
   «уменьшить кнопки» (например, только иконки + tooltip), это закроет
   задачу для всех breakpoint'ов разом. Если решение «сохранить лейблы»
   — нужно рассмотреть либо `flex-wrap` на row кнопок, либо переход на
   `flex-col` снова при xl, либо сократить лейбл до «ВК» (что
   неблагозвучно).
5. **`max-w-4xl` на `<main>` (896px) ограничивает grid даже на 4K-мониторах.**
   На xl+ карточек всегда ровно 3 в ряд по ~277px каждая, независимо от
   viewport. Если в будущем `max-w` будет расширен — overflow исчезнет
   сам. Стоит уточнить у стратега, не планируется ли изменение лимита
   ширины контента.

---

**Что НЕ сделано (read-only ограничение):**
- Не запускался dev-сервер, точные пиксельные ширины не измерялись —
  оценки A.4 на основе среднестатистической ширины глифа Manrope.
- Не запускались `npm run build` / `tsc` — это recon, не верификация.
- Не правился ни один файл, кроме этого отчёта.
