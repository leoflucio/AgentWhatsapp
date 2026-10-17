// Cliente da API do Asaas (só servidor), para as assinaturas do agente.
// Docs: https://docs.asaas.com/
// A chave define o ambiente: aact_prod_ = produção; as demais = sandbox.

function apiKey(): string {
  const k = (process.env.ASAAS_API_KEY ?? "").trim();
  if (!k) throw new Error("A cobrança ainda não foi configurada (ASAAS_API_KEY).");
  return k;
}

export function asaasConfigured(): boolean {
  return Boolean((process.env.ASAAS_API_KEY ?? "").trim());
}

function baseUrl(key: string): string {
  return key.replace(/^\$/, "").startsWith("aact_prod_")
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

async function call<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const key = apiKey();
  const res = await fetch(`${baseUrl(key)}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "AgenteWhatsApp",
      access_token: key,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const msg =
      (json?.errors as { description?: string }[] | undefined)?.[0]?.description ??
      `Asaas HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

export type AsaasCharge = { id: string; status: string; invoiceUrl?: string; dueDate?: string };

export async function createCustomer(input: {
  name: string;
  email?: string;
  cpfCnpj: string;
  externalReference?: string;
}): Promise<{ id: string }> {
  return call("/customers", { method: "POST", body: input });
}

export async function updateCustomer(
  id: string,
  input: { name?: string; email?: string; cpfCnpj?: string },
): Promise<{ id: string }> {
  return call(`/customers/${id}`, { method: "POST", body: input });
}

export async function createSubscription(input: {
  customer: string;
  value: number;
  nextDueDate: string;
  description: string;
  externalReference: string;
}): Promise<{ id: string }> {
  return call("/subscriptions", {
    method: "POST",
    // UNDEFINED: o cliente escolhe Pix, boleto ou cartão na fatura.
    body: { ...input, billingType: "UNDEFINED", cycle: "MONTHLY" },
  });
}

export async function listSubscriptionPayments(
  id: string,
  limit = 3,
): Promise<{ data: AsaasCharge[] }> {
  return call(`/subscriptions/${id}/payments?limit=${limit}`);
}

/** Primeira fatura ainda não paga da assinatura (link para o cliente pagar). */
export async function openInvoiceUrl(subscriptionId: string): Promise<string | null> {
  const r = await listSubscriptionPayments(subscriptionId, 3).catch(() => ({
    data: [] as AsaasCharge[],
  }));
  const open = (r.data ?? []).find(
    (p) => p.invoiceUrl && !["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status),
  );
  return open?.invoiceUrl ?? null;
}

/** Cancela; assinatura inexistente ou já removida (404) conta como sucesso. */
export async function cancelSubscription(id: string): Promise<void> {
  try {
    await call(`/subscriptions/${id}`, { method: "DELETE" });
  } catch (e) {
    if ((e as { status?: number }).status === 404) return;
    throw e;
  }
}
