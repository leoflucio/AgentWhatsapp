import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkProfile, maskDoc } from "@/lib/profile-rules";
import { maskPhone } from "@/lib/phone";
import { getGoogleClientId } from "@/lib/google-login.functions";
import { googleId, loadGoogleIdentity, makeNonce } from "@/lib/google-identity";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) void navigate({ to: "/conversas" });
  }, [session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const r = checkProfile({ name, phone, doc });
        if (!r.ok) throw new Error(r.error);
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/conversas`,
            // Vai para a conta no primeiro acesso (getProfile).
            data: { full_name: r.profile.name, phone: r.profile.phone, doc: r.profile.doc },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Confira seu e-mail se for pedida a confirmação.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "entrar" ? "Entrar" : "Criar conta"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Atendente virtual com IA no WhatsApp do seu negócio.
          </p>
        </CardHeader>
        <CardContent>
          <GoogleLogin mode={mode} busy={busy} setBusy={setBusy} />
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou com e-mail
            <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === "criar" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tel">Celular (WhatsApp)</Label>
                  <Input
                    id="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(11) 99999-9999"
                    required
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc">CPF ou CNPJ</Label>
                  <Input
                    id="doc"
                    inputMode="numeric"
                    required
                    value={doc}
                    onChange={(e) => setDoc(maskDoc(e.target.value))}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete={mode === "entrar" ? "current-password" : "new-password"}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "entrar" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground underline"
            onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
          >
            {mode === "entrar" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}
          </button>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/privacidade" className="underline">
              Privacidade
            </Link>
            {" · "}
            <Link to="/termos" className="underline">
              Termos
            </Link>
            {" · "}
            <Link to="/excluir-conta" className="underline">
              Excluir conta
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Com GOOGLE_CLIENT_ID no servidor, usa o botão do próprio Google no nosso domínio
 * (a tela do Google mostra o app, não o endereço do Supabase). Sem ele, o redirecionamento do Supabase.
 */
function GoogleLogin({
  mode,
  busy,
  setBusy,
}: {
  mode: "entrar" | "criar";
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const cfg = useQuery({
    queryKey: ["google-client-id"],
    queryFn: () => getGoogleClientId(),
    staleTime: Infinity,
  });
  const clientId = cfg.data?.clientId ?? "";
  const box = useRef<HTMLDivElement>(null);
  const [gisFailed, setGisFailed] = useState(false);

  useEffect(() => {
    if (!clientId || !box.current) return;
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleIdentity();
        const nonce = await makeNonce();
        if (cancelled || !box.current) return;
        googleId().initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          ux_mode: "popup",
          callback: async (resp: { credential?: string }) => {
            if (!resp.credential) return;
            setBusy(true);
            const { error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: resp.credential,
              nonce: nonce.raw,
            });
            if (error) {
              toast.error("Não foi possível entrar com o Google.");
              setBusy(false);
            }
          },
        });
        box.current.innerHTML = "";
        googleId().renderButton(box.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: mode === "entrar" ? "signin_with" : "signup_with",
          locale: "pt-BR",
          width: Math.min(400, box.current.offsetWidth || 320),
        });
      } catch {
        if (!cancelled) setGisFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, mode, setBusy]);

  const redirect = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/conversas` },
    });
    if (error) {
      toast.error("Não foi possível entrar com o Google.");
      setBusy(false);
    }
  };

  if (cfg.isPending) return <div className="h-10" />;
  if (clientId && !gisFailed) return <div ref={box} className="flex h-10 w-full justify-center" />;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={busy}
      onClick={() => void redirect()}
    >
      <GoogleIcon />
      {mode === "entrar" ? "Entrar com Google" : "Criar conta com Google"}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}
