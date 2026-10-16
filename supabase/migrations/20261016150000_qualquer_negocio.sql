-- Agente para qualquer negócio: ramo, agenda opcional e regras extras da área da saúde.
ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS segment text;
-- O agente consulta a agenda e reserva horários (desligado: só informa e chama a equipe).
ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT true;
-- Cuidados da área da saúde (sem diagnóstico, urgência vai para o pronto-socorro).
ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS health_rules boolean NOT NULL DEFAULT false;
ALTER TABLE public.accounts ALTER COLUMN name SET DEFAULT 'Minha empresa';
