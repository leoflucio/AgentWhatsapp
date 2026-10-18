// Botão "Entrar com Google" do próprio Google (Google Identity Services) no nosso domínio:
// a tela do Google mostra o nome do app e secretariadigital24h.com.br, não o endereço do Supabase.
// O token recebido vai para supabase.auth.signInWithIdToken com o nonce original.

/* eslint-disable @typescript-eslint/no-explicit-any */
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if ((window as any).google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Não foi possível carregar o login do Google."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Nonce aleatório e o seu SHA-256 em hex (o Google recebe o hash; o Supabase, o original). */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

export function googleId(): any {
  return (window as any).google.accounts.id;
}
