-- Módulo de Precificação (custos, insumos, fichas técnicas ligadas aos produtos do cardápio).
-- Só aparece no painel da loja quando o administrador da plataforma liga o módulo.

alter table lojas add column modulo_precificacao boolean not null default false;

-- Dono da loja pode editar os dados da própria loja, mas não os campos que só o
-- administrador da plataforma controla (loja ativa e módulos contratados).
-- Funções do servidor (service role, sem usuário logado) continuam podendo alterar.
create or replace function proteger_campos_admin_loja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not eh_admin_plataforma() then
    if new.plataforma_ativa is distinct from old.plataforma_ativa
       or new.modulo_precificacao is distinct from old.modulo_precificacao then
      raise exception 'Somente o administrador da plataforma pode alterar este campo.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_lojas_campos_admin before update on lojas
  for each row execute function proteger_campos_admin_loja();

-- Configuração geral (uma linha por loja). Percentuais guardados como número: 6 = 6%.
create table precificacao_config (
  loja_id uuid primary key references lojas(id) on delete cascade,
  faturamento_medio numeric(12,2) not null default 0 check (faturamento_medio >= 0),
  imposto_pct numeric(6,2) not null default 0 check (imposto_pct between 0 and 100),
  cartao_pct numeric(6,2) not null default 0 check (cartao_pct between 0 and 100),
  delivery_pct numeric(6,2) not null default 0 check (delivery_pct between 0 and 100),
  outros_pct numeric(6,2) not null default 0 check (outros_pct between 0 and 100),
  lucro_padrao_pct numeric(6,2) not null default 15 check (lucro_padrao_pct between 0 and 100),
  atualizado_em timestamptz not null default now()
);

create table custos_fixos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  descricao text not null check (length(trim(descricao)) > 0),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  criado_em timestamptz not null default now()
);
create index on custos_fixos (loja_id);

create table insumos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  unidade text not null default 'g' check (unidade in ('g', 'kg', 'ml', 'l', 'und')),
  qtd_compra numeric(12,3) not null check (qtd_compra > 0),
  valor_compra numeric(12,2) not null check (valor_compra >= 0),
  atualizado_em timestamptz not null default now()
);
create index on insumos (loja_id);

-- Chaves compostas (id + loja) para garantir que ficha, produto e insumo são sempre da mesma loja
alter table produtos add constraint produtos_id_loja_key unique (id, loja_id);
alter table insumos add constraint insumos_id_loja_key unique (id, loja_id);

-- Ficha técnica: uma por produto do cardápio
create table fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  produto_id uuid not null unique,
  rendimento numeric(10,3) not null default 1 check (rendimento > 0),
  lucro_pct numeric(6,2) check (lucro_pct between 0 and 100),
  atualizado_em timestamptz not null default now(),
  foreign key (produto_id, loja_id) references produtos(id, loja_id) on delete cascade,
  unique (id, loja_id)
);
create index on fichas_tecnicas (loja_id);

create table ficha_itens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  ficha_id uuid not null,
  insumo_id uuid not null,
  qtd numeric(12,3) not null check (qtd > 0),
  foreign key (ficha_id, loja_id) references fichas_tecnicas(id, loja_id) on delete cascade,
  foreign key (insumo_id, loja_id) references insumos(id, loja_id) on delete restrict
);
create index on ficha_itens (ficha_id);
create index on ficha_itens (insumo_id);

alter table precificacao_config enable row level security;
alter table custos_fixos enable row level security;
alter table insumos enable row level security;
alter table fichas_tecnicas enable row level security;
alter table ficha_itens enable row level security;

-- Dados internos da loja: só a equipe da própria loja vê e altera (nada é público).
create policy "precificacao_config: equipe" on precificacao_config for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "custos_fixos: equipe" on custos_fixos for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "insumos: equipe" on insumos for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "fichas_tecnicas: equipe" on fichas_tecnicas for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "ficha_itens: equipe" on ficha_itens for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
