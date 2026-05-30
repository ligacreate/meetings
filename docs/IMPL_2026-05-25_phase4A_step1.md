# Phase 4A — Step 1 APPLIED: Bucket CORS update

**Дата**: 2026-05-26
**Тип**: infra-only (no code, no commit, no push)
**Scope**: добавить `https://meetings.skrebeyko.ru` и `http://localhost:8080` в `AllowedOrigins` на Timeweb Cloud bucket
**Связано**: [IMPL_2026-05-25_phase4A_storage_draft.md](IMPL_2026-05-25_phase4A_storage_draft.md) (Step 1 в §3)

---

## §1 — Что выполнено

SSH на `root@5.129.251.56`, `@aws-sdk/client-s3` уже установлен в `/opt/garden-auth/node_modules`.

```js
client.send(new PutBucketCorsCommand({
  Bucket: process.env.S3_BUCKET,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: ["https://liga.skrebeyko.ru",
                       "https://meetings.skrebeyko.ru",
                       "http://localhost:8080"],
      AllowedMethods: ["GET", "PUT", "HEAD"],
      AllowedHeaders: ["*"],
      MaxAgeSeconds: 3600
    }]
  }
}))
→ "CORS updated"
```

`http://localhost:8080` включён по решению пользователя для local dev smoke (Vite dev server).

---

## §2 — Verification

### §2.1 SDK readback (`GetBucketCorsCommand`)
```json
[
  {
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:8080",
      "https://liga.skrebeyko.ru",
      "https://meetings.skrebeyko.ru"
    ],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```
✅ 3 origin'а, как ожидалось.

### §2.2 OPTIONS preflight (live HTTP probes)

| Origin | HTTP | `access-control-allow-origin` | Pass |
|--------|------|-------------------------------|------|
| `https://meetings.skrebeyko.ru` | **200** | `https://meetings.skrebeyko.ru` | ✅ |
| `http://localhost:8080` | **200** | `http://localhost:8080` | ✅ |
| `https://liga.skrebeyko.ru` (control, unchanged) | **200** | `https://liga.skrebeyko.ru` | ✅ |
| `https://evil.example.com` (negative control) | **403** | — | ✅ correctly rejected |

Все ответы содержат правильный set headers:
```
vary: Origin
access-control-allow-methods: PUT
access-control-allow-headers: content-type
access-control-max-age: 3600
```

### §2.3 Diff vs предыдущая конфигурация

```diff
 CORSRules: [{
   AllowedMethods: ["GET","PUT","HEAD"],
   AllowedHeaders: ["*"],
-  ExposeHeaders: ["ETag"],
   AllowedOrigins: [
     "https://liga.skrebeyko.ru",
+    "https://meetings.skrebeyko.ru",
+    "http://localhost:8080",
   ],
-  MaxAgeSeconds: 3000
+  MaxAgeSeconds: 3600
 }]
```

**Замеченные изменения помимо origins**:

- **`ExposeHeaders: ["ETag"]` исчез** — текущая команда не указала это поле, AWS интерпретирует как пустой массив.
  - **Impact на Garden production**: предположительно нулевой. В [garden_claude/garden/services/dataService.js:1437-1448](file:///Users/user/vibecoding/garden_claude/garden/services/dataService.js) функция `_uploadToS3` после `fetch(uploadUrl, {method:'PUT'})` проверяет только `uploadRes.ok` и возвращает `publicUrl` — ETag из ответа не читается. Других мест, где может быть нужен ETag из browser response, в Garden дереве не нашёл.
  - **Меры предосторожности**: если что-то в Garden будущем понадобится — добавить `ExposeHeaders: ['ETag']` в команду PutBucketCorsCommand и применить повторно.
- **`MaxAgeSeconds: 3000 → 3600`** — пользовательская команда подняла кеш-TTL preflight'а с 50 до 60 минут. Эффект: браузеры реже делают повторные OPTIONS. Нейтральное изменение.

---

## §3 — Готовность к следующему шагу

Step 1 закрыт. ✅

- [x] Pre-flight (env keys, baseline CORS state)
- [x] Step 1 apply (PutBucketCorsCommand)
- [x] Step 1 verify (SDK readback + 4 OPTIONS probes)
- [ ] **🟢 на Step 2-3 (frontend code)** ← следующий блок
- [ ] Local smoke (admin upload test)
- [ ] Commit + push → deploy
- [ ] Step 4 (backfill 3 старых картинок) — после deploy
- [ ] Prod smoke

Жду 🟢 на Step 2-3 (frontend: `src/lib/imageUpload.ts` + `NotebooksAdminTab.tsx` file input).
