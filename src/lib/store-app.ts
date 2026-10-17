// App da Play Store (TWA): o Android abre o site com document.referrer
// "android-app://<pacote>". Dentro do app da loja não mostramos pagamento
// (regras do Google Play); a assinatura é feita pelo navegador.
import { useEffect, useState } from "react";

const KEY = "app_loja";

export function detectStoreApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (document.referrer.startsWith("android-app://")) sessionStorage.setItem(KEY, "1");
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return document.referrer.startsWith("android-app://");
  }
}

/** Falso no servidor e na primeira pintura (evita diferença de hidratação). */
export function useStoreApp(): boolean {
  const [store, setStore] = useState(false);
  useEffect(() => setStore(detectStoreApp()), []);
  return store;
}
