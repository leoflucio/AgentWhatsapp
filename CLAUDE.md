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

TanStack Start (React 19) com build Node (nitro, preset `node-server`) para rodar em VPS com Docker, Supabase (Postgres + Auth), Tailwind 4 + shadcn/ui, AI SDK com provedor compatível com OpenAI (`src/lib/ai.server.ts`, Gemini por padrão), Evolution API para o WhatsApp. Sem Lovable e sem Cloudflare. `src/routeTree.gen.ts` é gerado pelo build.

## Regras

- Dados por **conta** (`accounts`, uma por dono). Server functions usam `requireSupabaseAuth` e o `supabaseAdmin` (import dinâmico dentro do handler), sempre filtrando por `account_id` da conta do usuário (`ensureAccount`). As tabelas têm RLS só de leitura para o dono; `whatsapp_connections` não tem policy (guarda o token da instância).
- O webhook `api/public/whatsapp/webhook` valida a assinatura `?t=` (HMAC da chave do servidor) e sempre responde 200.
- A resposta do agente é gravada ANTES do envio: o eco `fromMe` é reconhecido como do agente; outra mensagem `fromMe` é a equipe assumindo (agente em silêncio por `takeover_minutes`, padrão 5; `chamar_atendente` usa o mesmo prazo; 0 = não volta sozinho, só pelo botão Devolver; -1 = `RETURN_ON_TEAM_REPLY`: chamar a equipe silencia sem prazo e a primeira resposta da equipe devolve ao agente; tudo via `takeoverPatch`).
- A IA só vê data e hora LOCAIS (Brasília), nunca ISO/UTC. "Hoje" vem de `todayLocalISO()`, nunca de `toISOString().slice(0, 10)`.
- O prompt é genérico (`FIXED_RULES`); a agenda (`BOOKING_RULES`, `agent_settings.booking_enabled`) e as regras da saúde (`HEALTH_RULES`, `health_rules`) são opcionais por negócio. Não escreva regras de um ramo específico nas regras fixas.
- O agente RESERVA (`bookings.status = 'reservado'`), não marca; a equipe confirma na tela Agenda. Tudo que não está cancelado ocupa o horário.
- Regras puras ficam em arquivos sem banco e com teste (`whatsapp-agent-rules.ts`, `agenda-time.ts`). Migrations podem rodar de novo (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
- Assinatura: regras puras em `billing-rules.ts` (planos, `TRIAL_DAYS`, cota, `decideEvent`, `planCheckout`). O plano só muda pelo webhook `api/public/asaas/webhook` (`asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`); eventos de assinatura que não é a atual nem a pendente são ignorados. O agente checa `resolveAccess` antes de responder. Dono do app = `ADMIN_EMAILS` (sem limite, painel `/admin`); `accounts.free` libera uma conta sem cobrança nem limite, sem dar acesso ao painel.
- Contatos: tabela `contacts` (única por `account_id` + `phone_key` = DDD + 8 últimos dígitos, `phoneMatchKey`). O agente procura o telefone (`findListedContact` em `agent.server.ts`): o nome e as observações entram no contexto e `is_client` da lista conta como cliente no gate. Importação pura e testada em `contacts-import.ts` (vCard 2.1/3.0, CSV do Google/planilha); reimportar não duplica nem altera quem já está na lista. Sincronização automática com o celular não existe num site.
- Marca: "Secretária Digital 24h" (domínio secretariadigital24h.com.br). Não use "WhatsApp" no nome do app nem da loja (marca da Meta). HTTPS pelo Traefik da VPS com `APP_DOMAIN` (labels no `docker-compose.yml`).
- Play Store: o site é instalável (`public/manifest.webmanifest`, ícones em `public/icons`) e vira app Android por TWA. `/.well-known/assetlinks.json` sai de `ANDROID_PACKAGE` + `ANDROID_SHA256`. Dentro do app da loja (`useStoreApp`, referrer `android-app://`) a tela Planos não mostra pagamento nem link para pagar; a assinatura é pelo navegador.
- Retomada (follow-up): `agent_settings.followup_enabled`/`followup_days`. Um timer no processo do servidor (`startFollowUpTimer`, ligado em `src/server.ts` só em produção, a cada 30 min; `FOLLOWUP_TIMER=off` desliga) chama `runAllFollowUps` (`followup.server.ts`). Regras puras em `followup-rules.ts`: só quem escreveu, não é cliente (conversa ou lista de contatos), sem reserva, sem equipe/atenção pendente, com a última mensagem do negócio, parado entre `followup_days` e 30 dias, dentro do horário de atendimento, respeitando modo teste e cota. `conversations.followup_sent_at` é marcado ANTES do envio (uma por vez); a IA pode responder `PULAR`. Quando o contato escreve de novo, `followup_sent_at` volta a nulo.
- Cadastro: quem cria conta por e-mail informa nome, celular e CPF/CNPJ (`checkProfile` em `profile-rules.ts`, vão nos metadados do `signUp` e `getProfile` grava em `accounts.owner_name/owner_phone/owner_doc` no primeiro acesso). Quem entra pelo Google (botão do Google Identity Services + `signInWithIdToken` com nonce quando há `GOOGLE_CLIENT_ID` no servidor, lido por `getGoogleClientId`, assim a tela do Google mostra o app e não o domínio do Supabase; sem ele, `signInWithOAuth`) vê `CompleteProfile` no lugar das telas até completar. A cobrança usa o CPF/CNPJ e o nome do cadastro se o cliente não informar outro.
- Dados colhidos (tela `/dados`): o negócio tem até `MAX_SHEETS` planilhas (`agent_settings.data_sheets`, `normalizeSheets`; a coluna antiga `data_fields` vira a planilha `geral`), cada uma com os seus campos (chave fixa, "pedir" ou "só anotar"). O agente ganha uma ferramenta por planilha (`salvar_<chave>`, `sheetToolName`) e grava em `collected_data` (`sheet_key`): uma linha por registro (cliente/pedido); o mesmo telefone pode ter várias. Atualiza a última linha do telefone naquela planilha ou abre outra com `novo_registro = true` (`NEW_RECORD_PARAM`). Regras puras em `collected-data-rules.ts` (`mergeValues`: só campos da lista, vazio não apaga; `collectPromptText`; CSV com `;`). A equipe edita (`updated_by = 'equipe'`) e baixa cada planilha. Tirar campo ou planilha não apaga valores. "Criar pelo prompt" (`suggestDataSheets`, IA lite, `mergeSuggestedSheets`) monta as planilhas pelas instruções do agente, com "Pedir" desligado; a pessoa revisa e salva.
- Modelos de prompt: `PROMPT_TEMPLATES` em `prompt-templates.ts` (um por área, com trechos `[PREENCHA: ...]`), escolhidos na tela Agente; aplicar troca as instruções (pede confirmação), ajusta saúde/agenda e só preenche o ramo se estiver vazio. `stripBlanks` tira do prompt as linhas ainda com `[PREENCHA: ...]` (a IA não inventa o dado que falta).
- Página de vendas: `/` mostra `Landing` (`src/components/Landing.tsx`, prints em `public/landing/`) para quem não está logado; logado vai para `/conversas` e o app instalado (Play Store/atalho, `isInstalledApp`) vai direto ao `/login`. Preços e teste vêm de `billing-rules.ts`, ramos de `PROMPT_TEMPLATES`. Botões usam `/login?criar=1` (abre "Criar conta").
