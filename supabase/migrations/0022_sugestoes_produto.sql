-- Sugestão de combinação: ao cadastrar um produto, a loja escolhe quais categorias
-- sugerir ao cliente assim que ele adiciona esse produto ao carrinho (ex.: sugerir a
-- categoria "Bebidas" logo depois que o cliente adiciona uma pizza ao pedido).
-- Consultado pelo cardápio público (Cardapio.tsx) para mostrar a sugestão.
create table produto_sugestoes (
  produto_id uuid not null references produtos on delete cascade,
  categoria_id uuid not null references categorias on delete cascade,
  primary key (produto_id, categoria_id)
);
alter table produto_sugestoes enable row level security;
create policy "produto_sugestoes: leitura pública" on produto_sugestoes for select using (true);
create policy "produto_sugestoes: equipe gerencia" on produto_sugestoes for all
  using (exists (select 1 from produtos p where p.id = produto_id and eh_membro(p.loja_id)))
  with check (exists (select 1 from produtos p where p.id = produto_id and eh_membro(p.loja_id)));
grant select on produto_sugestoes to anon, authenticated;
grant insert, update, delete on produto_sugestoes to authenticated;

notify pgrst, 'reload schema';
