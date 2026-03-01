
-- Table for individual app usage sessions (both auto-detected and manual)
CREATE TABLE public.app_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_name TEXT,
  app_name TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'auto'
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on app_usage_logs"
ON public.app_usage_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- Table for app usage limits
CREATE TABLE public.app_usage_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_name TEXT NOT NULL,
  package_name TEXT,
  daily_limit_minutes INTEGER,
  monthly_limit_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(app_name)
);

ALTER TABLE public.app_usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on app_usage_limits"
ON public.app_usage_limits
FOR ALL
USING (true)
WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_app_usage_logs_updated_at
BEFORE UPDATE ON public.app_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_app_usage_limits_updated_at
BEFORE UPDATE ON public.app_usage_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
