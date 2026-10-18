// ID do cliente OAuth do Google (público, vai para o navegador). Lido em tempo de execução
// para não precisar refazer o build quando muda. Sem ele, o login usa o redirecionamento do Supabase.
import { createServerFn } from "@tanstack/react-start";

export const getGoogleClientId = createServerFn({ method: "GET" }).handler(async () => {
  return { clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "" };
});
