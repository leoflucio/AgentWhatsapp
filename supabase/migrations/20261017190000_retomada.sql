-- Retomada (follow-up): o agente volta a falar, uma vez, com quem conversou
-- e parou sem fechar. Pode rodar de novo com segurança.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_days integer NOT NULL DEFAULT 2;

-- Quando a retomada saiu (ou foi pulada pela IA) e o resultado:
-- enviando | enviado | pulado | falhou. Volta a vazio quando o contato escreve de novo.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_status text;

CREATE INDEX IF NOT EXISTS conversations_followup_idx
  ON public.conversations(account_id, last_message_at)
  WHERE followup_sent_at IS NULL;
