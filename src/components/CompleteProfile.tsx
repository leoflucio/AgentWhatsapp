import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskPhone } from "@/lib/phone";
import { checkProfile, maskDoc } from "@/lib/profile-rules";
import { saveProfile } from "@/lib/profile.functions";

/** Pedido a quem entrou pelo Google (ou é de antes do cadastro completo). */
export function CompleteProfile({ suggestedName }: { suggestedName: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState(suggestedName);
  const [phone, setPhone] = useState("");
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = checkProfile({ name, phone, doc });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setBusy(true);
    try {
      await saveProfile({ data: { name, phone, doc } });
      await qc.invalidateQueries({ queryKey: ["perfil"] });
      await qc.invalidateQueries({ queryKey: ["planos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Complete seu cadastro</CardTitle>
        <p className="text-sm text-muted-foreground">
          Só falta isso para começar. Usamos para falar com você e para a cobrança do plano.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-nome">Nome completo</Label>
            <Input
              id="p-nome"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-tel">Celular (WhatsApp)</Label>
            <Input
              id="p-tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 99999-9999"
              required
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-doc">CPF ou CNPJ</Label>
            <Input
              id="p-doc"
              inputMode="numeric"
              required
              value={doc}
              onChange={(e) => setDoc(maskDoc(e.target.value))}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            Salvar e continuar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
