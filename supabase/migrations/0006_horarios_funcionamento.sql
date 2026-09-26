-- Horário de funcionamento (por dia da semana), editável na aba "Loja" do painel.
-- 0 = domingo, 1 = segunda, ... 6 = sábado (mesma numeração do JavaScript).
create table if not exists horarios_funcionamento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  abre time,
  fecha time,
  fechado boolean not null default false,
  unique (loja_id, dia_semana)
);

alter table horarios_funcionamento enable row level security;
create policy "horarios: leitura pública" on horarios_funcionamento for select using (true);
create policy "horarios: equipe gerencia" on horarios_funcionamento for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));

grant select on horarios_funcionamento to anon, authenticated;
grant insert, update, delete on horarios_funcionamento to authenticated;

notify pgrst, 'reload schema';
