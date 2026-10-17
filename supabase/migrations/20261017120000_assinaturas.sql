-- Assinatura do agente (Asaas): plano, período pago e plano pendente até o
-- pagamento ser confirmado. Bloqueio manual pelo dono do app.
-- Pode rodar de novo com segurança.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- essencial | profissional | empresa
  plan text,
  -- pending | active | past_due | canceled | revoked
  status text NOT NULL DEFAULT 'pending',
  current_period_end timestamptz,
  asaas_customer_id text,
  asaas_subscription_id text,
  -- Plano escolhido que só passa a valer quando a fatura for paga.
  pending_plan text,
  pending_subscription_id text,
  cancel_requested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_asaas_idx ON public.subscriptions(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_pending_idx ON public.subscriptions(pending_subscription_id);

-- Bloqueio pelo dono do app (o agente para de responder).
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- Conta das respostas do mês.
CREATE INDEX IF NOT EXISTS messages_account_author_idx
  ON public.messages(account_id, author, created_at);

GRANT ALL ON public.subscriptions TO service_role;
GRANT SELECT ON public.subscriptions TO authenticated;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT TO authenticated
  USING (account_id = public.my_account_id());
