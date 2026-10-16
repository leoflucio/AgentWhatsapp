# CLAUDE.md

Agente de WhatsApp com IA para qualquer negócio (não só saúde), extraído do FisioAI (`leoflucio/assess-aid-flow`). Textos de interface, comentários e commits em português do Brasil.

## Comandos

```bash
bun install
bun run dev
bun run test        # vitest
bun run typecheck   # tsc --noEmit
bun run lint        # eslint + prettier
```

## Stack

TanStack Start (React 19) em Cloudflare Workers, Supabase (Postgres + Auth), Tailwind 4 + shadcn/ui, AI SDK pelo gateway da Lovable, Evolution API para o WhatsApp. `vite.config.ts` usa `@lovable.dev/vite-tanstack-config`, que já registra os plugins; não adicione de novo. `src/routeTree.gen.ts` e `src/integrations/supabase/*` são gerados.

## Regras

- Dados por **conta** (`accounts`, uma por dono). Server functions usam `requireSupabaseAuth` e o `supabaseAdmin` (import dinâmico dentro do handler), sempre filtrando por `account_id` da conta do usuário (`ensureAccount`). As tabelas têm RLS só de leitura para o dono; `whatsapp_connections` não tem policy (guarda o token da instância).
- O webhook `api/public/whatsapp/webhook` valida a assinatura `?t=` (HMAC da chave do servidor) e sempre responde 200.
- A resposta do agente é gravada ANTES do envio: o eco `fromMe` é reconhecido como do agente; outra mensagem `fromMe` é a equipe assumindo (agente em silêncio por `takeover_minutes`).
- A IA só vê data e hora LOCAIS (Brasília), nunca ISO/UTC. "Hoje" vem de `todayLocalISO()`, nunca de `toISOString().slice(0, 10)`.
- O prompt é genérico (`FIXED_RULES`); a agenda (`BOOKING_RULES`, `agent_settings.booking_enabled`) e as regras da saúde (`HEALTH_RULES`, `health_rules`) são opcionais por negócio. Não escreva regras de um ramo específico nas regras fixas.
- O agente RESERVA (`bookings.status = 'reservado'`), não marca; a equipe confirma na tela Agenda. Tudo que não está cancelado ocupa o horário.
- Regras puras ficam em arquivos sem banco e com teste (`whatsapp-agent-rules.ts`, `agenda-time.ts`). Migrations podem rodar de novo (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
