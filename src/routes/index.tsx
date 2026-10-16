import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { loading, session } = useAuth();
  if (loading) return null;
  return <Navigate to={session ? "/conversas" : "/login"} />;
}
