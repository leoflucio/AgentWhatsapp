-- Agenda: quantas pessoas cabem no mesmo horário (1 = horário exclusivo) e
-- "agendar direto" (o agente marca o horário já confirmado, sem a equipe confirmar).
-- Pode rodar de novo com segurança.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS slot_capacity integer NOT NULL DEFAULT 1;
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS auto_confirm boolean NOT NULL DEFAULT false;
