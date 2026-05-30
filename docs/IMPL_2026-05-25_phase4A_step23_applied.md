# Phase 4A — Steps 2-3 APPLIED: frontend code (no commit/push)

**Дата**: 2026-05-26
**Тип**: code change, без commit/push (жду 🟢 после smoke)
**Связано**: [IMPL_2026-05-25_phase4A_storage_draft.md](IMPL_2026-05-25_phase4A_storage_draft.md), [IMPL_2026-05-25_phase4A_step1.md](IMPL_2026-05-25_phase4A_step1.md)

---

## §1 — Что применено

### §1.1 Новый файл — [src/lib/imageUpload.ts](../src/lib/imageUpload.ts) (~110 LOC)

3 экспортные функции:
- `convertImageToJpegFile(file, maxSize=1200, quality=0.82)` — canvas resize → JPEG `File`
- `signedUploadToStorage(file, folder)` — POST `/storage/sign` (admin JWT) → PUT в Timeweb → возвращает `publicUrl`
- `uploadNotebookImage(rawFile)` — high-level wrapper: resize → upload в `folder='meetings/notebooks'`

Все строки ошибок — на русском (UI-консистентно с остальной meetings/admin).

Использует существующий `getAuthToken()` из `src/lib/auth.ts` (Phase 1 паттерн — `localStorage.getItem('garden_auth_token')`).

### §1.2 Изменения в [src/components/admin/NotebooksAdminTab.tsx](../src/components/admin/NotebooksAdminTab.tsx)

```diff
- import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
+ import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
  …
+ import { uploadNotebookImage } from '@/lib/imageUpload';
```

Новые state hooks:
```tsx
const [uploading, setUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);
```

Новый handler:
```tsx
const handleFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = '';   // сброс — чтобы повторный выбор того же файла триггерил onChange
  if (!file) return;
  setUploading(true);
  setUploadError(null);
  try {
    const url = await uploadNotebookImage(file);
    setField('image_url', url);
  } catch (err) {
    setUploadError(errMsg(err));
  } finally {
    setUploading(false);
  }
};
```

Поле `URL картинки *` заменено на полноценный блок `Картинка блокнота *`:
- `<input type="file" accept="image/*">` — основной вход
- Inline статусы: `Загружаем картинку в хранилище…` / красный `uploadError`
- `<Input type="url">` — fallback (вставить URL вручную), placeholder `…или вставьте URL вручную`
- Preview thumbnail (`w-24 h-32 object-cover`) при наличии `form.image_url`

Кнопки `Сохранить` / `Отмена` теперь дисейблятся пока `uploading`.

`cancelForm()` сбрасывает `uploadError` (чтобы старая ошибка не висела при следующем открытии формы).

### §1.3 Что НЕ тронуто

- `src/lib/imageUtils.ts` (legacy `compressImage`, возвращает base64) — **0 callers** в репо (legacy from SEC_PINS days). Не удалял — out of scope phase 4A; кандидат на отдельный cleanup в follow-up.
- `validateForm` / `isValidUrl(form.image_url)` — без изменений; уже принимает любой https URL, новый Timeweb URL валиден.
- `src/lib/notebooks.ts` (`NotebookInput` type) — не трогал, поле `image_url` остаётся `string`.
- Парент Index.tsx / NotebooksView — не трогал; рендер `<img src={notebook.image_url}>` совместим с Timeweb URLs.

---

## §2 — Build + lint

### §2.1 Build delta

```
$ npm run build
✓ built in 2.33s

Pre-step2-3                       Post                              Δ
Admin-*.js   25.61 kB │  8.48 kB  Admin-*.js  28.38 kB │  9.66 kB  +2.77 kB / +1.18 kB gzip
index-*.js  515.60 kB │ 167.09 kB index-*.js 515.60 kB │ 167.09 kB  0
index.css    68.19 kB │ 11.79 kB  index.css   68.84 kB │ 11.87 kB  +0.65 kB / +0.08 kB gzip
```

Прирост (+2.77 kB raw / +1.18 kB gzip в Admin chunk + ~80 байт CSS на новый file-input style) **меньше изначальной оценки (3-5 KB)**.

`imageUpload.ts` сидит только в Admin chunk (lazy-loaded), главный bundle публичной страницы не вырос.

### §2.2 Lint

```
$ npm run lint
✖ 9 problems (0 errors, 9 warnings)
```

**0 новых ошибок и предупреждений** от наших изменений.

Из 9 warnings:
- 7 — `react-refresh/only-export-components` в `src/components/ui/*` (shadcn-generated, pre-existing)
- 2 — `react-hooks/exhaustive-deps` в `NotebooksAdminTab.tsx:116` и `QuestionsAdminTab.tsx:96` (pre-existing — оба `useEffect(() => { reload(); }, [])` from Phase 2/3)

`src/lib/imageUpload.ts` — clean.

---

## §3 — Local dev server up

```
$ npm run dev
VITE v5.4.19  ready in 226 ms
  ➜ Local:   http://localhost:8080/
  ➜ Network: http://192.168.1.116:8080/, http://10.5.5.2:8080/
```

Готов для CinC smoke. Ольгин логин и токен в localStorage `garden_auth_token` — CinC может либо использовать персистентный профиль браузера, либо заранее сходить через `/auth/login`.

---

## §4 — Smoke план (для CinC)

1. **Login**: открыть `http://localhost:8080/#/admin` → Login → войти как Ольга
2. **Открыть «Блокноты»** → нажать `+ Добавить`
3. **Выбрать тестовый файл** через `<input type="file">` (любой .jpg или .png)
4. Ожидание:
   - Появляется `Загружаем картинку в хранилище…`
   - Через 1-3 сек статус исчезает
   - В поле «URL картинки» автозаполнен URL вида `https://*.twcstorage.ru/<bucket>/meetings/notebooks/<timestamp>-<name>.jpg`
   - Под полем появляется thumbnail-preview
5. **Verification на стороне S3** (через server-side AWS SDK):
   ```bash
   ssh root@5.129.251.56 'cd /opt/garden-auth && set -a && . .env && set +a && node -e "
     const { S3Client, ListObjectsV2Command } = require(\"@aws-sdk/client-s3\");
     const c = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: true,
       credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }});
     c.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: \"meetings/notebooks/\" }))
      .then(r => (r.Contents||[]).forEach(o => console.log(o.Key, o.Size, o.LastModified.toISOString())));
   "'
   ```
   → ожидание: новый файл в `meetings/notebooks/`, размер ~50-200 KB (после resize до 1200px @ 0.82q)
6. **Заполнить остальные поля** (title, description, цена опц., URL покупки) → `Сохранить`
7. **DB verification**:
   ```bash
   curl -s 'https://api.skrebeyko.ru/notebooks?select=id,title,image_url&order=id.desc&limit=1'
   ```
   → ожидание: новый блокнот с `image_url` на `twcstorage.ru`
8. **Public render**: открыть `http://localhost:8080/` → секция «Блокноты издательства» → новый блокнот виден с картинкой

### §4.1 Что должно сломать smoke (для дебага)
- Если CORS preflight 403 → bucket origins applied not yet (но Step 1 уже verified ✅)
- Если `/storage/sign` 401 → токен в localStorage скис, надо relogin
- Если PUT 403 после OK preflight → signature/credentials issue в garden-auth
- Если preview не появляется → URL вернулся некорректный (читать `uploadError` в UI)

---

## §5 — Что осталось

- [x] Step 1 (CORS) ✅
- [x] Step 2 (imageUpload.ts) ✅
- [x] Step 3 (NotebooksAdminTab UI) ✅
- [x] Build + lint clean ✅
- [x] Dev server up (`http://localhost:8080/`)
- [ ] **CinC local smoke** ← waiting on user
- [ ] 🟢 на commit + push
- [ ] Deploy + prod smoke (manual upload через `/admin`)
- [ ] **Step 4 — backfill** 3 старых картинок (после deploy)

---

## §6 — Файлы изменены / добавлены (для будущего commit)

```
A  src/lib/imageUpload.ts                          (new, ~110 LOC)
M  src/components/admin/NotebooksAdminTab.tsx     (+~35 LOC, -~7 LOC)
A  docs/IMPL_2026-05-25_phase4A_storage_draft.md  (uncommitted draft)
A  docs/IMPL_2026-05-25_phase4A_step1.md          (uncommitted)
A  docs/IMPL_2026-05-25_phase4A_step23_applied.md (этот файл)
A  docs/RECON_2026-05-25_phase4A_storage.md       (uncommitted)
```

Без commit/push до 🟢.
