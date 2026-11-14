-- Comandos da equipe pelo WhatsApp: a equipe mexe na agenda mandando mensagem
-- (texto com # ou áudio) da conversa "você" do número conectado ou de um
-- celular da lista abaixo. Pode rodar de novo com segurança.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS team_numbers text[] NOT NULL DEFAULT '{}';

-- Plano esperando o "sim", lista do dia aberta e a última resposta (para
-- reconhecer o eco na conversa "você"). Uma linha por pessoa da equipe.
-- Sem policy: só o servidor (service role) lê e escreve.
CREATE TABLE IF NOT EXISTS public.team_command_state (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  sender_key text NOT NULL,
  pending jsonb,
  pending_until timestamptz,
  list_ids jsonb,
  list_until timestamptz,
  last_reply text,
  last_reply_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, sender_key)
);
GRANT ALL ON public.team_command_state TO service_role;
ALTER TABLE public.team_command_state ENABLE ROW LEVEL SECURITY;
