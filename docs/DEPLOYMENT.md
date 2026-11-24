# NOVA Deployment & Infrastructure Guide

## 1. Required Environment Variables (`Settings > Secrets` or `.env`)
Configure server-side secrets securely outside client bundles:
- `APP_URL=https://nova.vanitasbot.my.id`
- `ADMIN_EMAILS=sovereign.empirex@gmail.com`
- `GEMINI_API_KEY` — Enables Google Gemini chat, multimodal analysis, Web Grounding, and AI SEO drafting.
- `SUPABASE_URL=https://jlexjqlehjtjzjoqgcwo.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — Required for private `nova-assets` uploads, signed URLs, and persisting gateway/SEO tables.
- `GSC_SITE_URL=https://nova.vanitasbot.my.id/`
- `GSC_CLIENT_EMAIL` & `GSC_PRIVATE_KEY` — Optional Google Search Console Service Account credentials.

## 2. Supabase Migrations & Edge Function
1. Apply database migrations in Supabase SQL Editor or via Supabase CLI (`supabase db push`):
   - `supabase/migrations/202611240001_nova_api_gateway.sql`
   - `supabase/migrations/202611240002_nova_seo_engine.sql`
2. Ensure private storage bucket `nova-assets` exists (private access, max 25 MB, `image/png`, `image/jpeg`, `image/webp`).
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy nova-api --project-ref jlexjqlehjtjzjoqgcwo
   ```

## 3. Build, Test & Run
```bash
npm install
npm test
npm run lint
npm run build
NODE_ENV=production npm start
```
Server listens on `PORT` (default `3000`) via `server.ts`, serving Express API routes, dynamic sitemaps/robots, SSR HTML metadata injection, and Vite production assets (`dist/`).
