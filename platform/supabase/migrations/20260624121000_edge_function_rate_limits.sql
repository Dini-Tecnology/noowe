-- Server-side rate-limit counters for public Edge Functions.
-- The table is intentionally not readable or writable by anon/authenticated users.

BEGIN;

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.edge_rate_limits FROM PUBLIC;
REVOKE ALL ON public.edge_rate_limits FROM anon;
REVOKE ALL ON public.edge_rate_limits FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_rate_limits TO service_role;

CREATE INDEX IF NOT EXISTS edge_rate_limits_updated_at_idx
  ON public.edge_rate_limits (updated_at);

COMMIT;
