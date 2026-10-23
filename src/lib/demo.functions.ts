// Número de demonstração mostrado na página de vendas. Lido em tempo de execução
// (DEMO_WHATSAPP no .env) para trocar o número sem refazer o build. Vazio = sem botão.
import { createServerFn } from "@tanstack/react-start";
import { demoWhatsAppLink } from "@/lib/demo-link";

export const getDemoLink = createServerFn({ method: "GET" }).handler(async () => {
  return { link: demoWhatsAppLink(process.env.DEMO_WHATSAPP) };
});
