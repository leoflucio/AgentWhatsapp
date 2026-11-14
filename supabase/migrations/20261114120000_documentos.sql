-- Leitura de PDF pelo agente (tela Documentos): o contato manda um PDF e o
-- agente analisa com os critérios que o próprio negócio escreveu.
-- Pode rodar de novo com segurança.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS doc_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS doc_instructions text;
-- Números que podem pedir análise (ex.: os gerentes). Vazio = qualquer contato.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS doc_numbers text[] NOT NULL DEFAULT '{}';

-- Resultado de cada análise (o PDF em si não é guardado).
CREATE TABLE IF NOT EXISTS public.document_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  phone text NOT NULL,
  contact_name text,
  file_name text,
  pages integer,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_analyses_account_idx
  ON public.document_analyses(account_id, created_at DESC);
GRANT ALL ON public.document_analyses TO service_role;
GRANT SELECT ON public.document_analyses TO authenticated;
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_analyses_select_own" ON public.document_analyses;
CREATE POLICY "document_analyses_select_own" ON public.document_analyses FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
