# Phase 4A — Storage refactor для notebook-images, IMPL DRAFT

**Дата**: 2026-05-26
**Тип**: draft, без apply
**Связано**: [RECON_2026-05-25_phase4A_storage.md](RECON_2026-05-25_phase4A_storage.md) (recon, архитектура, Open Questions)

---

## §0 — Pre-flight результат

### §0.1 SSH probe — S3 env keys в `/opt/garden-auth/.env`

```
$ ssh root@5.129.251.56 'grep -oE "^S3_[A-Z_]+=" /opt/garden-auth/.env | sed "s/=$//"'
S3_ACCESS_KEY
S3_BUCKET
S3_ENDPOINT
S3_PUBLIC_URL
S3_REGION
S3_SECRET_KEY
```
Все 6 ключей сконфигурированы. ✅ Backend идентифицирован как **Timeweb Cloud Object Storage** (`twcstorage.ru` — российский managed S3-совместимый storage). Hostname suffix получен через `sed | awk` на сервере; полные URL'ы и креды остались на сервере.

### §0.2 CORS preflight результат

**`auth.skrebeyko.ru/storage/sign`** (Express + `cors({origin:true})`):
```
$ curl -X OPTIONS https://auth.skrebeyko.ru/storage/sign \
  -H "Origin: https://meetings.skrebeyko.ru" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"

HTTP/2 204
access-control-allow-origin: https://meetings.skrebeyko.ru   ✅
access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
access-control-allow-headers: authorization,content-type
access-control-allow-credentials: true
vary: Origin, Access-Control-Request-Headers
```

**Timeweb bucket прямой PUT** (через server-side AWS SDK probe):
```js
GetBucketCorsCommand → CORS rules:
[
  {
    AllowedMethods: ["GET","PUT","HEAD"],
    AllowedOrigins: ["https://liga.skrebeyko.ru"],        ← ❌ только Garden
    AllowedHeaders: ["*"],
    ExposeHeaders:  ["ETag"],
    MaxAgeSeconds:  3000
  }
]
```
**🚧 BLOCKER**: AllowedOrigins не содержит `https://meetings.skrebeyko.ru`. CORS preflight для PUT от meetings → 403.

Доказательство, что у Garden flow рабочий (бакет активен):
```
avatars/1771915191032-IMG_2482.jpg     81 KB   2026-02-24
avatars/1771916827364-IMG_8186.jpg    260 KB   2026-02-24
... (свежие upload'ы от пользователей Garden)
```

**Решение**: добавить `https://meetings.skrebeyko.ru` в `AllowedOrigins`. Делается **один раз** через AWS SDK на bittern сервере (см. §3 Step 1).

---

## §1 — Финальный план

| Решение | Источник |
|---------|----------|
| Backend = **Timeweb Cloud Storage** (`twcstorage.ru`) | Q1, pre-flight |
| Folder = `meetings/notebooks/` | Q2 |
| Auth = `/storage/sign` as-is (любой valid JWT) + frontend gate через `isAllowedAdminId()` UUID allowlist | Q3 |
| Backfill 3 старых картинок в этой же фазе | Q4 |
| Resize 1200px @ 0.82q (canvas, browser-side) | Q5 |
| CORS bucket update обязателен (одноразовая infra-правка) | Pre-flight |

---

## §2 — Архитектура flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ meetings.skrebeyko.ru (NotebooksAdminTab)                           │
│   <input type="file"> → convertImageToJpegFile(1200, 0.82)          │
│                       → signedUploadToStorage(blob, 'meetings/...') │
└──────────┬──────────────────────────────────────────────────────────┘
           │ 1. POST /storage/sign  { folder, fileName, contentType }
           │    Bearer JWT (admin)
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ auth.skrebeyko.ru/storage/sign  (Express + @aws-sdk/s3-presigner)   │
│   authMiddleware verify JWT → presign PUT (300s)                    │
│   returns { uploadUrl, publicUrl }                                  │
└──────────┬──────────────────────────────────────────────────────────┘
           │ 2. PUT uploadUrl  (file body, Content-Type)
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Timeweb Cloud Storage (twcstorage.ru)                               │
│   bucket/meetings/notebooks/<timestamp>-<filename>.jpg              │
│   AllowedOrigins must include https://meetings.skrebeyko.ru         │
└──────────┬──────────────────────────────────────────────────────────┘
           │ 3. publicUrl ← into notebooks.image_url (DB)
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PostgREST /notebooks PATCH (admin JWT)                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## §3 — План имплементации (по шагам)

### Step 1 (infra): bucket CORS — добавить meetings origin

**Где**: bittern сервер (5.129.251.56), используя установленный `@aws-sdk/client-s3` в `/opt/garden-auth`.

**Что делаем** (одноразовый скрипт `scripts/_oneshot_bucket_cors.mjs`, не commit'им):
```js
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
const c = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
});
await c.send(new PutBucketCorsCommand({
  Bucket: process.env.S3_BUCKET,
  CORSConfiguration: {
    CORSRules: [{
      AllowedMethods: ['GET','PUT','HEAD'],
      AllowedOrigins: ['https://liga.skrebeyko.ru', 'https://meetings.skrebeyko.ru'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3000
    }]
  }
}));
console.log('updated');
```
**Verification**: повторный `GetBucketCorsCommand` + `curl -X OPTIONS` с Origin = meetings.skrebeyko.ru должны вернуть 200/204 с `access-control-allow-origin: https://meetings.skrebeyko.ru`.

**Effort**: 5 минут.

---

### Step 2 (новый файл): `src/lib/imageUpload.ts`

Адаптированный паттерн из `garden_claude/garden/services/dataService.js:169-265, 1427-1449`. Размер ~120 LOC.

**Контракт**:
```ts
// src/lib/imageUpload.ts
export const convertImageToJpegFile = (file: File, maxSize?: number, quality?: number): Promise<File>;
export const signedUploadToStorage = (file: File, folder: string): Promise<string>;  // returns publicUrl
export const uploadNotebookImage = (file: File): Promise<string>;  // wrapper: resize → upload to 'meetings/notebooks'
```

**Implementation skeleton**:
```ts
import { getAuthToken } from './auth';

const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'https://auth.skrebeyko.ru';

interface SignResponse {
  uploadUrl: string;
  publicUrl: string;
}

const sanitizeFileName = (raw: string, contentType: string): string => {
  const ext = (contentType.split('/')[1] || 'jpg').toLowerCase();
  const base = raw.replace(/\.[^.]+$/, '')
                  .replace(/[^a-zA-Z0-9_-]/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '')
                  .slice(0, 64) || `image-${Date.now()}`;
  return `${base}.${ext === 'jpeg' ? 'jpg' : ext}`;
};

export const convertImageToJpegFile = (file: File, maxSize = 1200, quality = 0.82): Promise<File> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Формат изображения не поддерживается.'));
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas не доступен.'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Не удалось подготовить картинку.'));
          const name = sanitizeFileName(file.name || `image-${Date.now()}`, 'image/jpeg');
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

export const signedUploadToStorage = async (file: File, folder: string): Promise<string> => {
  const token = getAuthToken();
  if (!token) throw new Error('Требуется авторизация.');

  const contentType = file.type || 'image/jpeg';
  const fileName = sanitizeFileName(file.name || 'image.jpg', contentType);

  const signRes = await fetch(`${AUTH_URL}/storage/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ folder, fileName, contentType }),
  });
  if (!signRes.ok) {
    const text = await signRes.text().catch(() => '');
    throw new Error(`Не удалось получить ссылку для загрузки (${signRes.status}). ${text}`);
  }
  const sign = await signRes.json() as SignResponse;
  if (!sign.uploadUrl || !sign.publicUrl) {
    throw new Error('Сервер вернул некорректные ссылки для загрузки.');
  }

  const putRes = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(`Ошибка загрузки в хранилище (${putRes.status}). ${text}`);
  }

  return sign.publicUrl;
};

export const uploadNotebookImage = async (rawFile: File): Promise<string> => {
  const compressed = await convertImageToJpegFile(rawFile, 1200, 0.82);
  return signedUploadToStorage(compressed, 'meetings/notebooks');
};
```

**Тесты** (manual smoke в админке, см. §4).

---

### Step 3 (UI): file input в `NotebooksAdminTab.tsx`

**Текущее место** ([src/components/admin/NotebooksAdminTab.tsx:213-219](../src/components/admin/NotebooksAdminTab.tsx#L213-L219)):
```tsx
<Field label="URL картинки *" error={errors.image_url}>
  <Input value={form.image_url}
         onChange={(e) => setField('image_url', e.target.value)}
         placeholder="https://..." />
</Field>
```

**Что добавляем** — file input рядом, держим URL input как fallback:
```tsx
<Field label="Картинка блокнота *" error={errors.image_url}>
  <div className="space-y-2">
    <input
      type="file"
      accept="image/*"
      disabled={uploading}
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          setUploading(true);
          setUploadError(null);
          const url = await uploadNotebookImage(file);
          setField('image_url', url);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки');
        } finally {
          setUploading(false);
        }
      }}
    />
    {uploading && <p className="text-sm text-neutral-500">Загружаем картинку…</p>}
    {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
    <Input
      value={form.image_url}
      onChange={(e) => setField('image_url', e.target.value)}
      placeholder="…или вставьте URL вручную"
    />
    {form.image_url && (
      <img src={form.image_url} alt="preview"
           className="w-24 h-24 object-cover rounded border" />
    )}
  </div>
</Field>
```

**Новые state hooks**:
```tsx
const [uploading, setUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);
```

**Frontend admin gate** (Q3): Phase 1 уже гарантирует, что весь Admin route защищён через `isAllowedAdminId()` в `src/pages/Admin.tsx:45`. Поэтому upload UI автоматически виден только администратору. Дополнительной проверки в NotebooksAdminTab не нужно.

**Что НЕ делаем в этом шаге**:
- Drag-and-drop (nice-to-have, можно follow-up)
- Multiple upload (один файл достаточно)
- Image cropper (resize-up-to-1200 хватает)
- Прогресс-бар upload (progress events на fetch PUT сложнее, чем стоит)

---

### Step 4 (backfill): script `scripts/backfill_notebook_images.mjs`

Одноразовый скрипт, запускается локально. Не commit'им (или commit в `scripts/` с пометкой one-shot).

**Что делает**:
1. Принимает admin JWT через env (Ольга копирует из localStorage `garden_auth_token` после login)
2. GET список notebooks из api.skrebeyko.ru — фильтрует те, чей image_url содержит `supabase.co`
3. Для каждого:
   - GET картинку с supabase URL (binary)
   - POST `/storage/sign` с admin JWT → получает `{uploadUrl, publicUrl}`
   - PUT в Timeweb
   - PATCH `notebooks?id=eq.<id>` с новым `image_url`
4. Логирует progress; на ошибке — abort и не PATCH

**Skeleton**:
```js
// scripts/backfill_notebook_images.mjs — one-shot, не часть прода
const AUTH_URL = 'https://auth.skrebeyko.ru';
const API_URL = 'https://api.skrebeyko.ru';
const TOKEN = process.env.ADMIN_JWT;  // export ADMIN_JWT=...
if (!TOKEN) { console.error('Set ADMIN_JWT'); process.exit(1); }

const ALL_HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

const list = await fetch(`${API_URL}/notebooks?select=id,image_url&order=id.asc`)
                .then(r => r.json());
const toMigrate = list.filter(nb => nb.image_url?.includes('supabase.co'));
console.log(`migrating ${toMigrate.length} notebooks`);

for (const nb of toMigrate) {
  const oldUrl = nb.image_url;
  console.log(`\n→ id=${nb.id}  ${oldUrl}`);

  // 1) download from supabase
  const buf = Buffer.from(await (await fetch(oldUrl)).arrayBuffer());
  console.log(`   downloaded ${buf.length} bytes`);

  // 2) sign
  const fileName = oldUrl.split('/').pop();
  const signRes = await fetch(`${AUTH_URL}/storage/sign`, {
    method: 'POST', headers: ALL_HEADERS,
    body: JSON.stringify({ folder: 'meetings/notebooks', fileName, contentType: 'image/jpeg' }),
  }).then(r => r.json());
  console.log(`   signed → ${signRes.publicUrl}`);

  // 3) PUT to Timeweb
  const putRes = await fetch(signRes.uploadUrl, {
    method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: buf,
  });
  if (!putRes.ok) { console.error(`   PUT failed ${putRes.status}`); break; }
  console.log(`   uploaded ✓`);

  // 4) PATCH DB
  const patchRes = await fetch(`${API_URL}/notebooks?id=eq.${nb.id}`, {
    method: 'PATCH', headers: { ...ALL_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ image_url: signRes.publicUrl }),
  });
  if (!patchRes.ok) { console.error(`   PATCH failed ${patchRes.status}`); break; }
  console.log(`   DB updated ✓`);
}
console.log('\ndone.');
```

**Run**:
```bash
# Ольга залогинилась в /admin → DevTools → localStorage.getItem('garden_auth_token') → копирует
export ADMIN_JWT='eyJhbGc...'
node scripts/backfill_notebook_images.mjs
```

**Verification**:
```sql
SELECT id, image_url FROM notebooks ORDER BY id;
-- ожидаем все 3 URL'а на twcstorage.ru, ни одного supabase.co
```

---

### Step 5 (cleanup, не блокер)

После убеждения, что прод сайт рендерит картинки из Timeweb — можно (опционально) удалить старые файлы с external supabase. Но у нас нет туда доступа (чужой проект). **Не делаем.**

---

## §4 — Smoke план

### §4.1 Local
1. `npm run dev` → залогиниться в `/admin` Ольгиной учёткой
2. Открыть «Блокноты» → «Добавить» → выбрать локальный .jpg/.png файл
3. Ожидание: «Загружаем картинку…» → preview появляется → image_url показывает `https://*.twcstorage.ru/...meetings/notebooks/...`
4. Сохранить блокнот → проверить, что на главной (Index) карточка отображается с новой картинкой
5. Если ошибка CORS → значит Step 1 (bucket CORS) не применён или Origin не совпал; проверить headers через DevTools Network → preflight OPTIONS

### §4.2 Prod (после deploy)
1. Open `https://meetings.skrebeyko.ru/#/admin` в incognito
2. Тот же сценарий через https
3. **Доп**: запустить backfill script → проверить, что 3 существующих блокнота получили `image_url` на `twcstorage.ru`
4. Прогон CinC smoke (по аналогии с phase3) — кликнуть/скроллить главную, увидеть 3+ блокнотов с картинками

---

## §5 — Estimate

| Шаг | Время |
|-----|-------|
| Step 1 (bucket CORS) | 10 мин |
| Step 2 (imageUpload.ts) | 30 мин |
| Step 3 (NotebooksAdminTab UI) | 30 мин |
| Step 4 (backfill script + run) | 45 мин |
| Local smoke | 15 мин |
| Commit + push + deploy + prod smoke | 30 мин |
| **Итого** | **~2.5 часа** |

Bundle delta ожидание: **+3-5 KB** (canvas resize + signing/PUT логика, без новых deps).

---

## §6 — Риски

| # | Риск | Митигация |
|---|------|-----------|
| R1 | CORS на бакете не применился / неправильный AllowedOrigins | Step 1 verification через `GetBucketCorsCommand` + curl OPTIONS перед Step 2-3 |
| R2 | Backfill упал на полпути (например, на 2-й картинке) → DB в полу-мигрированном состоянии | Скрипт abort'ит на первой ошибке, не делая PATCH; повторный запуск идемпотентен (фильтрует supabase.co) |
| R3 | Old supabase images станут 404 до backfill → главная сломается | Backfill в той же фазе **до push'а нового кода**? Или сразу после? **Решаем**: deploy frontend → backfill → старые URL остаются рабочими во время миграции (они не удаляются с supabase) |
| R4 | Пользователь загружает огромный .png (10 MB+) → memory pressure в браузере | `convertImageToJpegFile` ресайзит до 1200px, output ≤ ~200 KB; canvas-decode крупного источника ок для современных браузеров |
| R5 | JWT-токен в localStorage может скиснуть посередине upload (30 дней TTL) | `signedUploadToStorage` бросает Error → UI показывает `setUploadError`; Ольга перелогинивается |
| R6 | Содержимое `S3_PUBLIC_URL` отличается от `S3_ENDPOINT` (CDN/origin split) | garden-auth уже это учитывает: `publicUrl = (S3_PUBLIC_URL \|\| S3_ENDPOINT) + '/' + key`. На нашей стороне просто используем `publicUrl` из ответа — без своих допущений |

---

## §7 — Open questions, оставшиеся к review

### QA1 — folder semantics
`folder='meetings/notebooks'` (вложенный путь) пройдёт sanitization в garden-auth?
```js
// server.js:500
const safeFolder = String(folder).replace(/[^a-zA-Z0-9/_-]/g, '');
```
Регулярка разрешает `/` → `'meetings/notebooks'` остаётся как есть ✅. Confirmed по коду.

### QA2 — backfill: keep filenames or rename?
Garden генерирует key как `${folder}/${Date.now()}-${safeName}`. При backfill `fileName` будет `notebook_1770389398240_218.jpg` → итоговый key = `meetings/notebooks/1771xxx-notebook_1770389398240_218.jpg`. Дублирующий timestamp выглядит некрасиво, но безопасно. Альтернатива — переименовать в `notebook-id-2.jpg` и т.п. **Рекомендую оставить безопасный default**, не оптимизировать.

### QA3 — что делать со старыми supabase.co URL в DB до backfill?
Если деплоим frontend до backfill → пользователи продолжают видеть картинки со старого хоста (он жив). Если backfill до деплоя → ничего не сломается, потому что новые URL уже валидны (Timeweb), и старый frontend (читая image_url из DB) поймёт URL как есть. **Безопасный порядок**: code deploy → backfill, либо backfill → code deploy. Оба ok. **Предпочту**: code deploy + manual smoke (upload нового тестового блокнота) → backfill 3-х → prod smoke.

---

## §8 — Готовность к apply

- [x] Recon
- [x] Pre-flight (SSH env keys, CORS state)
- [x] Финальный план (этот документ)
- [ ] **Review Ольгой §3-§7**
- [ ] 🟢 на apply Step 1 (CORS, infra)
- [ ] 🟢 на apply Step 2-3 (code) — local smoke
- [ ] 🟢 на commit + push (frontend) → deploy
- [ ] 🟢 на Step 4 (backfill) — prod smoke

Жду review.
