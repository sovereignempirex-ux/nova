-- NOVA Free AI Health & Automated Endpoint Test History
CREATE TABLE IF NOT EXISTS public.nova_api_endpoint_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug text NOT NULL,
  endpoint_id text NOT NULL,
  endpoint_url text NOT NULL,
  model_name text,
  capability text NOT NULL,
  dns_resolved boolean NOT NULL DEFAULT false,
  http_status integer,
  response_time_ms integer,
  validation_passed boolean NOT NULL DEFAULT false,
  validation_details text,
  availability_status text NOT NULL CHECK (
    availability_status IN (
      'Working',
      'Degraded',
      'Unavailable',
      'Not tested',
      'Authentication required',
      'Rate limited'
    )
  ),
  error_message text,
  tested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nova_endpoint_tests_provider
  ON public.nova_api_endpoint_tests (provider_slug, tested_at DESC);

ALTER TABLE public.nova_api_endpoint_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages endpoint tests" ON public.nova_api_endpoint_tests;
CREATE POLICY "Admin manages endpoint tests"
  ON public.nova_api_endpoint_tests FOR ALL
  USING (
    auth.jwt() ->> 'email' = 'sovereign.empirex@gmail.com'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = 'sovereign.empirex@gmail.com'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
