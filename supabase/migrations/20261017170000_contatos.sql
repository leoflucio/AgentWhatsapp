-- Lista de contatos da conta (editável e importada da agenda do celular).
-- O agente consulta pelo telefone para saber quem está falando.
-- Pode rodar de novo com segurança.
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  -- 55 + DDD + número
  phone text NOT NULL,
  -- DDD + últimos 8 dígitos (acha o mesmo número com ou sem 55 e nono dígito)
  phone_key text NOT NULL,
  notes text,
  -- Já é cliente: o agente trata como cliente (e respeita "Responder também clientes")
  is_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, phone_key)
);
CREATE INDEX IF NOT EXISTS contacts_account_name_idx ON public.contacts(account_id, name);

GRANT ALL ON public.contacts TO service_role;
GRANT SELECT ON public.contacts TO authenticated;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_select_own" ON public.contacts;
CREATE POLICY "contacts_select_own" ON public.contacts FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
