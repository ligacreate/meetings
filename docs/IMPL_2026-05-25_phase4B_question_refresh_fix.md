# Phase 4B — BUG-MEETINGS-QUESTION-REFRESH fix

**Дата**: 2026-05-26
**Симптом** (из smoke CinC, phase3 deployed §O3): на главной meetings кнопка «Обновить вопрос дня» не меняет вопрос.

---

## §1 — Recon (read-only)

### §1.1 Файл [src/components/ReflectionView.tsx](../src/components/ReflectionView.tsx)
Маленький компонент (73 строки). Ключевые места:

```tsx
// L10
const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

// L12-16 — рандомный старт после загрузки массива
useEffect(() => {
  if (questions.length > 0) {
    setCurrentQuestionIndex(Math.floor(Math.random() * questions.length));
  }
}, [questions.length]);

// L18-24 — handler кнопки
const handleNextQuestion = () => {
  let newIndex = currentQuestionIndex;
  while (newIndex === currentQuestionIndex && questions.length > 1) {
    newIndex = Math.floor(Math.random() * questions.length);
  }
  setCurrentQuestionIndex(newIndex);
};

// L26-28 — guard
if (questions.length === 0) {
  return null;
}

// L55-66 — render через AnimatePresence mode="wait", key={currentQuestionIndex}
```

### §1.2 Где определяется и грузится массив `questions` — [src/pages/Index.tsx:321](../src/pages/Index.tsx#L321)
- `const [questions, setQuestions] = useState<string[]>([])` ([Index.tsx:11](../src/pages/Index.tsx#L11))
- Cache-first: `loadFromCache()` ставит из localStorage (CACHE_VERSION=v5) при наличии ([Index.tsx:184](../src/pages/Index.tsx#L184))
- Затем `loadData()` дёргает PostgREST `/questions?select=question,order_index&order=order_index.asc` и пишет массив строк ([Index.tsx:233-256](../src/pages/Index.tsx#L233-L256))
- Рендер `<ReflectionView questions={questions} />` происходит **только после `setLoading(false)`** ([Index.tsx:304-321](../src/pages/Index.tsx#L304-L321)), т.е. на момент рендера массив уже непустой (с кешем или с сети).
- Гипотеза «массив ещё не загрузился (length 0/1)» **отвергнута**: компонент не рендерится при пустом массиве.

### §1.3 Состояние данных в проде
```
$ curl -s 'https://api.skrebeyko.ru/questions?select=count' -H 'Prefer: count=exact' --head
content-range: 0-0/105
```
Всего **105** записей, при этом среди текстов **104 уникальных**:

```
DUPES:
  [2x] Что бы вам сегодня сказал вы десятилетний? А вы – восьмидесятилетний?
```

Т.е. в БД есть один **дубль текста** на двух разных `id` / `order_index`.

---

## §2 — Repro (Playwright, headless chromium-1217)

Скрипт: [/tmp/repro_question_refresh.py](/tmp/repro_question_refresh.py), [/tmp/repro_rapid.py](/tmp/repro_rapid.py).

### §2.1 Обычный клик (1 секунда между кликами) — ✅ работает
```
SUMMARY: changed in 10/10 clicks
```
Текст всегда меняется на новый. Это **«нормальный» путь пользователя**.

### §2.2 Быстрые клики (50ms между кликами) — ❌ воспроизводится
```
[initial]  'Умеете ли вы «просмеять» любую ситуацию?...'
[click 1]  changed=False
[click 2]  changed=True  → 'Люди будут рассказывать разные истории...'
[click 3]  changed=False
[click 4]  changed=False
[click 5]  changed=False
[click 6]  changed=True  → 'Какие ваши привычки могут привести...'
[click 7]  changed=False
[click 8]  changed=False
[click 9]  changed=False
[click 10] changed=False
[click 11] changed=False
[click 12] changed=True  → 'Сколько любви вы готовы вместить...'
```
Каждый ~4-6 клик «выигрывает» — это совпадает с длительностью `transition.duration = 0.4` (motion.p) + `mode="wait"` у `AnimatePresence`.

### §2.3 Race-condition при reload + immediate click — ✅ работает
3/3 trials: после reload первый клик всегда меняет текст. Никакого race условия между `useEffect`-инициализацией и handler не выявлено.

---

## §3 — Диагноз

Два разных явления, два разных уровня важности:

### §3.1 Главное (P2): дубликаты текста → 2× индекс маппится на один и тот же текст
В DB сейчас 1 пара дублей (см. §1.3). Текущая логика `while (newIndex === currentQuestionIndex)` сравнивает **индексы**, а не **тексты**. Когда `currentQuestionIndex` указывает на одну из двух копий, есть шанс ~`1/uniqueLength` попасть на «близнеца» — индекс другой, текст тот же, пользователь видит «не изменилось». Шанс мал (~1/5500 per click при 1 дубле), но детерминированно увеличивается с числом дублей.

Дубль легко создаётся в админке (Phase 3 questions CRUD), и при наличии 3–4 дублей баг становится регулярным (~1/30 кликов).

### §3.2 Второстепенное (P3): AnimatePresence mode="wait" + быстрые клики
При клике каждые ~50ms framer-motion ещё в exit-фазе предыдущего перехода и визуально показывает старый текст. Это **визуальный артефакт**, не логический баг — состояние React обновляется корректно, рендер motion.p отстаёт.

CinC smoke, скорее всего, кликала быстро и/или ассертила сразу — отсюда симптом «не меняет». Это побочный эффект анимации, **исправлять в этой фазе не будем** — стандартный пользователь успевает увидеть результат.

---

## §4 — Fix (точечный, ~5 строк)

**Стратегия**: дедупликация по тексту в самом компоненте через `useMemo`. Self-contained, не требует изменений в `Index.tsx`. После дедупа `while`-loop гарантированно подбирает другой индекс с другим текстом.

### Diff (proposed) для [src/components/ReflectionView.tsx](../src/components/ReflectionView.tsx)

```diff
-import { useState, useEffect } from 'react';
+import { useEffect, useMemo, useState } from 'react';
 import { RefreshCw, Pencil } from 'lucide-react';
 import { motion, AnimatePresence } from 'framer-motion';

 interface ReflectionViewProps {
   questions: string[];
 }

 const ReflectionView = ({ questions }: ReflectionViewProps) => {
+  const uniqueQuestions = useMemo(
+    () => Array.from(new Set(questions)),
+    [questions]
+  );
   const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

   useEffect(() => {
-    if (questions.length > 0) {
-      setCurrentQuestionIndex(Math.floor(Math.random() * questions.length));
+    if (uniqueQuestions.length > 0) {
+      setCurrentQuestionIndex(Math.floor(Math.random() * uniqueQuestions.length));
     }
-  }, [questions.length]);
+  }, [uniqueQuestions.length]);

   const handleNextQuestion = () => {
+    if (uniqueQuestions.length <= 1) return;
     let newIndex = currentQuestionIndex;
-    while (newIndex === currentQuestionIndex && questions.length > 1) {
-      newIndex = Math.floor(Math.random() * questions.length);
+    while (newIndex === currentQuestionIndex) {
+      newIndex = Math.floor(Math.random() * uniqueQuestions.length);
     }
     setCurrentQuestionIndex(newIndex);
   };

-  if (questions.length === 0) {
+  if (uniqueQuestions.length === 0) {
     return null;
   }

   // … в JSX: questions[currentQuestionIndex] → uniqueQuestions[currentQuestionIndex]
```

И в JSX (L64):
```diff
-              {questions[currentQuestionIndex]}
+              {uniqueQuestions[currentQuestionIndex]}
```

### Почему этот вариант
- **Self-contained**: парент (`Index.tsx`) не трогаем, кеш / сетевой слой как был.
- **Robust к будущим дублям**: админка фазы 3 может создать дубли — компонент устойчив.
- **`uniqueQuestions.length <= 1`** — явный guard, понятнее, чем `&& questions.length > 1` внутри while.
- **Не трогаем анимацию**: §3.2 — отдельная история, не блокер.

### Альтернативы (отвергнуты)
- Дедуп в `Index.tsx` loadData — лишний side-effect на чужом слое; ReflectionView должен быть устойчив к произвольному input.
- Поменять `key={currentQuestionIndex}` → `key={questions[currentQuestionIndex]}`: помогло бы только косвенно (одна и та же текстовая «нить» → один animated mount). После дедупа эта смена не нужна.
- DB-level UNIQUE constraint на `questions.question` — отдельный migration, не входит в scope «точечный patch ~3-5 строк». Можно вынести в follow-up (см. §6).

---

## §5 — Smoke план (local, ручной)

1. `npm run dev` → открыть `http://localhost:8080/`
2. Дождаться загрузки секции «Вопрос дня»
3. Кликнуть кнопку обновления **5 раз** с паузой ~1 сек → каждый раз текст должен меняться
4. (Bonus) В DevTools Console:
   ```js
   // должно остаться 104 уникальных
   new Set(JSON.parse(localStorage.getItem('skrebeyko_questions_cache_v5'))).size
   ```

Опционально — повторить [/tmp/repro_question_refresh.py](/tmp/repro_question_refresh.py) и убедиться, что 10/10 кликов меняют текст (и сравнить с pre-fix состоянием).

---

## §6 — Follow-ups (не входят в Phase 4B)

| ID | Описание | Prio |
|----|----------|------|
| F1 | **DB-UNIQUE на `questions.question`** — миграция + админ-UI feedback при попытке создать дубль (сейчас фаза 3 admin допускает дубль) | P3 |
| F2 | **Удалить существующий дубль в проде** — 2× «Что бы вам сегодня сказал вы десятилетний? А вы – восьмидесятилетний?» (`select id,order_index,question from questions where question = '…'`) | P3 |
| F3 | **AnimatePresence visual lag** при быстрых кликах (§3.2) — либо disable/throttle кнопки во время exit-анимации, либо `mode="popLayout"`. Visual polish, не блокер | P4 |

---

## §7 — Готовность к apply

- [x] Recon
- [x] Repro подтверждён
- [x] Root cause описан
- [x] Fix diff готов
- [ ] **🟢 от пользователя → apply** → local smoke → commit + push
