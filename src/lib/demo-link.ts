import { normalizeWhatsApp } from "@/lib/phone";

/** Mensagem que já vem escrita quando o visitante abre a conversa com o número de demonstração. */
export const DEMO_MESSAGE = "Oi! Vim pelo site e quero ver a secretária funcionando.";

/**
 * Link do WhatsApp para o número de demonstração (`DEMO_WHATSAPP`).
 * Null quando o número está vazio ou inválido: aí a página não mostra o botão.
 */
export function demoWhatsAppLink(raw: string | null | undefined): string | null {
  const phone = normalizeWhatsApp(raw);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(DEMO_MESSAGE)}`;
}
