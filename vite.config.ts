import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Build para Node (servidor próprio, ex.: VPS com Docker): `node .output/server/index.mjs`.
export default defineConfig(({ mode }) => {
  // Em desenvolvimento, as variáveis de servidor do .env (SUPABASE_SERVICE_ROLE_KEY,
  // EVOLUTION_HOST_KEY...) vão para process.env. Só as VITE_* chegam ao navegador.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ""), ...process.env });
  return {
    server: { port: 3000 },
    plugins: [
      tsConfigPaths(),
      tanstackStart({ server: { entry: "server" } }),
      nitro({ preset: "node-server" }),
      viteReact(),
      tailwindcss(),
    ],
  };
});
