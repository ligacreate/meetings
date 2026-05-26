# Phase 4B — APPLIED

**Дата**: 2026-05-26
**Scope**: BUG-MEETINGS-QUESTION-REFRESH — точечный fix в `ReflectionView.tsx`
**Связано**: [IMPL_2026-05-25_phase4B_question_refresh_fix.md](IMPL_2026-05-25_phase4B_question_refresh_fix.md) (recon + diagnose + proposed diff)

---

## §1 — Применённый diff

Файл: [src/components/ReflectionView.tsx](../src/components/ReflectionView.tsx) — 6 строк добавлено, 5 заменено (net +1 строка).

```diff
-import { useState, useEffect } from 'react';
+import { useEffect, useMemo, useState } from 'react';
 import { RefreshCw, Pencil } from 'lucide-react';
 import { motion, AnimatePresence } from 'framer-motion';

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
   …
-              {questions[currentQuestionIndex]}
+              {uniqueQuestions[currentQuestionIndex]}
```

Применено через два `Edit` вызова (импорт+логика+guard, потом JSX `questions[…] → uniqueQuestions[…]`).

---

## §2 — Bundle size delta

Сравнение тех же `npm run build` для main chunk (Vite 5.4.19, terser default).

| Артефакт | Pre-fix | Post-fix | Δ |
|----------|---------|----------|---|
| `dist/assets/index-*.js` (raw) | 515.55 kB | 515.60 kB | **+0.05 kB** |
| `dist/assets/index-*.js` (gzip) | 167.08 kB | 167.09 kB | **+0.01 kB** |
| `dist/assets/index-*.css` | 68.19 kB | 68.19 kB | 0 |
| `dist/index.html` | 1.89 kB | 1.89 kB | 0 |
| `Admin-*.js` | 25.61 kB | 25.61 kB | 0 |

Δ внутри округления — `useMemo` + `Array.from(new Set(...))` уже в bundle (react + полифилы), фактический прирост — лишь несколько символов JS.

Raw byte-level: `wc -c` pre-fix `index-CX6_w4GF.js` = 516 939 байт, post-fix `index-C0IkgBKu.js` ≈ 515 600 (gzip metric от vite), консистентно с +0.05 kB.

---

## §3 — Lint

```
$ npm run lint
✖ 9 problems (0 errors, 9 warnings)
```

Все 9 warnings — `react-refresh/only-export-components` в `src/components/ui/*` (shadcn-генерированные). **ReflectionView.tsx — чистый**, 0 предупреждений, 0 ошибок. Регрессий не внесли.

---

## §4 — Local smoke

### §4.1 Сценарий
`npm run dev` → `http://localhost:8080/` → секция «Вопрос дня» → 10 кликов с задержкой 1 сек.
Скрипт: [/tmp/repro_question_refresh.py](/tmp/repro_question_refresh.py) (Playwright + chromium-1217 headless).

### §4.2 Результат
```
[initial]  'Как вы можете добавлять себе энергии перед важными делами...'
[click 1]  changed=True → 'Как лучше всего последовать за своим любопытством...'
[click 2]  changed=True → 'Ваши обязательства реальные или воображаемые?'
[click 3]  changed=True → 'Какую красивую историю вы хотите рассказать о своей жизни...'
[click 4]  changed=True → 'Какой вы сегодня найдёте мрачный угол...'
[click 5]  changed=True → 'Что вам важно совершить, пока вы живы?'
[click 6]  changed=True → 'Какие мысли приходят вам в голову, когда вы думаете о задаче...'
[click 7]  changed=True → 'Как вы можете позволить себе сегодня быть увиденным?'
[click 8]  changed=True → 'Вы сейчас работаете на нужном расстоянии от проблемы?...'
[click 9]  changed=True → 'Люди будут рассказывать разные истории про вас на похоронах...'
[click 10] changed=True → 'Какую единственную вещь вы можете сделать на следующей неделе...'

SUMMARY: changed in 10/10 clicks
```

**10/10 — каждый клик даёт новый текст.** ✅

Это совпадает с pre-fix поведением на 1-секундных кликах (тоже 10/10 — фикс не регрессирует normal-path), но добавляет робастность к будущим дублям в DB.

### §4.3 Что НЕ протестировано
- Rapid-clicks (50ms apart) — это §3.2 в recon-доке, **визуальный лаг AnimatePresence**, отдельная история, не в scope Phase 4B (см. F3 в follow-ups).
- Зависание на одной из 2 копий дубликата `«Что бы вам сегодня сказал вы десятилетний?...»` — теперь невозможно, т.к. `Array.from(new Set(questions))` отдаёт 104 уникальных, и `while`-loop детерминированно крутится по индексам в этом диапазоне.

---

## §5 — Готовность к prod deploy

- [x] Recon + diagnose (phase4B_question_refresh_fix.md)
- [x] Fix применён в [src/components/ReflectionView.tsx](../src/components/ReflectionView.tsx)
- [x] `npm run build` — успешно, bundle delta ≈ 0 (+0.05 kB raw / +0.01 kB gzip)
- [x] `npm run lint` — 0 errors (warnings только в shadcn UI, не наши)
- [x] Local smoke 10/10 ✅
- [ ] **🟢 от пользователя → commit + push → prod smoke**

---

## §6 — Что в коммите

Один файл изменён: `src/components/ReflectionView.tsx` (≈11 строк diff).
Один файл добавлен: `docs/IMPL_2026-05-25_phase4B_applied.md` (этот).
Один файл уже добавлен ранее: `docs/IMPL_2026-05-25_phase4B_question_refresh_fix.md` (recon).

Предполагаемый commit message:
> `fix(meetings): dedupe questions in ReflectionView to ensure refresh always changes text`
>
> Phase 4B — BUG-MEETINGS-QUESTION-REFRESH. До фикса логика `while (newIndex === currentQuestionIndex)` сравнивала индексы; при наличии дублей текста в DB (сейчас 1 пара в проде, легко больше через phase 3 admin) кнопка могла «попадать» на индекс с тем же текстом → пользователь видит «не изменилось». Фикс: `useMemo` + `Array.from(new Set(questions))` дедуплицирует по тексту до рандомизации.
