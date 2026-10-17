-- Conta liberada pelo dono do app: sem cobrança e sem limite, sem acesso ao painel.
-- Pode rodar de novo com segurança.
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS free boolean NOT NULL DEFAULT false;
