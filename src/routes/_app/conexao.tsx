import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectionStatus, connectWhatsApp, disconnectWhatsApp } from "@/lib/connection.functions";

export const Route = createFileRoute("/_app/conexao")({ component: ConexaoPage });

const STATE_LABEL = {
  conectado: "Conectado",
  aguardando_qr: "Aguardando leitura do QR Code",
  desconectado: "Desconectado",
} as const;

function ConexaoPage() {
  const qc = useQueryClient();
  const [qr, setQr] = useState<{ qr: string | null; pairingCode: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["conexao"],
    queryFn: () => connectionStatus(),
    // Enquanto o QR está na tela, confere a conexão a cada 4 s.
    refetchInterval: qr ? 4000 : false,
  });
  const state = status.data?.state ?? "desconectado";
  useEffect(() => {
    if (state === "conectado") setQr(null);
  }, [state]);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await connectWhatsApp();
      setQr(r.state === "conectado" ? null : { qr: r.qr, pairingCode: r.pairingCode });
      await qc.invalidateQueries({ queryKey: ["conexao"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Desconectar o WhatsApp? O agente para de responder.")) return;
    setBusy(true);
    try {
      await disconnectWhatsApp();
      setQr(null);
      await qc.invalidateQueries({ queryKey: ["conexao"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desconectar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          WhatsApp da clínica
          <Badge variant={state === "conectado" ? "default" : "secondary"}>
            {STATE_LABEL[state]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.data && !status.data.available ? (
          <p className="text-sm text-muted-foreground">
            O servidor de WhatsApp ainda não foi configurado (EVOLUTION_HOST_URL e
            EVOLUTION_HOST_KEY).
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conecte o número que vai atender: no celular, abra o WhatsApp › Aparelhos conectados ›
              Conectar um aparelho e leia o QR Code.
            </p>
            {qr?.qr && (
              <img src={qr.qr} alt="QR Code do WhatsApp" className="h-64 w-64 rounded border" />
            )}
            {qr?.pairingCode && (
              <p className="text-sm">
                Ou use o código: <strong>{qr.pairingCode}</strong>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {state !== "conectado" && (
                <Button onClick={connect} disabled={busy}>
                  {qr ? "Gerar outro QR Code" : "Conectar WhatsApp"}
                </Button>
              )}
              {state !== "desconectado" && (
                <Button variant="outline" onClick={disconnect} disabled={busy}>
                  Desconectar
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
