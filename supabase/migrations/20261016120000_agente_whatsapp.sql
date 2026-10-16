-- Agente de WhatsApp (app separado, extraído do FisioAI).
-- Uma conta (negócio) por usuário dono. As escritas são feitas pelo servidor
-- (service_role) com o dono conferido no código; o dono só lê pelas policies.
-- Pode rodar de novo com segurança.

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Minha clínica',
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Número conectado por QR Code no servidor Evolution. O token da instância
-- é segredo: sem policy (só o servidor lê).
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  instance text NOT NULL UNIQUE,
  instance_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_settings (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  test_numbers text[] NOT NULL DEFAULT '{}',
  agent_name text,
  instructions text,
  -- Responder também quem já é cliente (marcado na conversa).
  reply_clients boolean NOT NULL DEFAULT false,
  -- Minutos de silêncio do agente depois que a equipe responde pelo celular.
  takeover_minutes integer NOT NULL DEFAULT 30,
  -- Duração de cada horário oferecido.
  slot_minutes integer NOT NULL DEFAULT 60,
  -- Horário de atendimento: { "1": [{"start":480,"end":1080}], ... } (minutos do dia, Brasília).
  schedule jsonb,
  -- Oferecer primeiro os horários mais cedo (não deixar buracos na agenda).
  sequential_fill boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  phone text NOT NULL,
  contact_name text,
  is_client boolean NOT NULL DEFAULT false,
  from_ad boolean NOT NULL DEFAULT false,
  summary text,
  summarized_count integer NOT NULL DEFAULT 0,
  human_takeover boolean NOT NULL DEFAULT false,
  takeover_until timestamptz,
  -- O agente chamou a equipe (motivo); some quando a equipe responde.
  attention_reason text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, phone)
);
CREATE INDEX IF NOT EXISTS conversations_account_idx
  ON public.conversations(account_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  author text NOT NULL CHECK (author IN ('contato', 'agente', 'equipe')),
  body text NOT NULL,
  wa_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON public.messages(conversation_id, created_at);
-- O mesmo evento reenviado pela Evolution não entra duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_id_idx
  ON public.messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Agenda: reservas feitas pelo agente (a equipe confirma), horários marcados
-- pela equipe e bloqueios. Tudo que não está cancelado ocupa o horário.
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'reserva' CHECK (kind IN ('reserva', 'bloqueio')),
  status text NOT NULL DEFAULT 'reservado' CHECK (status IN ('reservado', 'confirmado', 'cancelado')),
  contact_name text,
  phone text,
  notes text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS bookings_account_time_idx ON public.bookings(account_id, starts_at);

GRANT ALL ON public.accounts, public.whatsapp_connections, public.agent_settings,
  public.conversations, public.messages, public.bookings TO service_role;
GRANT SELECT ON public.accounts, public.agent_settings, public.conversations,
  public.messages, public.bookings TO authenticated;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_account_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.accounts WHERE owner_id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.my_account_id() FROM public;
GRANT EXECUTE ON FUNCTION public.my_account_id() TO authenticated;

DROP POLICY IF EXISTS "accounts_select_own" ON public.accounts;
CREATE POLICY "accounts_select_own" ON public.accounts FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "agent_settings_select_own" ON public.agent_settings;
CREATE POLICY "agent_settings_select_own" ON public.agent_settings FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
DROP POLICY IF EXISTS "conversations_select_own" ON public.conversations;
CREATE POLICY "conversations_select_own" ON public.conversations FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own" ON public.messages FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
DROP POLICY IF EXISTS "bookings_select_own" ON public.bookings;
CREATE POLICY "bookings_select_own" ON public.bookings FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
