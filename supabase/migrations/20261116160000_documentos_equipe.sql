-- PDF mandado pela equipe (gerente) também é analisado: o id da mensagem do
-- WhatsApp evita analisar duas vezes o mesmo arquivo (reenvio do webhook).
-- Pode rodar de novo com segurança.
ALTER TABLE public.document_analyses
  ADD COLUMN IF NOT EXISTS wa_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS document_analyses_wa_message_idx
  ON public.document_analyses(account_id, wa_message_id);
