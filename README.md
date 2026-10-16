# Agente de WhatsApp

Atendente virtual com IA no WhatsApp de qualquer negócio: tira dúvidas com as instruções do negócio, passa para a equipe o que precisar de uma pessoa e, se o negócio quiser, consulta a agenda e **reserva** horários (a equipe confirma). Extraído do agente de WhatsApp do FisioAI.

## O que faz

- Conecta o número do negócio por QR Code (servidor Evolution API gerenciado).
- Recebe as mensagens por webhook assinado e guarda a conversa (memória com resumo a cada 12 mensagens).
- Responde com IA (Gemini pelo gateway da Lovable) usando ferramentas: `horarios_livres`, `conferir_horario`, `reservar_horario`, `trocar_reserva`, `cancelar_reserva`, `chamar_atendente`.
- Modo teste (só números de teste), contatos novos x clientes, pausa automática quando a equipe responde pelo celular, transcrição de áudio (Groq, opcional), junta mensagens seguidas, não responde "ok/obrigado".
- Por negócio: nome, ramo, instruções, agenda ligada ou desligada e regras extras da área da saúde (sem diagnóstico, urgência vai ao pronto-socorro).
- Telas: Conversas (assumir/devolver ao agente, marcar cliente), Agenda (confirmar reservas, marcar horário, bloquear), Agente (instruções, horário de atendimento) e WhatsApp (QR Code).

## Rodar

```bash
bun install          # o npm 10 falha com "edgesOut"; bun ou npm 11+ funcionam
cp .env.example .env # e preencha
bun run dev
bun run test
bun run typecheck
bun run lint
```

1. Crie um projeto Supabase e rode `supabase/migrations/20261016120000_agente_whatsapp.sql`.
2. Configure as variáveis do `.env.example` (as marcadas como segredo vão nos segredos da hospedagem).
3. `PUBLIC_APP_URL` precisa ser o endereço público do app: a Evolution chama `PUBLIC_APP_URL/api/public/whatsapp/webhook`.
4. Entre no app, conecte o WhatsApp, escreva as instruções, ponha seu número em "números de teste" e ligue o agente.

## Estrutura

| Arquivo                                                         | Papel                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/routes/api/public/whatsapp/webhook.ts`                     | Webhook da Evolution (assinatura HMAC por instância)                                                  |
| `src/lib/agent.server.ts`                                       | Núcleo: conversa, decisão de responder, IA + ferramentas, envio, resumo                               |
| `src/lib/whatsapp-agent-rules.ts`                               | Regras puras e prompt fixo (testadas)                                                                 |
| `src/lib/agenda-time.ts`, `agenda-hours.ts`, `agenda.server.ts` | Fuso de Brasília, horário de atendimento, horários livres                                             |
| `src/lib/evolution.server.ts`                                   | Evolution API: envio, webhook, áudio                                                                  |
| `src/lib/connection.functions.ts`, `agent.functions.ts`         | Server functions das telas                                                                            |
| `supabase/migrations/`                                          | Tabelas `accounts`, `whatsapp_connections`, `agent_settings`, `conversations`, `messages`, `bookings` |

## Próximas fases

- Cobrança por pacotes de respostas (Asaas), como no FisioAI.
- Agenda externa opcional (Google Calendar ou o próprio FisioAI).
- Follow-up de quem parou de responder.
