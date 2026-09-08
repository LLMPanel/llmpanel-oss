# LLMPanel Registry API Endpoints

Base URL: `https://llmpanel-registry.chathelper.workers.dev`

Implementation source:
- Router and middleware: [`src/index.ts`](src/index.ts)
- Handlers: [`src/routes/models.ts`](src/routes/models.ts)
- Rate limit logic: [`src/middleware/rate-limit.ts`](src/middleware/rate-limit.ts)

---

## Global behavior

### Allowed methods
- Public API only supports `GET` and `OPTIONS` in [`fetch()`](src/index.ts:10)
- Any non-`GET` request returns `405 Method not allowed` in [`fetch()`](src/index.ts:26)

### CORS
Returned for all responses via [`corsHeaders`](src/index.ts:15):
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

### Rate limit
From [`rateLimit()`](src/middleware/rate-limit.ts:11):
- `100` requests per minute per IP
- Window: `60` seconds
- Keyed by `CF-Connecting-IP` (fallback: `X-Forwarded-For`, then `unknown`) in [`fetch()`](src/index.ts:34)

Response headers added in [`rateLimitHeaders`](src/index.ts:44):
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

When exceeded, returns `429` in [`fetch()`](src/index.ts:52):

```json
{
  "error": "Rate limit exceeded",
  "message": "Max 100 requests per minute. Resets in <seconds>s",
  "retryAfter": 12
}
```

### Caching
Successful public endpoint responses add:
- `Cache-Control: public, max-age=300` in [`cacheHeaders`](src/index.ts:64)

### Content type
Responses are JSON (`Content-Type: application/json`) via [`rateLimitHeaders`](src/index.ts:44).

---

## Endpoints

## 1) `GET /`

API metadata route in [`fetch()`](src/index.ts:83).

### Example response (`200`)
```json
{
  "name": "LLMPanel Model Registry",
  "version": "1.0.0",
  "endpoints": {
    "GET /models": "List all models with quantizations",
    "GET /models?family=llama": "Filter by family",
    "GET /models?tag=reasoning": "Filter by tag",
    "GET /models?search=llama": "Search models",
    "GET /models/:slug": "Get single model detail",
    "GET /families": "List all model families"
  },
  "rateLimit": "100 requests per minute per IP"
}
```

---

## 2) `GET /models`

Handler: [`getModels()`](src/routes/models.ts:25)

### Query params
- `family` (optional): exact family match (`m.family = ?`) in [`getModels()`](src/routes/models.ts:54)
- `search` (optional): `LIKE` match on model name and family in [`getModels()`](src/routes/models.ts:59)
- `tag` (optional): post-query filter against parsed `tags` array in [`getModels()`](src/routes/models.ts:89)

### Response shape (`200`)
```json
{
  "models": [
    {
      "id": "llama-3.1-8b",
      "name": "Llama 3.1 8B",
      "slug": "llama-3.1-8b",
      "family": "llama",
      "huggingfaceId": "meta-llama/Llama-3.1-8B-Instruct",
      "description": "Meta's Llama 3.1 8B instruction-tuned model. Great all-rounder for chat and general tasks.",
      "minVram": 8,
      "tags": ["chat", "general", "instruction"],
      "quantizations": [
        {
          "format": "fp16",
          "vramRequiredGb": 16,
          "huggingfaceId": null,
          "fileSizeGb": 16.1,
          "recommended": false,
          "notes": "Best quality, needs 16GB VRAM"
        },
        {
          "format": "int8",
          "vramRequiredGb": 10,
          "huggingfaceId": null,
          "fileSizeGb": 8.5,
          "recommended": true,
          "notes": "Recommended — balanced quality/speed"
        }
      ]
    }
  ],
  "total": 1,
  "families": ["llama"]
}
```

### Notes
- Only active models are returned (`m.is_active = 1`) in [`getModels()`](src/routes/models.ts:49)
- Quantizations are grouped and mapped from SQL JSON aggregation in [`getModels()`](src/routes/models.ts:35)

---

## 3) `GET /models/:slug`

Route match in [`fetch()`](src/index.ts:70)

Handler: [`getModelBySlug()`](src/routes/models.ts:102)

### Path params
- `slug` (required): lower-case alphanumeric and hyphen only from regex `^/models/([a-z0-9-]+)$` in [`fetch()`](src/index.ts:70)

### Success response (`200`)
```json
{
  "model": {
    "id": "llama-3.1-8b",
    "name": "Llama 3.1 8B",
    "slug": "llama-3.1-8b",
    "family": "llama",
    "huggingfaceId": "meta-llama/Llama-3.1-8B-Instruct",
    "description": "Meta's Llama 3.1 8B instruction-tuned model. Great all-rounder for chat and general tasks.",
    "minVram": 8,
    "tags": ["chat", "general", "instruction"],
    "quantizations": [
      {
        "format": "fp16",
        "vramRequiredGb": 16,
        "huggingfaceId": null,
        "fileSizeGb": 16.1,
        "recommended": false,
        "notes": "Best quality, needs 16GB VRAM"
      },
      {
        "format": "int8",
        "vramRequiredGb": 10,
        "huggingfaceId": null,
        "fileSizeGb": 8.5,
        "recommended": true,
        "notes": "Recommended — balanced quality/speed"
      }
    ]
  }
}
```

### Not found (`404`)
From [`getModelBySlug()`](src/routes/models.ts:113):
```json
{
  "error": "Model not found"
}
```

### Notes
- Quantizations are returned ordered by `vram_required DESC` in [`getModelBySlug()`](src/routes/models.ts:118)

---

## 4) `GET /families`

Handler: [`getFamilies()`](src/routes/models.ts:139)

### Success response (`200`)
```json
{
  "families": [
    { "family": "deepseek", "count": 1 },
    { "family": "llama", "count": 2 },
    { "family": "mistral", "count": 1 },
    { "family": "qwen", "count": 1 }
  ]
}
```

### Notes
- Counts only active models (`is_active = 1`) in [`getFamilies()`](src/routes/models.ts:145)

---

## Error responses

### 405 Method Not Allowed
From [`fetch()`](src/index.ts:26):
```json
{
  "error": "Method not allowed"
}
```

### 404 Not Found (unknown route)
From [`fetch()`](src/index.ts:103):
```json
{
  "error": "Not found"
}
```

### 500 Internal Server Error
From [`fetch()`](src/index.ts:109):
```json
{
  "error": "Internal server error"
}
```

### 429 Too Many Requests
From [`fetch()`](src/index.ts:52):
```json
{
  "error": "Rate limit exceeded",
  "message": "Max 100 requests per minute. Resets in <seconds>s",
  "retryAfter": 12
}
```

---

## Quick curl examples

```bash
curl https://llmpanel-registry.chathelper.workers.dev/
curl "https://llmpanel-registry.chathelper.workers.dev/models"
curl "https://llmpanel-registry.chathelper.workers.dev/models?family=llama"
curl "https://llmpanel-registry.chathelper.workers.dev/models?search=llama"
curl "https://llmpanel-registry.chathelper.workers.dev/models?tag=reasoning"
curl "https://llmpanel-registry.chathelper.workers.dev/models/llama-3.1-8b"
curl "https://llmpanel-registry.chathelper.workers.dev/families"
```

---

## Data model (API output)

### Model
- `id: string`
- `name: string`
- `slug: string`
- `family: string`
- `huggingfaceId: string`
- `description: string | null`
- `minVram: number`
- `tags: string[]`
- `quantizations: Quantization[]`

### Quantization
- `format: string`
- `vramRequiredGb: number`
- `huggingfaceId: string | null`
- `fileSizeGb: number | null`
- `recommended: boolean`
- `notes: string | null`

Mapped from DB entities in [`src/routes/models.ts`](src/routes/models.ts).
