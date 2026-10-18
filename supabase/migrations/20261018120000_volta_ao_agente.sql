-- O agente volta sozinho 5 minutos depois que a equipe assume (0 = não volta sozinho).
-- Contas que estavam no padrão antigo (30) passam para 5. Pode rodar de novo com segurança.
ALTER TABLE public.agent_settings ALTER COLUMN takeover_minutes SET DEFAULT 5;
UPDATE public.agent_settings SET takeover_minutes = 5 WHERE takeover_minutes = 30;
