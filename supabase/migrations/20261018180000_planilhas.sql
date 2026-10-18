-- Várias planilhas por conta nos dados colhidos (ex.: Previdência, Pessoa física,
-- Empresa), cada uma com os seus campos. As linhas antigas ficam na planilha "geral".
-- Pode rodar de novo com segurança.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS data_sheets jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.collected_data
  ADD COLUMN IF NOT EXISTS sheet_key text NOT NULL DEFAULT 'geral';
CREATE INDEX IF NOT EXISTS collected_data_account_sheet_idx
  ON public.collected_data(account_id, sheet_key, updated_at DESC);
