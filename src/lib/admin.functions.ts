/* eslint-disable @typescript-eslint/no-explicit-any */
// Painel do dono do app (ADMIN_EMAILS): todas as contas, plano, uso do mês,
// WhatsApp conectado, bloqueio e totais de receita e custo.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, isAdminEmail } = await import("@/lib/billing.server");
    const admin = await requireAdmin(context.userId);
    const { accountAccess, summarizeAccounts } = await import("@/lib/billing-rules");
    const { hostConfigured, evo } = await import("@/lib/evolution.server");
    const { instanceStates, managedInstanceName } = await import("@/lib/whatsapp-managed");

    const [accountsR, subsR, connR, usersR, instancesR] = await Promise.all([
      admin
        .from("accounts")
        .select("id, owner_id, name, created_at, blocked, free, owner_name, owner_phone")
        .order("created_at", { ascending: false }),
      admin.from("subscriptions").select("*"),
      admin.from("whatsapp_connections").select("account_id, instance"),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      hostConfigured()
        ? evo("/instance/fetchInstances")
        : Promise.resolve({ ok: false, json: null }),
    ]);
    if (accountsR.error) throw new Error(accountsR.error.message);

    const subs = new Map<string, any>(((subsR.data ?? []) as any[]).map((s) => [s.account_id, s]));
    const conns = new Set<string>(((connR.data ?? []) as any[]).map((c) => c.account_id));
    // Contagem por conta (o Supabase corta listas em 1.000 linhas; count não).
    const { repliesThisMonth } = await import("@/lib/billing.server");
    const accountIds = ((accountsR.data ?? []) as any[]).map((a) => a.id as string);
    const counts = await Promise.all(
      accountIds.map((id) => repliesThisMonth(admin, id).catch(() => 0)),
    );
    const used = new Map<string, number>(accountIds.map((id, i) => [id, counts[i]]));
    const emails = new Map<string, string>(
      ((usersR.data?.users ?? []) as any[]).map((u) => [u.id, u.email ?? ""]),
    );
    const states = instanceStates(instancesR.ok ? instancesR.json : null);

    const rows = ((accountsR.data ?? []) as any[]).map((a) => {
      const email = emails.get(a.owner_id) ?? "";
      const sub = subs.get(a.id) ?? null;
      const access = accountAccess({
        sub,
        accountCreatedAt: a.created_at,
        blocked: Boolean(a.blocked),
        exempt: isAdminEmail(email) || Boolean(a.free),
      });
      const instance = managedInstanceName(a.id);
      return {
        id: a.id as string,
        name: a.name as string,
        email,
        ownerName: (a.owner_name as string | null) ?? null,
        ownerPhone: (a.owner_phone as string | null) ?? null,
        createdAt: a.created_at as string,
        blocked: Boolean(a.blocked),
        free: Boolean(a.free),
        owner: isAdminEmail(email),
        access,
        status: (sub?.status as string | null) ?? null,
        periodEnd: (sub?.current_period_end as string | null) ?? null,
        pendingPlan: (sub?.pending_plan as string | null) ?? null,
        whatsapp: states.get(instance) ?? (conns.has(a.id) ? "desconectado" : "sem_numero"),
        repliesThisMonth: used.get(a.id) ?? 0,
      };
    });
    return { rows, totals: summarizeAccounts(rows) };
  });

export const setAccountBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accountId: z.string().uuid(), blocked: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/billing.server");
    const admin = await requireAdmin(context.userId);
    const { error } = await admin
      .from("accounts")
      .update({ blocked: data.blocked })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Libera a conta sem cobrança e sem limite (ex.: conta da família), sem dar acesso ao painel. */
export const setAccountFree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accountId: z.string().uuid(), free: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/billing.server");
    const admin = await requireAdmin(context.userId);
    const { error } = await admin
      .from("accounts")
      .update({ free: data.free })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
