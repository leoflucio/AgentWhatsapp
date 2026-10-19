import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  cameFromAd,
  cleanReply,
  isGroupOrBroadcast,
  phoneOf,
  shouldAgentReply,
  textOf,
  announcesCheckOnly,
  calendarText,
  clampTakeoverMinutes,
  takeoverLabel,
  takeoverPatch,
  takeoverUntilISO,
  takeoverUntilText,
  inPeriod,
  isAcknowledgment,
  onlyAcknowledgments,
  spreadSlots,
  sequentialOffer,
  earlierInSamePeriod,
  mentionedHours,
  unverifiedOffer,
  mentionedWeekdays,
  offerText,
  reservationFollowUp,
  stripClosingOffer,
} from "./whatsapp-agent-rules";

describe("agente de WhatsApp — mensagens recebidas", () => {
  it("número de quem mandou, inclusive contas com @lid", () => {
    expect(phoneOf({ key: { remoteJid: "5511987654321@s.whatsapp.net" } })).toBe("5511987654321");
    expect(
      phoneOf({ key: { remoteJid: "12345@lid", senderPn: "5511912345678@s.whatsapp.net" } }),
    ).toBe("5511912345678");
    expect(phoneOf({ key: { remoteJid: "12345@lid" } })).toBeNull();
  });

  it("ignora grupos e transmissões", () => {
    expect(isGroupOrBroadcast("12036@g.us")).toBe(true);
    expect(isGroupOrBroadcast("status@broadcast")).toBe(true);
    expect(isGroupOrBroadcast("5511987654321@s.whatsapp.net")).toBe(false);
  });

  it("texto de mensagem simples, estendida e legenda", () => {
    expect(textOf({ message: { conversation: " oi " } })).toBe("oi");
    expect(textOf({ message: { extendedTextMessage: { text: "quanto custa?" } } })).toBe(
      "quanto custa?",
    );
    expect(textOf({ message: { imageMessage: { caption: "exame" } } })).toBe("exame");
  });

  it("reconhece conversa vinda de anúncio", () => {
    expect(cameFromAd({ contextInfo: { externalAdReply: { title: "x" } } })).toBe(true);
    expect(cameFromAd({ message: { conversation: "oi" } })).toBe(false);
  });
});

describe("agente de WhatsApp — quem ele responde", () => {
  const gate = { enabled: true, testMode: true, testNumbers: ["(11) 98765-4321"] };
  it("modo teste: só os testadores", () => {
    expect(
      shouldAgentReply({ gate, phone: "5511987654321", isPatient: false, humanTakeover: false })
        .reply,
    ).toBe(true);
    expect(
      shouldAgentReply({ gate, phone: "5511900000000", isPatient: false, humanTakeover: false })
        .reply,
    ).toBe(false);
  });
  it("produção: só leads; cliente fica com a equipe", () => {
    const prod = { ...gate, testMode: false };
    expect(
      shouldAgentReply({
        gate: prod,
        phone: "5511900000000",
        isPatient: false,
        humanTakeover: false,
      }).reply,
    ).toBe(true);
    expect(
      shouldAgentReply({
        gate: prod,
        phone: "5511900000000",
        isPatient: true,
        humanTakeover: false,
      }).reply,
    ).toBe(false);
  });
  it("desligado ou assumido pela equipe: não responde", () => {
    expect(
      shouldAgentReply({
        gate: { ...gate, enabled: false },
        phone: "5511987654321",
        isPatient: false,
        humanTakeover: false,
      }).reply,
    ).toBe(false);
    expect(
      shouldAgentReply({ gate, phone: "5511987654321", isPatient: false, humanTakeover: true })
        .reply,
    ).toBe(false);
  });
});

describe("agente de WhatsApp — resposta", () => {
  it("tira emojis e espaços sobrando", () => {
    expect(cleanReply("Olá! 😊 Tudo bem?  👍\n\n\n\nAté já")).toBe("Olá! Tudo bem?\n\nAté já");
  });
  it("instruções levam regras fixas e as do negócio", () => {
    const p = buildSystemPrompt({
      agentName: "Ana",
      instructions: "Endereço: Rua X, 10",
      today: "05/10/2026",
      contact: "Lead novo",
    });
    expect(p).toContain("Seu nome é Ana.");
    expect(p).toContain("NUNCA use emojis");
    expect(p).toContain("Endereço: Rua X, 10");
  });
});

import { audioOf } from "./whatsapp-agent-rules";

describe("agente de WhatsApp — áudio", () => {
  it("reconhece mensagem de voz e a duração", () => {
    expect(
      audioOf({ message: { audioMessage: { seconds: 12, mimetype: "audio/ogg; codecs=opus" } } }),
    ).toEqual({ seconds: 12, mimetype: "audio/ogg; codecs=opus" });
    expect(audioOf({ message: { conversation: "oi" } })).toBeNull();
  });
});

describe("stripClosingOffer", () => {
  it("tira a pergunta genérica do fim", () => {
    expect(stripClosingOffer("Combinado!\n\nPosso te ajudar com mais alguma coisa?")).toBe(
      "Combinado!",
    );
    expect(
      stripClosingOffer("Seu horário está reservado. Quer que eu veja mais alguma coisa?"),
    ).toBe("Seu horário está reservado.");
    expect(stripClosingOffer("Pronto, reservado.\n\nTem mais alguma dúvida?")).toBe(
      "Pronto, reservado.",
    );
  });
  it("mantém perguntas de verdade", () => {
    expect(stripClosingOffer("Qual é o seu nome completo?")).toBe("Qual é o seu nome completo?");
    expect(stripClosingOffer("Prefere quarta às 13h ou quinta às 16h?")).toBe(
      "Prefere quarta às 13h ou quinta às 16h?",
    );
  });
  it("só a pergunta vira vazio", () => {
    expect(stripClosingOffer("Posso ajudar com mais alguma informação?")).toBe("");
  });
});

describe("isAcknowledgment", () => {
  it("reconhece confirmações curtas", () => {
    for (const t of ["Ok", "Combinado", "Obrigado 🙏", "👍", "ok, obrigado!", "Tá bom", "Valeu"])
      expect(isAcknowledgment(t), t).toBe(true);
  });
  it("não confunde com pedidos", () => {
    for (const t of [
      "Ok, mas quanto custa?",
      "Quero mudar o horário",
      "13",
      "Em relação a valores",
    ])
      expect(isAcknowledgment(t), t).toBe(false);
  });
});

describe("onlyAcknowledgments", () => {
  it("só confirmações depois de uma resposta sem pergunta: não responde", () => {
    expect(onlyAcknowledgments(["Ok", "Obrigado"], "Reservado para sexta às 8h.")).toBe(true);
  });
  it("uma confirmação seguida de pergunta precisa de resposta", () => {
    expect(onlyAcknowledgments(["Ok", "Qual o valor da sessão?"], "Reservado.")).toBe(false);
    expect(onlyAcknowledgments(["Qual o valor da sessão,", "?"], "Reservado.")).toBe(false);
  });
  it("agente deixou pergunta pendente ou ainda não respondeu: responde", () => {
    expect(onlyAcknowledgments(["Ok"], "Qual horário fica melhor?")).toBe(false);
    expect(onlyAcknowledgments(["Ok"], null)).toBe(false);
    expect(onlyAcknowledgments([], "Reservado.")).toBe(false);
  });
});

describe("reservationFollowUp", () => {
  it("monta ficha e endereço", () => {
    expect(
      reservationFollowUp({
        preRegistrationLink: "https://x/pre-cadastro/abc",
        address: "Av. Pombal, 1668",
      }),
    ).toBe(
      "Para agilizar seu atendimento, preencha sua ficha de pré-cadastro: https://x/pre-cadastro/abc\n\nEndereço: Av. Pombal, 1668",
    );
  });
  it("sem nada, não envia", () => {
    expect(reservationFollowUp({})).toBeNull();
  });
});

describe("spreadSlots", () => {
  it("no máximo 2 por dia e 8 no total", () => {
    const slots = [
      ...["13", "14", "15", "16"].map((h) => ({ day: "2026-10-07", h })),
      ...["9", "10", "11"].map((h) => ({ day: "2026-10-08", h })),
      { day: "2026-10-09", h: "8" },
    ];
    expect(spreadSlots(slots).map((s) => `${s.day} ${s.h}`)).toEqual([
      "2026-10-07 13",
      "2026-10-07 14",
      "2026-10-08 9",
      "2026-10-08 10",
      "2026-10-09 8",
    ]);
  });
});

describe("sequentialOffer", () => {
  const s = (day: string, h: string) => ({ day, h });
  const fmt = (list: { day: string; h: string }[]) => list.map((x) => `${x.day.slice(8)} ${x.h}`);
  it("vários dias: os dois mais cedo do primeiro dia; depois, o primeiro de cada dia seguinte", () => {
    const slots = [
      s("2026-10-07", "09"),
      s("2026-10-07", "10"),
      s("2026-10-07", "11"),
      s("2026-10-08", "13"),
      s("2026-10-08", "14"),
      s("2026-10-09", "08"),
    ];
    const r = sequentialOffer(slots, { oneDay: false });
    expect(fmt(r.ofereca)).toEqual(["07 09", "07 10"]);
    expect(fmt(r.se_nao_puder)).toEqual(["08 13", "09 08"]);
  });
  it("um dia só: os dois mais cedo e o resto do dia como alternativa", () => {
    const slots = ["09", "10", "11", "14"].map((h) => s("2026-10-07", h));
    const r = sequentialOffer(slots, { oneDay: true });
    expect(fmt(r.ofereca)).toEqual(["07 09", "07 10"]);
    expect(fmt(r.se_nao_puder)).toEqual(["07 11", "07 14"]);
  });
  it("primeiro dia com um horário só completa com o dia seguinte", () => {
    const r = sequentialOffer([s("2026-10-07", "19"), s("2026-10-08", "13")], { oneDay: false });
    expect(fmt(r.ofereca)).toEqual(["07 19", "08 13"]);
    expect(r.se_nao_puder).toEqual([]);
  });
  it("sem horários", () => {
    expect(sequentialOffer([], { oneDay: false })).toEqual({ ofereca: [], se_nao_puder: [] });
  });
});

describe("buildSystemPrompt — qualquer negócio", () => {
  const base = { today: "10/10/2026", contact: "x" };
  it("com agenda, leva as regras de reserva", () => {
    const p = buildSystemPrompt({
      ...base,
      businessName: "Studio Bela",
      segment: "salão de beleza",
    });
    expect(p).toContain("NEGÓCIO: Studio Bela (salão de beleza)");
    expect(p).toContain("reservar_horario");
    expect(p).not.toContain("diagnóstico");
  });
  it("sem agenda, não fala de horários e passa para a equipe", () => {
    const p = buildSystemPrompt({ ...base, booking: false, sequentialFill: true });
    expect(p).not.toContain("reservar_horario");
    expect(p).not.toContain("em sequência");
    expect(p).toContain("não tem acesso a agenda");
  });
  it("regras da saúde só quando ligadas", () => {
    expect(buildSystemPrompt({ ...base, health: true })).toContain("pronto-socorro");
    expect(buildSystemPrompt(base)).not.toContain("pronto-socorro");
  });
});

describe("buildSystemPrompt — preenchimento sequencial", () => {
  it("só inclui a regra quando o negócio liga a opção", () => {
    const base = { today: "10/10/2026", contact: "x" };
    expect(buildSystemPrompt({ ...base, sequentialFill: true })).toContain("em sequência");
    expect(buildSystemPrompt(base)).not.toContain("em sequência");
  });
});

describe("horários citados sem consultar a agenda", () => {
  it("lê os horários oferecidos na resposta", () => {
    expect(mentionedHours("Tenho terça às 13h ou 14h30. Qual fica melhor?")).toEqual([
      "13:00",
      "14:30",
    ]);
    expect(mentionedHours("Pode ser quinta 09:00?")).toEqual(["09:00"]);
  });
  it("ignora faixas de horário de atendimento e valores", () => {
    expect(mentionedHours("Atendemos das 13h às 20h. A sessão é R$ 200.")).toEqual([]);
    expect(mentionedHours("Funcionamos 8h até 12h na sexta")).toEqual([]);
  });
  it("aponta o horário ou o dia que a agenda não devolveu", () => {
    const checked = JSON.stringify([
      { data: "2026-10-14", hora: "15:00" },
      { label: "qua., 14/10, 16:00" },
    ]);
    expect(unverifiedOffer("Tenho quarta às 13h ou 15h.", checked)).toEqual(["13:00"]);
    expect(unverifiedOffer("Tenho quarta às 15h ou 16h.", checked)).toEqual([]);
    // 14/10/2026 é quarta: "terça às 15h" é dia trocado.
    expect(unverifiedOffer("Tenho terça às 15h.", checked)).toEqual(["terça-feira"]);
    expect(unverifiedOffer("Combinado, até lá!", "")).toEqual([]);
    expect(unverifiedOffer("A sessão dura 1h. Abrimos às 7h.", "")).toEqual([]);
    expect(unverifiedOffer("Cancele com 12h de antecedência.", "")).toEqual([]);
    expect(unverifiedOffer("Tenho amanhã às 9h.", "")).toEqual(["09:00"]);
  });
  it("dias da semana citados, sem contar faixas", () => {
    expect(mentionedWeekdays("Tenho terça ou quinta-feira")).toEqual([2, 4]);
    expect(mentionedWeekdays("Atendemos de segunda a sexta")).toEqual([]);
  });
});

describe("offerText", () => {
  it("dois horários no mesmo dia", () => {
    expect(
      offerText([
        { data: "2026-10-14", hora: "09:00" },
        { data: "2026-10-14", hora: "10:30" },
      ]),
    ).toBe("Tenho quarta-feira (14/10) às 9h ou às 10h30. Qual fica melhor para você?");
  });
  it("dias diferentes e nenhum horário", () => {
    expect(
      offerText([
        { data: "2026-10-14", hora: "19:00" },
        { data: "2026-10-15", hora: "13:00" },
      ]),
    ).toBe(
      "Tenho quarta-feira (14/10) às 19h ou quinta-feira (15/10) às 13h. Qual fica melhor para você?",
    );
    expect(offerText([])).toBeNull();
  });
});

describe("earlierInSamePeriod", () => {
  const free = ["08:00", "09:00", "10:00", "13:00", "14:00", "19:00"].map((hora) => ({ hora }));
  it("pediu 11h com 9h e 10h livres: devolve os anteriores da manhã", () => {
    expect(earlierInSamePeriod(free, "11:00").map((x) => x.hora)).toEqual([
      "08:00",
      "09:00",
      "10:00",
    ]);
  });
  it("não puxa horários de outro período", () => {
    expect(earlierInSamePeriod(free, "13:00")).toEqual([]);
    expect(earlierInSamePeriod(free, "15:00").map((x) => x.hora)).toEqual(["13:00", "14:00"]);
    expect(earlierInSamePeriod(free, "19:00")).toEqual([]);
  });
});

describe("announcesCheckOnly", () => {
  it("detecta resposta que só promete verificar", () => {
    expect(announcesCheckOnly("Deixe-me verificar novamente os horários livres para você.")).toBe(
      true,
    );
    expect(announcesCheckOnly("Um momento, vou consultar a agenda.")).toBe(true);
  });
  it("não pega respostas normais", () => {
    expect(announcesCheckOnly("Tenho quarta às 13h ou quinta às 16h. Qual prefere?")).toBe(false);
  });
});

describe("shouldAgentReply — clientes", () => {
  const base = { enabled: true, testMode: false, testNumbers: [] };
  it("com 'responder clientes' ligado, atende cliente", () => {
    const r = shouldAgentReply({
      gate: { ...base, replyPatients: true },
      phone: "5583988353879",
      isPatient: true,
      humanTakeover: false,
    });
    expect(r.reply).toBe(true);
  });
  it("desligado (padrão), cliente fica com a equipe", () => {
    const r = shouldAgentReply({
      gate: base,
      phone: "5583988353879",
      isPatient: true,
      humanTakeover: false,
    });
    expect(r.reply).toBe(false);
  });
  it("conversa assumida pela equipe continua sem resposta", () => {
    const r = shouldAgentReply({
      gate: { ...base, replyPatients: true },
      phone: "5583988353879",
      isPatient: true,
      humanTakeover: true,
    });
    expect(r.reply).toBe(false);
  });
});

describe("calendarText", () => {
  it("traz dia da semana e data certos", () => {
    const t = calendarText("2026-10-06", 5);
    expect(t).toBe(
      "terça-feira 06/10/2026 = 2026-10-06 (hoje); quarta-feira 07/10/2026 = 2026-10-07 (amanhã); quinta-feira 08/10/2026 = 2026-10-08; sexta-feira 09/10/2026 = 2026-10-09; sábado 10/10/2026 = 2026-10-10",
    );
  });
  it("vira o mês", () => {
    expect(calendarText("2026-10-30", 3)).toContain("domingo 01/11/2026 = 2026-11-01");
  });
});

describe("inPeriod", () => {
  it("manhã, tarde e noite", () => {
    expect(inPeriod("08:00", "manha")).toBe(true);
    expect(inPeriod("11:00", "manha")).toBe(true);
    expect(inPeriod("12:00", "manha")).toBe(false);
    expect(inPeriod("13:00", "tarde")).toBe(true);
    expect(inPeriod("18:00", "tarde")).toBe(false);
    expect(inPeriod("19:00", "noite")).toBe(true);
    expect(inPeriod("19:00", undefined)).toBe(true);
  });
});

describe("devolução automática ao agente", () => {
  it("prazo a partir de agora, com padrão e limites", () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    expect(takeoverUntilISO(now, 30)).toBe("2026-10-08T12:30:00.000Z");
    expect(clampTakeoverMinutes(undefined)).toBe(5);
    expect(clampTakeoverMinutes(null)).toBe(5);
    expect(clampTakeoverMinutes(0)).toBe(0);
    expect(clampTakeoverMinutes(1)).toBe(5);
    expect(clampTakeoverMinutes(99999)).toBe(1440);
  });
  it("volta sozinho em 5 minutos por padrão; 0 desliga a volta automática", () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    expect(takeoverPatch(now, undefined)).toEqual({ takeover_until: "2026-10-08T12:05:00.000Z" });
    expect(takeoverPatch(now, 0)).toEqual({ human_takeover: true, takeover_until: null });
    expect(takeoverLabel(0)).toContain("Devolver ao agente");
    // Volta assim que a equipe responde: chamar a equipe silencia sem prazo,
    // a resposta da equipe devolve na hora.
    expect(takeoverPatch(now, -1)).toEqual({ human_takeover: true, takeover_until: null });
    expect(takeoverPatch(now, -1, true)).toEqual({ human_takeover: false, takeover_until: null });
    expect(takeoverPatch(now, 30, true)).toEqual({ takeover_until: "2026-10-08T12:30:00.000Z" });
    expect(takeoverLabel(-1)).toBe("Assim que a equipe responder");
  });
  it("rótulos", () => {
    expect(takeoverLabel(30)).toBe("30 minutos");
    expect(takeoverLabel(60)).toBe("1 hora");
    expect(takeoverLabel(1440)).toBe("24 horas");
  });
  it("prazo de outro dia mostra a data", () => {
    const now = new Date(2026, 9, 8, 22, 23).getTime();
    expect(takeoverUntilText(new Date(2026, 9, 8, 22, 38).toISOString(), now)).toBe("22:38");
    expect(takeoverUntilText(new Date(2026, 9, 9, 12, 36).toISOString(), now)).toBe("09/10, 12:36");
  });
});

describe("unverifiedOffer sem dia citado", () => {
  it("confere oferta sem dia", async () => {
    const { unverifiedOffer } = await import("./whatsapp-agent-rules");
    expect(unverifiedOffer("Tenho às 10h ou às 15h, qual prefere?", "")).not.toEqual([]);
    expect(unverifiedOffer("Tenho dia 15 às 10h", "")).not.toEqual([]);
    expect(unverifiedOffer("Tenho às 10h, qual prefere?", "2026-10-15 10:00")).toEqual([]);
  });
});

describe("agendar direto", () => {
  it("troca a regra de só reservar pela de agendar", () => {
    const base = { today: "05/10/2026", contact: "Contato novo." };
    expect(buildSystemPrompt(base)).toContain("Você NÃO confirma agendamentos");
    const auto = buildSystemPrompt({ ...base, autoConfirm: true });
    expect(auto).toContain("Você AGENDA direto");
    expect(auto).not.toContain("Você NÃO confirma agendamentos");
  });
});
