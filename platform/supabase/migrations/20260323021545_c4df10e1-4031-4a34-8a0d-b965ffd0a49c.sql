CREATE TABLE IF NOT EXISTS public.demo_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  feedback_type TEXT NOT NULL DEFAULT 'improvement',
  rating INTEGER,
  description TEXT,
  page_route TEXT,
  demo_step TEXT,
  viewport_mode TEXT,
  active_role TEXT,
  journey_step TEXT,
  recent_actions JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous inserts on demo_feedback" ON public.demo_feedback;
CREATE POLICY "Allow anonymous inserts on demo_feedback"
ON public.demo_feedback
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow reading demo_feedback for authenticated" ON public.demo_feedback;
CREATE POLICY "Allow reading demo_feedback for authenticated"
ON public.demo_feedback
FOR SELECT
TO authenticated
USING (true);