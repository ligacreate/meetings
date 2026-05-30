# Phase 4A — Storage refactor для notebook-images, RECON

**Дата**: 2026-05-26
**Тип**: read-only recon, без apply/commit/push
**Триггер**: O1 в [IMPL_2026-05-25_phase3_deployed.md](IMPL_2026-05-25_phase3_deployed.md) — «`rqdsletjyncigvesufqe.supabase.co → собственный bucket для notebook-images`»

---

## §1 — Текущее состояние (что и где живёт)

### §1.1 Изображения 3 блокнотов в проде
```
$ curl -s 'https://api.skrebeyko.ru/notebooks?select=id,title,image_url&order=id.asc'
```
| id | title | image_url host |
|----|-------|----------------|
| 2 | Блокнот в точку | `rqdsletjyncigvesufqe.supabase.co` |
| 3 | Блокнот в линейку | `rqdsletjyncigvesufqe.supabase.co` |
| 4 | Tesoro notes | `rqdsletjyncigvesufqe.supabase.co` |

Все три URL:
```
https://rqdsletjyncigvesufqe.supabase.co/storage/v1/object/public/notebook-images/notebook_<ts>_<rand>.jpg
```

Это **чужой Supabase project** (старый, до миграции на Bittern). Хост отвечает HTTP 200, public read, `content-type: image/jpeg`. **Никакого нашего контроля над этим bucket** — мы не знаем кто платит, какой SLA, можно ли удалять/заменять.

### §1.2 Размер существующих картинок
```
notebook_1770389398240_218.jpg   350 KB
notebook_1770389399450_759.jpg   386 KB
notebook_1770389400521_693.jpg   227 KB
                                 ─────
                                ~960 KB (3 файла)
```
JPEG, ориентировочно 1080-1500px по большей стороне. Если будет 50-100 блокнотов в год — это ≤15 MB на бакет даже без resize. Резизы Garden-стиля (1200px @ 0.82q → 80-200 KB) сократят ещё.

### §1.3 Что в админке сейчас (NotebooksAdminTab)
[src/components/admin/NotebooksAdminTab.tsx:213-217](../src/components/admin/NotebooksAdminTab.tsx#L213-L217):
```tsx
<Field label="URL картинки *" error={errors.image_url}>
  <Input value={form.image_url}
         onChange={(e) => setField('image_url', e.target.value)} … />
```
**Только текстовое поле URL**, валидация `isValidUrl(...) starts with https://`. Никакого upload-флоу. Ольга вручную кладёт ссылки (видимо, на тот же external supabase или куда успеет договориться).

### §1.4 Историческая bucket-миграция (как было задумано изначально)
[`git show 60e8edf:supabase_meetings/20251129054537_*.sql`](https://github.com/ligacreate/meetings/commit/60e8edf):
```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('event-images',    'event-images',    true),
  ('notebook-images', 'notebook-images', true);

CREATE POLICY "Public read access to notebook images"
  ON storage.objects FOR SELECT USING (bucket_id = 'notebook-images');
CREATE POLICY "Admin upload/update/delete notebook images" …
```
Эти миграции были для **Supabase Storage** в старом проекте. С переездом на Bittern + PostgREST — этот код мёртв (`storage.*` extension не подняли).

---

## §2 — Какая инфраструктура у нас сейчас есть для storage

### §2.1 Топология серверов
```
api.skrebeyko.ru          → 5.129.251.56  (Bittern: Caddy + postgrest/14.5)
auth.skrebeyko.ru         → 5.129.251.56  (Bittern: Caddy + Express + S3 client)
meetings.skrebeyko.ru     → 185.162.93.61 (nginx, FTP-deployed SPA — Beget/shared)
izdatelstvo.skrebeyko.ru  → 185.215.4.44  (отдельный сайт издательства)
```

### §2.2 ⭐ Главная находка: на Bittern уже работает signed-upload S3 backend

В `garden-auth/server.js` (бэкенд `auth.skrebeyko.ru`):

```js
// imports
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// config (ENV)
const { S3_REGION, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL } = process.env;
const s3Client = (S3_BUCKET && S3_REGION && S3_ACCESS_KEY && S3_SECRET_KEY)
  ? new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(S3_ENDPOINT),
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY }
    })
  : null;

// endpoint
app.post('/storage/sign', authMiddleware, async (req, res) => {
  const { folder, fileName, contentType } = req.body || {};
  const key = `${safeFolder}/${Date.now()}-${safeName}`;
  const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  const publicUrl = (S3_PUBLIC_URL || S3_ENDPOINT)
    ? `${basePublic}/${key}`
    : uploadUrl.split('?')[0];
  return res.json({ uploadUrl, publicUrl });
});
```

Probe:
```
$ curl -X POST https://auth.skrebeyko.ru/storage/sign -d '{}'    → 401 (Missing token)
$ curl -X POST https://api.skrebeyko.ru/storage/sign  -d '{}'    → 401 (тоже, потому что Caddy форвардит)
```
**Endpoint живой и требует JWT.** `forcePathStyle: Boolean(S3_ENDPOINT)` → если `S3_ENDPOINT` задан — это **custom S3-совместимый storage** (MinIO/Selectel/Backblaze B2/Cloudflare R2/…); если пуст — AWS S3 native. **Какой именно — не видно из репо, скрыто в ENV сервера** (Open Question #1 ниже).

Auth middleware (`server.js:73-84`) — любой валидный JWT проходит (нет role-check `admin`). См. Open Question #3.

### §2.3 Frontend-паттерн Garden (доказательство, что схема рабочая)

[garden_claude/garden/services/dataService.js:1427-1449](file:///Users/user/vibecoding/garden_claude/garden/services/dataService.js):
```js
async _uploadToS3(file, folder) {
  const contentType = file.type || 'image/jpeg';
  const fileName = buildUploadFileName(folder, file.name, contentType);
  const sign = await resolveStorageSign({ folder, fileName, contentType });

  const uploadRes = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file
  });
  if (!uploadRes.ok) throw new Error('Ошибка загрузки файла в хранилище.');
  return sign.publicUrl;
}
```

И preprocessing — `convertImageToJpegFile(file, maxSize=1200, quality=0.82)` через canvas (resize до 1200px по большей стороне, JPEG q=0.82). См. `dataService.js:169-200`.

`resolveStorageSign` (dataService.js:202-265) пробует **оба** `auth.skrebeyko.ru/storage/sign` и `api.skrebeyko.ru/storage/sign` (последний через Caddy reverse-proxy форвардит на auth), **с 4 разными payload-схемами** для обратной совместимости. То есть фронт-контракт устойчив.

### §2.4 Чего нет
- Нет отдельного `storage.skrebeyko.ru` / `static.skrebeyko.ru` / `cdn.skrebeyko.ru` DNS-сабдомена (DNS-проверка: все 9 кандидатов → no DNS).
- Нет PostgREST storage extension на api.skrebeyko.ru (`/storage/v1/...` → 404).
- В meetings-фронте нет ни одного `FileReader` / `FormData` / `toDataURL` — там был base64-в-БД-путь, выпилен в SEC_PINS.

---

## §3 — Архитектурные варианты

| # | Вариант | Effort | Coupling | Risk | Прод-готовность |
|---|---------|--------|----------|------|------|
| **A** | **Reuse `auth.skrebeyko.ru/storage/sign`** (Garden-паттерн) + admin upload UI в meetings | **~1 day** | meetings ↔ garden-auth (уже зависит для login) | low | infra live |
| B | Standalone nginx upload на новом сабдомене (`static.skrebeyko.ru`) | ~2-3 days | meetings ↔ новый сервис | medium (новый код) | нет |
| C | bytea в БД + custom endpoint в PostgREST | ~0.5 day | низкий | medium (UX/perf) | плохой UX |
| D | Оставить external supabase «как есть» | 0 | внешняя зависимость | **high** (чужой хост может пропасть) | не решает задачу |
| **E** | **A + backfill 3 существующих картинок** в наш bucket → переписать `image_url` в DB | **+0.5 day** | то же что A | low | infra live |

### §3.1 Подробнее по варианту A (рекомендация)

**Frontend (meetings admin)**:
1. В `NotebooksAdminTab.tsx` добавить `<input type="file" accept="image/*">` рядом с текстовым `URL картинки`.
2. Adopt Garden's `convertImageToJpegFile(file, 1200, 0.82)` (можно скопировать или вынести в `src/lib/imageUpload.ts`).
3. POST `auth.skrebeyko.ru/storage/sign` с админ-JWT (тот же, что использует Phase 1 admin auth) → получить `{uploadUrl, publicUrl}`.
4. PUT в S3, записать `publicUrl` в `form.image_url`.

**Backend (garden-auth/server.js)** — _возможно_ потребуется одна правка:
- Authorization: текущий `authMiddleware` пропускает любого authenticated. Добавить опционально `roleMiddleware(['admin'])` или ограничить `folder` whitelistом для admin (см. Open Question #3).

**Effort**: 1 day frontend + 0.5 day для backfill 3-х файлов (curl GET → PUT → PATCH `notebooks.image_url`) + 0.5 day для backend role-check, если решим закрутить безопасность.

### §3.2 Почему B/C/D — нет
- **B** изобретает велосипед, когда A уже работает в Garden production.
- **C** известный анти-паттерн (SEC_PINS уже выпилил base64-в-БД для notebooks; bytea даст то же раздутие; PostgREST не сервит бинарные данные «как image» нативно).
- **D** оставляет нас на чужой инфраструктуре — нельзя редактировать существующие, нельзя загружать новые, риск исчезновения.

---

## §4 — Рекомендация

**A + E**: использовать существующий `/storage/sign` инфраструктурный endpoint Garden, добавить admin upload UI в meetings, забэкфилить 3 существующие картинки.

**Аргументы**:
- Инфра уже стоит, протестирована Garden production
- meetings уже доверяет `auth.skrebeyko.ru` для логина (Phase 1) — добавляем ещё одну операцию на ту же доверенную точку
- Нулевой ops-overhead (никакого нового сабдомена, сертификата, nginx-конфига)
- Frontend-pattern уже написан в garden_claude — можно скопировать ~100 LOC
- Реалистичный effort: **1-2 дня** включая backfill

**Чего НЕ делаем в этой фазе**:
- Не мигрируем Garden бакет в чужой провайдер (он работает)
- Не настраиваем CDN (превью маленькие, картинки 200-400 KB — нативный nginx S3-фронт ок)
- Не делаем серверный image-resize (Garden ресайзит в браузере перед upload, того же подхода держимся)

---

## §5 — Open Questions для Ольги

### Q1. **Что за S3 backend стоит за `auth.skrebeyko.ru/storage/sign`?**
ENV-переменные `S3_REGION/S3_ENDPOINT/S3_BUCKET/S3_PUBLIC_URL` лежат на сервере Bittern, не в репо. Это:
- (a) AWS S3 (если `S3_ENDPOINT` пуст) — биллинг $/month, region
- (b) MinIO self-hosted на том же Bittern (если `S3_ENDPOINT` указывает на localhost/тот же IP)
- (c) Selectel / Backblaze B2 / Cloudflare R2 / Yandex Object Storage / другой managed

**Зачем знать**: понять биллинг, SLA, какие лимиты, и в какой домен будет ссылаться `image_url` (важно для frontend domain whitelisting и оценки CORS).

### Q2. **Какой `folder` использовать?**
В Garden видны: `folder='avatars'`. Для notebooks предлагаются варианты:
- `folder='notebooks'`
- `folder='notebook-images'` (созвучно старому Supabase bucket-name)
- `folder='meetings/notebooks'` (если хочется namespace разделить от Garden-данных в общем bucket)

### Q3. **Должны ли upload'ы быть ограничены admin-role?**
Сейчас `app.post('/storage/sign', authMiddleware, …)` — любой пользователь с валидным JWT может вызвать. У Garden много обычных юзеров (`role='authenticated'`, `'applicant'`). Для notebooks-загрузки **по идее** должна быть только Ольга (`admin`). Варианты:
- (a) Добавить `roleMiddleware(['admin'])` глобально на endpoint
- (b) Whitelisting `folder`-values per role (notebooks-folder только admin, avatars-folder любой authenticated)
- (c) Оставить как есть — кому-то надо знать notebooks endpoint и иметь токен, low risk в текущей user base

Я бы выбрал (b) как наиболее правильное.

### Q4. **Backfill для 3 существующих картинок — сейчас или потом?**
Опции:
- (a) Сразу в Phase 4A (вместе с upload UI) — 1 файл миграции + 0.5 дня
- (b) Отдельной фазой 4A.2 после того, как upload UI заработает
- (c) Никогда — старые ссылки остаются, для новых блокнотов используется новая инфра

Я бы выбрал (a) — иначе в DB будут 2 разных host'а image_url, что неудобно мониторить.

### Q5. **Resize policy?**
Garden ресайзит до 1200px @ 0.82 quality. Для notebook cover-image (UI рендерит превью ~200x300px + полную картинку при клике?) — кажется ок. Если ли где-то полноразмерные изображения для блокнотов? (Я в коде вижу только `<img src={notebook.image_url}>` в NotebooksView без явных размеров, CSS делает object-cover.) Уточнить нужно ли больше 1200px.

### Q6. **CORS на S3 backend для PUT с meetings.skrebeyko.ru?**
Garden сейчас работает с `garden.skrebeyko.ru` (предполагаю). Если S3-бакет имеет CORS только на garden-домен — PUT с `meetings.skrebeyko.ru` сломается. Нужно проверить (можно подобрать тестовым signed URL — но это лучше уточнить у admin) либо запросить добавление `https://meetings.skrebeyko.ru` в Allowed Origins.

---

## §6 — Что делаем после ответов на Open Questions

Ориентировочный план implementation (Phase 4A apply):

1. **(если Q3=(b))** небольшой patch в `garden-auth/server.js` — folder whitelist per role
2. `src/lib/imageUpload.ts` (новый файл, ~80 LOC):
   - `convertImageToJpegFile(file, maxSize, quality)` — copy of Garden's canvas resize
   - `signedUploadToStorage(file, folder)` — call /storage/sign + PUT
3. `src/components/admin/NotebooksAdminTab.tsx`:
   - `<input type="file">` + preview thumbnail
   - При выборе файла → resize → upload → `setField('image_url', publicUrl)`
   - Текстовый input остаётся как fallback (вставить URL вручную)
4. **(если Q4=(a))** node-скрипт `scripts/backfill_notebook_images.mjs`:
   - GET 3 текущих картинок из supabase.co
   - POST `/storage/sign` (под admin JWT) → PUT в наш S3
   - PATCH `notebooks.image_url`
5. Local + prod smoke: создать тестовый notebook через админку, проверить отображение

Bundle delta ожидание: ~5-10 KB (canvas resize + upload code).

---

## §7 — Статус

- [x] Recon (этот документ)
- [ ] Ольга отвечает на Open Questions §5
- [ ] План implementation финализирован
- [ ] 🟢 на apply

Read-only фаза завершена. Жду решений по Q1-Q6.
