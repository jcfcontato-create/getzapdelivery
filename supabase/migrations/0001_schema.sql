-- GetZap Delivery, fase 1: lojas, cardápio, entrega e pedidos.
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
create extension if not exists pgcrypto;

create table lojas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  whatsapp text not null check (whatsapp ~ '^[0-9]{12,13}$'), -- só dígitos, com 55 + DDD
  cor text not null default '#C9A24B',
  aberta boolean not null default true,
  aceita_retirada boolean not null default true,
  endereco text,
  criada_em timestamptz not null default now()
);
create table membros (
  loja_id uuid not null references lojas on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (loja_id, user_id)
);
create table categorias (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  nome text not null,
  ordem int not null default 0
);
create table produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  categoria_id uuid not null references categorias on delete cascade,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null check (preco >= 0),
  foto_url text,
  ativo boolean not null default true,
  ordem int not null default 0
);
create table zonas_entrega (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  bairro text not null,
  taxa numeric(10,2) not null default 0 check (taxa >= 0),
  unique (loja_id, bairro)
);
create table contador_pedidos (
  loja_id uuid primary key references lojas on delete cascade,
  ultimo int not null default 0
);
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  numero int not null,
  status text not null default 'novo' check (status in ('novo','em_preparo','saiu_para_entrega','entregue','cancelado')),
  cliente_nome text not null,
  cliente_telefone text not null,
  tipo text not null check (tipo in ('entrega','retirada')),
  bairro text,
  endereco text,
  pagamento text not null check (pagamento in ('dinheiro','cartao','pix')),
  troco_para text,
  observacao text,
  subtotal numeric(10,2) not null default 0,
  taxa_entrega numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  criado_em timestamptz not null default now(),
  unique (loja_id, numero)
);
create table itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos on delete cascade,
  produto_id uuid references produtos on delete set null,
  nome text not null,
  preco_unit numeric(10,2) not null,
  qtd int not null check (qtd > 0)
);

-- Quem é dono/equipe da loja (usado nas regras de acesso)
create or replace function eh_membro(p_loja uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where loja_id = p_loja and user_id = auth.uid())
$$;

-- Regras de acesso (RLS): o público só lê o cardápio; pedidos só a equipe da loja vê.
alter table lojas enable row level security;
alter table membros enable row level security;
alter table categorias enable row level security;
alter table produtos enable row level security;
alter table zonas_entrega enable row level security;
alter table contador_pedidos enable row level security; -- sem regras: só a função abaixo mexe
alter table pedidos enable row level security;
alter table itens_pedido enable row level security;

create policy "lojas: leitura pública" on lojas for select using (true);
create policy "lojas: equipe edita" on lojas for update using (eh_membro(id));
create policy "membros: ver o próprio" on membros for select using (user_id = auth.uid());
create policy "categorias: leitura pública" on categorias for select using (true);
create policy "categorias: equipe gerencia" on categorias for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "produtos: leitura" on produtos for select using (ativo or eh_membro(loja_id));
create policy "produtos: equipe gerencia" on produtos for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "zonas: leitura pública" on zonas_entrega for select using (true);
create policy "zonas: equipe gerencia" on zonas_entrega for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "pedidos: equipe vê" on pedidos for select using (eh_membro(loja_id));
create policy "pedidos: equipe atualiza" on pedidos for update using (eh_membro(loja_id));
create policy "itens: equipe vê" on itens_pedido for select
  using (exists (select 1 from pedidos p where p.id = pedido_id and eh_membro(p.loja_id)));

-- Cria o pedido no servidor: preços e taxa vêm do banco, nunca do navegador.
create or replace function criar_pedido(p_slug text, p_cliente jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja lojas; v_ped uuid; v_num int; v_sub numeric := 0; v_taxa numeric := 0;
  v_tipo text := p_cliente->>'tipo'; v_bairro text := nullif(p_cliente->>'bairro', '');
  it jsonb; pr produtos; q int;
begin
  select * into v_loja from lojas where slug = p_slug;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if not v_loja.aberta then raise exception 'A loja está fechada no momento.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'O carrinho está vazio.'; end if;
  if coalesce(trim(p_cliente->>'nome'), '') = '' or coalesce(trim(p_cliente->>'telefone'), '') = '' then
    raise exception 'Informe nome e telefone.';
  end if;
  if v_tipo = 'entrega' then
    select taxa into v_taxa from zonas_entrega where loja_id = v_loja.id and bairro = v_bairro;
    if not found then raise exception 'Bairro não atendido.'; end if;
    if coalesce(trim(p_cliente->>'endereco'), '') = '' then raise exception 'Informe o endereço.'; end if;
  elsif v_tipo = 'retirada' then
    if not v_loja.aceita_retirada then raise exception 'A loja não aceita retirada.'; end if;
  else
    raise exception 'Tipo de pedido inválido.';
  end if;

  insert into contador_pedidos (loja_id, ultimo) values (v_loja.id, 1)
    on conflict (loja_id) do update set ultimo = contador_pedidos.ultimo + 1
    returning ultimo into v_num;
  insert into pedidos (loja_id, numero, cliente_nome, cliente_telefone, tipo, bairro, endereco, pagamento, troco_para, observacao)
    values (v_loja.id, v_num, trim(p_cliente->>'nome'), trim(p_cliente->>'telefone'), v_tipo, v_bairro,
            nullif(trim(p_cliente->>'endereco'), ''), p_cliente->>'pagamento', nullif(p_cliente->>'troco', ''), nullif(p_cliente->>'obs', ''))
    returning id into v_ped;

  for it in select * from jsonb_array_elements(p_itens) loop
    q := (it->>'qtd')::int;
    if q < 1 or q > 99 then raise exception 'Quantidade inválida.'; end if;
    select * into pr from produtos where id = (it->>'produto_id')::uuid and loja_id = v_loja.id and ativo;
    if not found then raise exception 'Um item do carrinho não está mais disponível.'; end if;
    insert into itens_pedido (pedido_id, produto_id, nome, preco_unit, qtd) values (v_ped, pr.id, pr.nome, pr.preco, q);
    v_sub := v_sub + pr.preco * q;
  end loop;

  update pedidos set subtotal = v_sub, taxa_entrega = v_taxa, total = v_sub + v_taxa where id = v_ped;
  return jsonb_build_object('numero', v_num, 'subtotal', v_sub, 'taxa', v_taxa, 'total', v_sub + v_taxa);
end $$;
grant execute on function criar_pedido(text, jsonb, jsonb) to anon, authenticated;
