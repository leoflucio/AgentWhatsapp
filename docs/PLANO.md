# Agente de WhatsApp como app separado

Levantamento feito no repositório `leoflucio/assess-aid-flow` (FISIOAI), commit `9641836`, em 16/10/2026.

## O que existe hoje no FISIOAI

O "agente de WhatsApp" é a secretária virtual que atende leads e pacientes pelo WhatsApp da clínica, tira dúvidas com base nas instruções da clínica e **reserva** horários (não marca; a recepção confirma).

| Peça                     | Arquivo                                                                                                | O que faz                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook                  | `src/routes/api/public/whatsapp/agent.ts`                                                              | Recebe `messages.upsert` da Evolution API. URL assinada (`?i=instância&t=HMAC`). Sempre responde 200.                                                                                                          |
| Núcleo                   | `src/lib/whatsapp-agent.server.ts` (1.200 linhas)                                                      | Guarda a conversa, decide se responde, chama a IA com ferramentas, envia a resposta, resume conversas longas.                                                                                                  |
| Regras puras (testadas)  | `src/lib/whatsapp-agent-rules.ts` + `.test.ts`                                                         | Prompt fixo (`FIXED_RULES`), `buildSystemPrompt`, filtro de grupos, texto/áudio da mensagem, "só ok/obrigado", espera de rajada (4 s), oferta de horários em sequência, calendário, tempo de "equipe assumiu". |
| Envio / Evolution        | `src/lib/whatsapp.server.ts`, `whatsapp-managed.ts`, `whatsapp-settings.server.ts`                     | `sendText`, credenciais por profissional, criação de instância e QR Code no servidor gerenciado.                                                                                                               |
| Conexão por QR           | `whatsapp-config.functions.ts`, `components/ManagedWhatsAppCard.tsx`                                   | Conectar/desconectar o número da clínica.                                                                                                                                                                      |
| Configuração e conversas | `whatsapp-agent.functions.ts`, `components/WhatsAppAgentCard.tsx`, rota `/_app/configuracoes/whatsapp` | Liga/desliga, modo teste e números de teste, nome do agente, instruções, agenda que ele vê, responder pacientes, tempo de silêncio quando a equipe responde, lista de conversas e "assumir conversa".          |
| Cobrança do adicional    | `whatsapp-agent-plans.ts`, `whatsapp-agent-addon.*`                                                    | Pacotes Essencial (R$ 97, 1.000 respostas), Profissional (R$ 197, 2.500), Clínica (R$ 347, 5.000) via Asaas; 100 respostas grátis em modo teste.                                                               |
| Agenda                   | `agenda-agent.server.ts`, `agenda-hours.server.ts`                                                     | Horário de atendimento, horários livres, fuso de Brasília.                                                                                                                                                     |
| Automação extra          | `whatsapp-followup.server.ts`, `whatsapp-retention.server.ts` (crons)                                  | Retomar lead que parou de responder e paciente que parou de vir.                                                                                                                                               |
| Banco                    | migrations `20261005120000_whatsapp_agent.sql`, `20261005150000_whatsapp_agent_addon.sql`              | `whatsapp_agent_settings`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_agent_addons` (+ `whatsapp_settings`).                                                                                     |

### Como uma mensagem é tratada

1. Evolution chama o webhook → valida a assinatura da instância.
2. Ignora grupos/listas; acha ou cria a conversa pelo telefone.
3. Se a mensagem saiu do celular da clínica (`fromMe`) e não é eco do agente, a equipe assumiu: o agente silencia por N minutos.
4. Áudio até 5 min é transcrito por IA.
5. Portão: agente ligado, modo teste (só números de teste), responder pacientes ou só leads, conversa não assumida, cota do mês.
6. Espera 4 s para juntar mensagens seguidas; não responde "ok/obrigado" sozinho.
7. Cria lead na Captação se não for paciente.
8. IA (`gemini-3.8-flash` pelo gateway da Lovable) com ferramentas: `horarios_livres`, `conferir_horario`, `reservar_horario`, `trocar_reserva`, `cancelar_reserva`, `chamar_atendente`.
9. Grava a resposta ANTES de enviar (para reconhecer o eco) e envia pela Evolution. A cada 12 mensagens resume a conversa (`gemini-3.1-flash-lite`).

## O que prende o agente ao FISIOAI

- **Agenda**: lê `appointments`, `agenda_blocks` e o horário de atendimento da clínica; a reserva vira um bloqueio na agenda do FISIOAI.
- **Pacientes e leads**: `patient_records` (reconhecer paciente pelo telefone), `leads`/`lead_events` (Captação), pré-cadastro.
- **Conta e cobrança**: clínica/dono (`clinics`, `clinic_members`), assinatura e adicional via Asaas.
- **Roteamento de instâncias**: o mesmo webhook desvia o número comercial (`fai_vendas`) e as instâncias de reativação (`fai_reat_`); isso fica fora do app novo.

Núcleo que sai praticamente igual: regras e prompt, webhook, conversas/mensagens, takeover da equipe, áudio, rajada, resumo, conexão por QR e envio pela Evolution.

## Proposta de app separado

Mesma stack do FISIOAI (TanStack Start + Supabase + Cloudflare Workers + AI SDK), para copiar o código com o mínimo de mudança.

```
agente-whatsapp/
  src/
    routes/
      api/public/whatsapp/webhook.ts   # webhook da Evolution (cópia do agent.ts)
      _app/conexao.tsx                  # QR Code do número
      _app/agente.tsx                   # configurações + instruções
      _app/conversas.tsx                # conversas e "assumir"
      _app/agenda.tsx                   # horário de atendimento e reservas
    lib/
      agent/rules.ts                    # = whatsapp-agent-rules.ts (sem termos de fisioterapia fixos)
      agent/handler.server.ts           # = whatsapp-agent.server.ts sem desvios fai_vendas / fai_reat_
      agent/tools.server.ts             # ferramentas da IA sobre a agenda própria
      evolution.server.ts               # sendText, instância, QR (= whatsapp.server + managed)
      agenda.server.ts                  # horários livres e reservas (tabela própria)
      billing/                          # pacotes de respostas (fase 2)
  supabase/migrations/                  # contas, settings, conversas, mensagens, horários, reservas, contatos
```

### Fases

1. **Núcleo funcionando**: conta (login Supabase), conectar número por QR, configurar agente, webhook, responder com IA, takeover da equipe, lista de conversas. Agenda própria simples (horário de atendimento + reservas).
2. **Agenda externa opcional**: Google Calendar (o FISIOAI já tem callback) ou integração com o próprio FISIOAI por API, para quem já usa os dois.
3. **Cobrança**: pacotes de respostas via Asaas (reaproveitar `whatsapp-agent-plans.ts`), modo teste com 100 respostas.
4. **Automações**: follow-up de lead e retomada (crons), se fizer sentido no produto novo.

### Pontos de decisão

- Onde criar o código: repositório novo (recomendado) ou pasta dentro do FISIOAI.
- Público: só clínicas de fisioterapia ou qualquer negócio com agenda (muda o prompt fixo, que hoje fala de tratamento e avaliação).
- O app novo usa o mesmo servidor Evolution gerenciado do FISIOAI (`EVOLUTION_HOST_URL`) ou um próprio.
