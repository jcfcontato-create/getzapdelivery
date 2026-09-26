-- Adiciona e-mail e CPF/CNPJ da loja, e uma tabela de redes sociais (cada uma com
-- seu link), para mostrar no rodapé da tela onde o cliente faz o pedido.
alter table lojas add column if not exists email text;
alter table lojas add column if not exists cpf_cnpj text;

create table redes_sociais (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  rede text not null check (rede in ('instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'whatsapp', 'site')),
  url text not null,
  ordem int not null default 0
);
alter table redes_sociais enable row level security;
create policy "redes_sociais: leitura pública" on redes_sociais for select using (true);
create policy "redes_sociais: equipe gerencia" on redes_sociais for all
  using (eh_membro(loja_id)) with check (eh_membro(loja_id));
grant select on redes_sociais to anon, authenticated;
grant insert, update, delete on redes_sociais to authenticated;

notify pgrst, 'reload schema';
