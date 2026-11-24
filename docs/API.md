# NOVA Centralized API Gateway & Provider Architecture

Website: `https://nova.vanitasbot.my.id`  
Architecture Flow:
`NOVA Frontend → NOVA Backend (/api/*) → API Gateway → Provider Adapter → External API → Unified Response Processing`

## 1. Security & Access Control
- Frontend components **never** contact external AI providers directly or inspect secret keys.
- SSRF protections (`server/services/urlSafety.ts`) block loopback, private IPv4/IPv6 ranges, link-local metadata endpoints (`169.254.169.254`), and non-HTTP/HTTPS protocols before outbound inspection or media downloads.
- Administrative routes (`/api/admin/gateway/*`) require a verified Firebase ID token whose email is listed in `ADMIN_EMAILS` (default: `sovereign.empirex@gmail.com`).
- Request/Error logs run through `redactSensitiveString` and `redactSensitiveObject`, scrubbing bearer tokens, API keys, passwords, and private headers.

## 2. Unified Internal Response Schema
All gateway executions normalize results into:
```json
{
  "success": true,
  "provider": "provider_slug",
  "model": "model_id",
  "type": "text | image | search | media | enhancement | health",
  "data": {},
  "error": null,
  "metadata": {
    "request_id": "req_xxxxxxxxxxxx",
    "duration_ms": 0,
    "fallback_used": false,
    "endpoint": "...",
    "timestamp": "2026-11-24T00:00:00.000Z"
  }
}
```

## 3. Integrated Providers & Preserved Endpoints

### A. Free AI Custom (`free_ai_custom`)
- **Endpoint**: `POST https://api.free.ai/v1/chat/`
- **API Style**: `sse_chat_image`
- **Model ID**: `qwen7b`
- **Streaming**: Enabled (SSE `data: ...` frames)
- **Language**: `ar` (supports bilingual prompts)
- **Capabilities**: `text-to-image`, `text_generation`
- **Image Pipeline**: Extracts image URL from SSE stream → validates remote URL & MIME (`PNG`, `JPEG`, `WebP`, max 25 MB) → uploads to private Supabase bucket `nova-assets` → generates temporary signed URL.

### B. Nezuko API (`nezuko`)
Base URL: `https://api.nezuko-wa.web.id`
- `GET /api/tools/img-to-hd?url=<url>` — Image Enhancement
- `GET /api/search/yt-search?q=<q>` — YouTube Search
- `GET /api/search/pinterest-search?q=<q>` — Pinterest Search
- `GET /api/download/all-download-media?url=<url>` — Media Extractor
- `GET /api/aiimg/fulx-img-create-v1?prompt=<prompt>&aspect=<aspect>` — Flux Image Generation (flagged conditional/unverified if upstream returns HTML error)
- `GET /api/aiimg/monte-ai-generate-image?prompt=<prompt>` — Monte AI Image Generation (flagged conditional/unverified if upstream returns 404/HTML)
- `POST /api/ai/gemini-chat` (`multipart/form-data`: `prompt`, `lang`, optional `image`)
- `GET /api/ai/Qwen-7B?prompt=<prompt>&model=<model>&lang=<lang>`

### C. Google Gemini (`google_gemini`)
- Uses server-side `@google/genai` SDK (`GEMINI_API_KEY` read strictly from `process.env`).
- Supports streaming chat, multimodal image understanding, image enhancement analysis, Gemini Web Search Grounding, and paid-tier image generation when key is configured.

## 4. Reliability, Retries & Compatible Fallback
- **Idempotent Retries**: Only idempotent `GET` requests use exponential backoff (`withSafeRetry`); `POST` mutations and image-generation jobs are never retried blindly.
- **Circuit Breakers**: Per-provider failure threshold (`5` failures opens circuit for `45s` with `half_open` probe).
- **Rate Limiting**: Sliding-window per-IP/user throttling (`90` requests / 60s).
- **Capability-Compatible Fallbacks**: `resolveCompatibleFallback` rejects incompatible replacements (e.g., never replaces `text-to-image` with a `text_generation` model).

## 5. Auto-Maintained Live Documentation
- Public JSON Spec: `GET /api/gateway/docs`
- Public Catalog: `GET /api/gateway/catalog`
- Interactive Page: `/docs/api-gateway` and Admin tab in `/admin`.
