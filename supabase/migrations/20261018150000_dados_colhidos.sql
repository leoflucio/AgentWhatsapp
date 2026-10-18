-- Dados colhidos pelo agente: campos que o negócio escolhe (nome, CPF, valor...)
-- e uma linha por registro (cliente, pedido ou cotação) com o que o agente anotou.
-- O mesmo telefone pode ter várias linhas (ex.: um gerente que manda vários clientes).
-- A equipe edita na tela Dados.
-- Pode rodar de novo com segurança.
ALTER TABLE public.agent_settings
  ADD COLUMN IF NOT EXISTS data_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.collected_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_name text,
  -- 55 + DDD + número
  phone text NOT NULL,
  -- DDD + últimos 8 dígitos (mesmo contato com ou sem 55 e nono dígito)
  phone_key text NOT NULL,
  -- { chave_do_campo: "valor" }
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Quem mexeu por último: agente ou equipe
  updated_by text NOT NULL DEFAULT 'agente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Versão anterior tinha uma linha só por telefone.
ALTER TABLE public.collected_data DROP CONSTRAINT IF EXISTS collected_data_account_id_phone_key_key;
CREATE INDEX IF NOT EXISTS collected_data_account_phone_idx
  ON public.collected_data(account_id, phone_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS collected_data_account_updated_idx
  ON public.collected_data(account_id, updated_at DESC);

GRANT ALL ON public.collected_data TO service_role;
GRANT SELECT ON public.collected_data TO authenticated;
ALTER TABLE public.collected_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collected_data_select_own" ON public.collected_data;
CREATE POLICY "collected_data_select_own" ON public.collected_data FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
