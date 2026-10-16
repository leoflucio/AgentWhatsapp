// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type UserConfig } from "vite";

type LovableUserConfig = UserConfig & {
  tanstackStart?: Record<string, unknown>;
};

// Redireciona a entrada do servidor do TanStack Start para src/server.ts.
export default defineConfig(({ mode }) => {
  // Variáveis de servidor (SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_HOST_KEY...) em process.env
  // para as rotas e server functions. Nunca vão para o cliente.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    tanstackStart: { server: { entry: "server" } },
    envPrefix: "VITE_",
  } as LovableUserConfig;
});
