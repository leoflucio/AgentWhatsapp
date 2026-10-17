-- Dados do cliente pedidos no cadastro (e-mail ou Google): nome, celular e CPF/CNPJ.
-- Pode rodar de novo com segurança.
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS owner_phone text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS owner_doc text;
