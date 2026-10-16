// Tipos do banco. Ao conectar o Supabase pelo Lovable, este arquivo é gerado
// de novo a partir das tabelas reais; até lá, um tipo genérico.
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
