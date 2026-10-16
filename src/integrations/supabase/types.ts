// Tipos do banco. Tipo genérico; para tipos exatos, gere com
// `npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = { Row: any; Insert: any; Update: any; Relationships: [] };

export type Database = {
  public: {
    Tables: Record<string, AnyTable>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
