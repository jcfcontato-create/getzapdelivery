-- GetZap Delivery: permissões de acesso à API do Supabase.
-- Projetos novos do Supabase não liberam as tabelas automaticamente, então liberamos aqui.
-- As regras (RLS) do 0001_schema.sql continuam valendo: o público só lê o cardápio,
-- e os pedidos NÃO ficam acessíveis ao público.
grant usage on schema public to anon, authenticated;

-- Leitura pública do cardápio
grant select on lojas, categorias, produtos, zonas_entrega to anon, authenticated;

-- Equipe da loja (usuário logado)
grant update on lojas to authenticated;
grant insert, update, delete on categorias, produtos, zonas_entrega to authenticated;
grant select on membros to authenticated;
grant select, update on pedidos to authenticated;
grant select on itens_pedido to authenticated;

-- Função usada pelas regras de acesso
grant execute on function eh_membro(uuid) to anon, authenticated;
