import { createFileRoute } from "@tanstack/react-router";

// Liga o app da Play Store (TWA) a este site, para abrir em tela cheia sem a
// barra do navegador. ANDROID_PACKAGE (ex.: br.com.secretariadigital24h.twa) e
// ANDROID_SHA256 (impressão digital da chave de assinatura do Play Console;
// várias separadas por vírgula) vêm do .env.
export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: () => {
        const pkg = (process.env.ANDROID_PACKAGE ?? "").trim();
        const prints = (process.env.ANDROID_SHA256 ?? "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        const body =
          pkg && prints.length
            ? [
                {
                  relation: ["delegate_permission/common.handle_all_urls"],
                  target: {
                    namespace: "android_app",
                    package_name: pkg,
                    sha256_cert_fingerprints: prints,
                  },
                },
              ]
            : [];
        return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
      },
    },
  },
});
