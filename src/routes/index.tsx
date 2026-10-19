import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { detectStoreApp } from "@/lib/store-app";
import { Landing } from "@/components/Landing";

export const Route = createFileRoute("/")({ component: Home });

/** App instalado (Play Store ou atalho na tela inicial): vai direto ao login, sem a página de vendas. */
function isInstalledApp(): boolean {
  if (detectStoreApp()) return true;
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function Home() {
  const { loading, session } = useAuth();
  const [installed, setInstalled] = useState(false);
  useEffect(() => setInstalled(isInstalledApp()), []);

  if (!loading && session) return <Navigate to="/conversas" />;
  if (installed) return <Navigate to="/login" />;
  return <Landing />;
}
