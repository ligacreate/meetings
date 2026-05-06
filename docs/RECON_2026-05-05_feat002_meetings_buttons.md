# RECON — FEAT-002 этап 4: две кнопки контакта на карточке встречи

**Дата:** 2026-05-05
**Репо:** meetings (meetings.skrebeyko.ru)
**Статус:** разведка, кода не пишем, изменений не применяем
**Зависимость:** apply откладывается до Phase 22 в Garden (поля `events.host_telegram` и `events.host_vk`)

---

## TL;DR

- Кнопка «Записаться» рендерится в **одном месте**: [src/components/EventsView.tsx:497-506](src/components/EventsView.tsx#L497-L506) — это и единственная карточка в проекте (детальной страницы `/meeting/:id` нет).
- Замена — **локальная**: ~20-30 строк. Условный рендер двух `<a>` по `event.host_telegram` (всегда есть после фазы 22) и `event.host_vk` (опционально). Никаких сторов, контекстов, провайдеров трогать не надо.
- Нужно: (1) расширить тип `Event` в [src/types/index.ts](src/types/index.ts) двумя полями; (2) добавить `host_telegram, host_vk` в `?select=` запроса [src/pages/Index.tsx:115](src/pages/Index.tsx#L115); (3) переписать блок кнопок в `EventsView`. Иконки уже есть в `lucide-react` (`MessageCircle` для TG; для VK — `svg` или сторонний компонент, см. п. «Иконки»).

---

## 1. Архитектура чтения events

### 1.1 Стек
- Vite + React 18 + TypeScript, роутинг — `react-router-dom` v6 в `HashRouter` ([src/App.tsx](src/App.tsx)).
- Только два роута: `/` и `/admin` (оба монтируют один `Index`, отличаются пропом `adminMode`). **Детальной страницы встречи нет.**
- UI-кит — shadcn/ui, иконки — `lucide-react`, анимация — `framer-motion`.
- `@tanstack/react-query` подключён в [src/App.tsx:10](src/App.tsx#L10), но **не используется**: фетчинг сделан вручную через `fetch` в `Index.tsx`. Кеш — `localStorage` (Stale-While-Revalidate своими руками, версия `v3`).

### 1.2 Где формируется запрос events
Файл: [src/pages/Index.tsx:105-134](src/pages/Index.tsx#L105-L134), функция `fetchAllEvents()`.

Текущий `?select=`:

```ts
// Index.tsx:115
select: 'id, garden_id, title, description, date, time, city, source_timezone, location, speaker, category, registration_link, price, image_gradient, image_url, image_focus_x, image_focus_y, created_at',
```

Пагинация — постранично по 50 ([Index.tsx:106-129](src/pages/Index.tsx#L106-L129)) с `count=exact` на первой странице. Сортировка `id.asc`, потом ре-сорт по `date` на клиенте.

### 1.3 Транспорт
Анонимный `fetch` без JWT и без заголовков:

```ts
// src/lib/postgrest.ts:9-27
const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'https://api.skrebeyko.ru';
const headers: HeadersInit = {};
if (options.body !== undefined) headers['Content-Type'] = 'application/json';
// ничего про Authorization — читает как web_anon
```

`Index.tsx` использует свой собственный inline-`postgrestFetch` ([Index.tsx:28-53](src/pages/Index.tsx#L28-L53)) — **дубль** того, что в `lib/postgrest.ts`. Запрос идёт на `https://api.skrebeyko.ru/events?select=...`.

Обработка ошибок: 3 ретрая с экспоненциальной задержкой (`2000 * attempt`), `setTimeout`-таймаут 15с на весь параллельный батч ([Index.tsx:226-313](src/pages/Index.tsx#L226-L313)). 401/403 явно не обрабатываются — попадают в общий `catch` и кидают тост.

### 1.4 Тип Event
Файл: [src/types/index.ts:1-19](src/types/index.ts#L1-L19).

```ts
export interface Event {
    id: number;
    garden_id?: number | null;
    title: string;
    date: string;
    time: string;
    city: string;
    source_timezone?: string | null;
    category: string;
    description: string;
    location: string;
    speaker: string;
    registration_link?: string;   // ← ЭТА ПОЛЯ ИСПОЛЬЗУЕТСЯ КАК TG
    price?: string;
    image_url?: string;
    image_gradient?: string;
    image_focus_x?: number | null;
    image_focus_y?: number | null;
}
```

После phase 22 нужно добавить (см. контракт от стратега 2026-05-05 в §4.5):
```ts
host_telegram: string;   // required в БД, в типе тоже non-optional
host_vk: string;         // пустая строка = «у ведущей нет VK», VK-кнопка не рендерится
```

---

## 2. Точное место карточки

**Единственный файл:** [src/components/EventsView.tsx:402-510](src/components/EventsView.tsx#L402-L510).

Карточка рендерится в `filteredEvents.map(...)` внутри `motion.div` (lines 403-509). Текущий блок CTA:

```tsx
// EventsView.tsx:492-507
<div className="mt-auto pt-4 flex flex-col w-full gap-4 border-t border-slate-100">
  <div className="text-xl font-semibold text-slate-900">
    {event.price || 'Бесплатно'}
  </div>

  {event.registration_link && (
    <a
      href={event.registration_link}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full px-6 py-4 rounded-[1.5rem] bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 hover:shadow-primary/30 flex items-center justify-center gap-2"
    >
      Записаться
    </a>
  )}
</div>
```

Других мест отрисовки публичной карточки **нет**:
- Админка [src/components/admin/EventsAdmin.tsx](src/components/admin/EventsAdmin.tsx) — это редактор (форма + список), кнопок «Записаться» там нет.
- Instagram-экспорт [src/components/admin/InstagramExport.tsx](src/components/admin/InstagramExport.tsx) — отдельный канвас 1080×1350, без CTA.
- `MapView` — попап с количеством событий, без кнопок.

---

## 3. Как сейчас построена кнопка

| | |
|---|---|
| **href** | `event.registration_link` напрямую, без валидации |
| **rel** | `noopener noreferrer` ✅ |
| **target** | `_blank` ✅ |
| **рендер** | условный — только если `registration_link` truthy |
| **что при пусто** | блок не показывается вообще, остаётся только цена |
| **валидация формата** | нет — что в БД, то и в `href` |
| **клик-трекинг** | нет (есть Yandex.Metrika в [index.html](index.html#L17-L28) с `trackLinks: true` — фиксирует клики по внешним ссылкам автоматически) |
| **иконка** | нет (просто текст «Записаться») |
| **a11y** | нет `aria-label`; текст и так «Записаться» — приемлемо |

---

## 4. План замены

### 4.1 Изменения в типе [src/types/index.ts](src/types/index.ts)

```ts
export interface Event {
  // ... существующие поля
  host_telegram?: string | null;   // обязательное в БД, но в типе делаем optional на случай старых записей в кеше v3
  host_vk?: string | null;
  // registration_link оставить — нужен для миграции и обратной совместимости кеша; через 1-2 релиза удалить
}
```

### 4.2 Расширить `?select=` в [src/pages/Index.tsx:115](src/pages/Index.tsx#L115)

Добавить `host_telegram, host_vk` в строку select:

```ts
select: 'id, garden_id, title, ..., host_telegram, host_vk, created_at',
```

### 4.3 Заменить блок CTA в [src/components/EventsView.tsx:497-506](src/components/EventsView.tsx#L497-L506)

Псевдокод (без выполнения):

```tsx
import { MessageCircle } from 'lucide-react';
// для VK иконки в lucide-react нет — отдельный inline-svg или компонент

const ContactButton = ({ href, label, brandColor, icon }: ...) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`Написать ведущей в ${label}`}
    className={`flex-1 px-6 py-4 rounded-[1.5rem] text-sm font-bold transition-colors flex items-center justify-center gap-2 text-white`}
    style={{ backgroundColor: brandColor }}
  >
    {icon}
    <span>{label}</span>
  </a>
);

// внутри карточки:
<div className="mt-auto pt-4 flex flex-col w-full gap-4 border-t border-slate-100">
  <div className="text-xl font-semibold text-slate-900">{event.price || 'Бесплатно'}</div>

  <div className="flex flex-col sm:flex-row gap-2">
    {event.host_telegram && (
      <ContactButton
        href={event.host_telegram}
        label="Telegram"
        brandColor="#0088CC"
        icon={<MessageCircle className="w-4 h-4" />}
      />
    )}
    {event.host_vk && (
      <ContactButton
        href={event.host_vk}
        label="ВКонтакте"
        brandColor="#0077FF"
        icon={<VkIcon className="w-4 h-4" />}
      />
    )}
  </div>
</div>
```

Где `VkIcon` — локальный компонент (см. п.5). Цвета согласовать со стратегом — в задании указаны #0088CC / #0077FF, но `bg-primary` сейчас — slate-900; брендовые могут диссонировать с общей сдержанной палитрой.

### 4.4 Cache invalidation
В [src/pages/Index.tsx:144-151](src/pages/Index.tsx#L144-L151) есть `CACHE_VERSION = 'v3'`. Нужно поднять до `v4` — иначе пользователи со старым кешем не увидят `host_telegram/host_vk` до первой успешной загрузки. Существующая логика [Index.tsx:154-169](src/pages/Index.tsx#L154-L169) сама зачистит старые ключи.

### 4.5 ~~Backwards-compat~~ — fallback не нужен (обновлено 2026-05-05)
Garden-стратег зафиксировал контракт: `profiles.telegram` required, `events.host_telegram` непустой в 100% случаев после backfill phase 22. Canonical URLs: `https://t.me/<u>` и `https://vk.me/<id>`.

Соответственно:
- В типе `Event`: `host_telegram: string` (НЕ optional, НЕ nullable).
- В типе `Event`: `host_vk: string` (то же; пустая строка = «у ведущей нет VK»).
- TG-кнопка рендерится **всегда**, без runtime-`if (event.host_telegram)`. Исключение — defence-in-depth XSS-валидация схемы (см. п. 6).
- VK-кнопка: `event.host_vk && event.host_vk !== ''`.
- Никаких fallback на `registration_link`. После этапа 4 поле остаётся в БД ради совместимости старых клиентских кешей (CACHE_VERSION старой версии), но из `?select=` и из нового кода — выпиливается. Через 1-2 релиза после bump кеш-версии — Garden-таск на удаление колонки `events.registration_link`.

---

## 5. Иконки

- Установлено: **`lucide-react@^0.462.0`** ([package.json:53](package.json#L53)).
- Lucide содержит `MessageCircle`, `Send`, `Phone` — но **не содержит** официальной TG-иконки (paper-plane Telegram) и **не содержит** иконки ВКонтакте (это бренд-иконки, не входят в Lucide).
- Варианты:
  - **Inline SVG** прямо в компонент — самый лёгкий, без новых зависимостей. Рекомендуется.
  - `react-icons` — добавит ~50KB к бандлу (есть `FaTelegram`, `FaVk`). Не нужен ради двух иконок.
  - `simple-icons` SVG — официальные бренд-SVG, можно скопировать как inline.
- Брендовые цвета согласно заданию: TG `#0088CC`, VK `#0077FF`.

**Рекомендация:** добавить два маленьких inline-SVG-компонента в `src/components/ui/icons/` (новая папка) — `TelegramIcon.tsx`, `VkIcon.tsx`. Не тащить новую зависимость.

---

## 6. Edge cases

| Случай | Текущее поведение | После замены (план) |
|---|---|---|
| `host_telegram` пуст | (не существует) | fallback на `registration_link` или скрываем блок |
| `host_vk` пуст | — | VK-кнопка не рендерится |
| оба пусты | (не бывает: всегда есть `registration_link`) | блок CTA скрыт целиком |
| невалидный URL (например, `@username` вместо `https://t.me/...`) | href=`@username` ломает навигацию (`<a href="@username">` ведёт на текущий домен) | **нужна нормализация** — см. п. 8 |
| URL с XSS (`javascript:...`) | прямо вставляется в href | **уязвимость** — см. AUDIT |
| 401/403 от PostgREST | общий тост «Ошибка загрузки» | без изменений |
| iOS Safari / TG-внутри-приложения | `target=_blank` иногда блокируется | без изменений (поведение унаследуется) |

---

## 7. Тесты

**В репо тестов нет.** Поиск по `*.test.*`, `*.spec.*`, `vitest`, `jest`, `@testing-library`, `playwright`, `cypress` — пусто. ESLint есть, типы — да.

Вывод: апгрейд можно валидировать только глазами в браузере + смоук на стейджинге.

---

## 8. Открытые вопросы стратегу

1. **Источник правды для нормализации URL.** Garden гарантирует, что `host_telegram` / `host_vk` приходят как `https://t.me/...` / `https://vk.com/...`, или нужно нормализовывать на фронте (превращать `@username` в `https://t.me/username`)? Если на стороне Garden — это требование к phase 22 / триггеру.
2. **Fallback на `registration_link` нужен или нет.** Если phase 22 backfill заполнит все 142/155 events значениями `host_telegram` синхронно с миграцией — fallback не нужен. Если нет — нужен на 1 спринт.
3. **Брендовые цвета vs текущая палитра.** Сейчас весь фронт в slate/white-минимализме (`bg-primary` = slate-900). Telegram-голубой и VK-синий будут выбиваться. Подтвердить, что хотим именно бренд-цвета, или нужны более сдержанные акценты (outline + цветной текст / иконка)?
4. **Что делать с `registration_link` в админке** ([EventsAdmin.tsx:633-643](src/components/admin/EventsAdmin.tsx#L633-L643))? Поле остаётся для совместимости или удаляем? Если удаляем — это уже p23 миграция в Garden. Если оставляем — нужен ли в форме отдельный input для редактирования `host_vk` (или Garden остаётся единственным источником записи)?
5. **Cache version bump до `v4`** — сделать сразу с этапом 4 или отложить (пользователи увидят свежие поля только после первой ре-загрузки)? Рекомендую сделать сразу — всё равно меняем select-строку.

---

## Артефакты, которых не нашёл

- Детальной страницы встречи (`/meeting/:id`) — нет, и не надо: всё в одной карточке списка.
- Тестов — нет.
- Каких-либо CSP / Caddy / Nginx-конфигов в репо — нет, есть только Apache `.htaccess` ([public/.htaccess](public/.htaccess)) с базовым SPA-рерайтом.
- Sentry / любого error reporting — нет, только `console.error` и `toast`.
