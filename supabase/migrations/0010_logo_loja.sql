-- Adiciona o logo da loja, mostrado à esquerda do nome no banner do cardápio.
alter table lojas add column if not exists logo_url text;

notify pgrst, 'reload schema';
