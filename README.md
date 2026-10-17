# Agente de WhatsApp

Atendente virtual com IA no WhatsApp de qualquer negócio: tira dúvidas com as instruções do negócio, passa para a equipe o que precisar de uma pessoa e, se o negócio quiser, consulta a agenda e **reserva** horários (a equipe confirma). Extraído do agente de WhatsApp do FisioAI.

## O que faz

- Conecta o número do negócio por QR Code (servidor Evolution API gerenciado).
- Recebe as mensagens por webhook assinado e guarda a conversa (memória com resumo a cada 12 mensagens).
- Responde com IA (Gemini do Google por padrão, ou qualquer provedor compatível com a API da OpenAI) usando ferramentas: `horarios_livres`, `conferir_horario`, `reservar_horario`, `trocar_reserva`, `cancelar_reserva`, `chamar_atendente`.
- Modo teste (só números de teste), contatos novos x clientes, pausa automática quando a equipe responde pelo celular, transcrição de áudio (Groq, opcional), junta mensagens seguidas, não responde "ok/obrigado".
- Por negócio: nome, ramo, instruções, agenda ligada ou desligada e regras extras da área da saúde (sem diagnóstico, urgência vai ao pronto-socorro).
- Telas: Conversas (assumir/devolver ao agente, marcar cliente), Agenda (confirmar reservas, marcar horário, bloquear), Agente (instruções, horário de atendimento) WhatsApp (QR Code) e Contatos (lista editável, importada da agenda do celular por arquivo .vcf/.csv ou pelo seletor do Chrome no Android; o agente reconhece quem está na lista, chama pelo nome e lê as observações).

## Rodar no computador

```bash
bun install          # o npm 10 falha com "edgesOut"; use bun (ou npm 11+)
cp .env.example .env # e preencha
bun run dev          # http://localhost:3000
bun run test
bun run typecheck
bun run lint
```

Para o WhatsApp alcançar o app no seu computador, abra um túnel (`cloudflared tunnel --url http://localhost:3000` ou ngrok) e use o endereço dele em `PUBLIC_APP_URL`.

## Colocar no ar numa VPS (ex.: Hostinger)

1. **Supabase:** crie um projeto em supabase.com e rode os arquivos de `supabase/migrations/` (em ordem) no SQL Editor. Em Authentication › URL Configuration, ponha o endereço do app.
2. **IA:** crie uma chave grátis em aistudio.google.com e coloque em `AI_API_KEY`.
3. **WhatsApp:** use o servidor Evolution que você já tem (`EVOLUTION_HOST_URL` e `EVOLUTION_HOST_KEY`). Pode ser o mesmo do FisioAI: as instâncias deste app começam com `agw_`.
4. **Na VPS** (com Docker instalado):
   ```bash
   git clone https://github.com/leoflucio/AgentWhatsapp.git && cd AgentWhatsapp
   cp .env.example .env && nano .env
   docker compose up -d --build
   ```
   O app sobe na porta 3000.
5. **Domínio com HTTPS:** aponte o domínio (registro tipo A) para o IP da VPS. Se a VPS já tem o Traefik (como o da Evolution, com o resolver `letsencrypt`), ponha `APP_DOMAIN=seudominio.com.br` e `PUBLIC_APP_URL=https://seudominio.com.br` no `.env` e rode `docker compose up -d`: o certificado sai sozinho. Sem Traefik, use outro proxy com HTTPS (Caddy, Nginx) na frente da porta 3000.
6. **Cobrança (Asaas):** em asaas.com › Integrações, copie a chave da API para `ASAAS_API_KEY`. Em Integrações › Webhooks, crie um webhook de cobranças com a URL `https://SEU_ENDERECO/api/public/asaas/webhook` e um token inventado por você, que vai também em `ASAAS_WEBHOOK_TOKEN`. Ponha seu e-mail de login em `ADMIN_EMAILS`.
7. Abra o app, crie sua conta, conecte o WhatsApp pelo QR Code, escreva as instruções, ponha seu número em "números de teste" e ligue o agente.

Para atualizar: `git pull && docker compose up -d --build`.

## Planos e cobrança

Cada cliente cria a própria conta e conecta o próprio WhatsApp. Toda conta nova tem 7 dias grátis (até 200 respostas). Depois, o agente só responde com plano pago:

| Plano        | Preço/mês | Respostas/mês |
| ------------ | --------- | ------------- |
| Essencial    | R$ 97     | 1.000         |
| Profissional | R$ 197    | 2.500         |
| Empresa      | R$ 347    | 5.000         |

O cliente assina na tela Planos (Pix, boleto ou cartão). Atraso: o agente continua 3 dias além do período pago. Limite do mês esgotado: o agente manda uma mensagem fixa e a equipe assume. O dono do app (`ADMIN_EMAILS`) vê o Painel do dono, pode bloquear contas e liberar uma conta grátis (sem limite, sem acesso ao painel).

## Estrutura

| Arquivo                                                                               | Papel                                                                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/routes/api/public/whatsapp/webhook.ts`                                           | Webhook da Evolution (assinatura HMAC por instância)                                                  |
| `src/lib/agent.server.ts`                                                             | Núcleo: conversa, decisão de responder, IA + ferramentas, envio, resumo                               |
| `src/lib/whatsapp-agent-rules.ts`                                                     | Regras puras e prompt fixo (testadas)                                                                 |
| `src/lib/agenda-time.ts`, `agenda-hours.ts`, `agenda.server.ts`                       | Fuso de Brasília, horário de atendimento, horários livres                                             |
| `src/lib/evolution.server.ts`                                                         | Evolution API: envio, webhook, áudio                                                                  |
| `src/lib/connection.functions.ts`, `agent.functions.ts`                               | Server functions das telas                                                                            |
| `src/lib/billing-rules.ts`, `billing.server.ts`, `billing.functions.ts`               | Planos, teste grátis, cota de respostas e assinatura pelo Asaas                                       |
| `src/routes/api/public/asaas/webhook.ts`                                              | Webhook do Asaas: o plano só vale com o pagamento confirmado                                          |
| `src/lib/admin.functions.ts`, `src/routes/_app/admin.tsx`                             | Painel do dono: contas, uso, WhatsApp, bloqueio, receita e custo                                      |
| `src/lib/contacts-import.ts`, `contacts.functions.ts`, `src/routes/_app/contatos.tsx` | Lista de contatos e importação da agenda (vCard/CSV)                                                  |
| `supabase/migrations/`                                                                | Tabelas `accounts`, `whatsapp_connections`, `agent_settings`, `conversations`, `messages`, `bookings` |

## Próximas fases

- Agenda externa opcional (Google Calendar ou o próprio FisioAI).
- Follow-up de quem parou de responder.
- Sincronizar com o Google Contatos (precisa de app verificado pelo Google).
