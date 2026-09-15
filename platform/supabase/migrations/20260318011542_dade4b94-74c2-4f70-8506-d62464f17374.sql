
CREATE TABLE IF NOT EXISTS public.demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  restaurant text NOT NULL,
  email text NOT NULL,
  phone text,
  access_code text NOT NULL,
  verified boolean NOT NULL DEFAULT false
);

ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert" ON public.demo_leads;
CREATE POLICY "Allow public insert" ON public.demo_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "No public reads" ON public.demo_leads;
CREATE POLICY "No public reads" ON public.demo_leads
  FOR SELECT TO anon, authenticated
  USING (false);
