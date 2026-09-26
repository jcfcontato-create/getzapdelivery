-- Adicionais dos produtos (ex.: "Escolha o sabor", "Adicionais extras").
-- Um grupo de adicionais é cadastrado uma vez e pode ser usado em vários produtos.
-- tipo 'unica'   = o cliente escolhe só 1 opção do grupo.
-- tipo 'multipla' = o cliente pode escolher várias opções, até o limite em "maximo"
--                    (maximo = null quer dizer sem limite).
create table grupos_adicionais (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  nome text not null,
  tipo text not null default 'unica' check (tipo in ('unica', 'multipla')),
  obrigatorio boolean not null default false,
  maximo int check (maximo is null or maximo > 0),
  ordem int not null default 0
);

-- Itens dentro de um grupo (ex.: "Bacon extra", "Calabresa").
-- permite_quantidade: se marcado, o cliente pode pedir mais de 1 unidade desse item
-- (ex.: 2x bacon), até quantidade_maxima.
create table itens_adicionais (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos_adicionais on delete cascade,
  nome text not null,
  preco numeric(10,2) not null default 0 check (preco >= 0),
  permite_quantidade boolean not null default false,
  quantidade_maxima int not null default 1 check (quantidade_maxima >= 1),
  ativo boolean not null default true,
  ordem int not null default 0
);

-- Liga um grupo de adicionais a um produto (um grupo pode servir vários produtos).
create table produto_grupos_adicionais (
  produto_id uuid not null references produtos on delete cascade,
  grupo_id uuid not null references grupos_adicionais on delete cascade,
  primary key (produto_id, grupo_id)
);

-- Guarda quais adicionais o cliente escolheu em cada item do pedido (para o painel e o cupom).
create table itens_pedido_adicionais (
  id uuid primary key default gen_random_uuid(),
  item_pedido_id uuid not null references itens_pedido on delete cascade,
  nome text not null,
  preco_unit numeric(10,2) not null,
  qtd int not null check (qtd > 0)
);

alter table grupos_adicionais enable row level security;
alter table itens_adicionais enable row level security;
alter table produto_grupos_adicionais enable row level security;
alter table itens_pedido_adicionais enable row level security;

create policy "grupos_adicionais: leitura pública" on grupos_adicionais for select using (true);
create policy "grupos_adicionais: equipe gerencia" on grupos_adicionais for all
  using (eh_membro(loja_id)) with check (eh_membro(loja_id));

create policy "itens_adicionais: leitura" on itens_adicionais for select
  using (ativo or eh_membro((select g.loja_id from grupos_adicionais g where g.id = grupo_id)));
create policy "itens_adicionais: equipe gerencia" on itens_adicionais for all
  using (eh_membro((select g.loja_id from grupos_adicionais g where g.id = grupo_id)))
  with check (eh_membro((select g.loja_id from grupos_adicionais g where g.id = grupo_id)));

create policy "produto_grupos_adicionais: leitura pública" on produto_grupos_adicionais for select using (true);
create policy "produto_grupos_adicionais: equipe gerencia" on produto_grupos_adicionais for all
  using (eh_membro((select p.loja_id from produtos p where p.id = produto_id)))
  with check (eh_membro((select p.loja_id from produtos p where p.id = produto_id)));

create policy "itens_pedido_adicionais: equipe vê" on itens_pedido_adicionais for select
  using (exists (
    select 1 from itens_pedido ip join pedidos p on p.id = ip.pedido_id
    where ip.id = item_pedido_id and eh_membro(p.loja_id)
  ));

grant select on grupos_adicionais, itens_adicionais, produto_grupos_adicionais to anon, authenticated;
grant insert, update, delete on grupos_adicionais, itens_adicionais, produto_grupos_adicionais to authenticated;
grant select on itens_pedido_adicionais to authenticated;

-- Recria criar_pedido para validar e cobrar os adicionais escolhidos no servidor
-- (o navegador nunca decide preço). Cada item do carrinho agora pode trazer:
-- { produto_id, qtd, adicionais: [{ item_id, qtd }] }
create or replace function criar_pedido(p_slug text, p_cliente jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja lojas; v_ped uuid; v_num int; v_sub numeric := 0; v_taxa numeric := 0;
  v_tipo text := p_cliente->>'tipo'; v_bairro text := nullif(p_cliente->>'bairro', '');
  it jsonb; pr produtos; q int; v_item_ped uuid;
  ad jsonb; v_ad_item itens_adicionais; v_grupo grupos_adicionais;
  v_ad_qtd int; v_ad_total numeric; v_linha_total numeric;
  v_grupo_ids uuid[]; v_grupo_somas int[]; idx int;
  v_grupo_rec record; v_soma int;
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

  create temp table if not exists tmp_ads (grupo_id uuid, item_id uuid, nome text, preco numeric, qtd int) on commit drop;

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

    delete from tmp_ads where true;
    v_ad_total := 0; v_grupo_ids := '{}'; v_grupo_somas := '{}';

    for ad in select * from jsonb_array_elements(coalesce(it->'adicionais', '[]'::jsonb)) loop
      v_ad_qtd := coalesce((ad->>'qtd')::int, 1);
      if v_ad_qtd < 1 then raise exception 'Quantidade de adicional inválida.'; end if;
      select * into v_ad_item from itens_adicionais where id = (ad->>'item_id')::uuid and ativo;
      if not found then raise exception 'Um adicional escolhido não está mais disponível.'; end if;
      select * into v_grupo from grupos_adicionais where id = v_ad_item.grupo_id and loja_id = v_loja.id;
      if not found then raise exception 'Adicional inválido para esta loja.'; end if;
      if not exists (select 1 from produto_grupos_adicionais where produto_id = pr.id and grupo_id = v_grupo.id) then
        raise exception 'Esse adicional não está disponível para "%".', pr.nome;
      end if;
      if not v_ad_item.permite_quantidade and v_ad_qtd <> 1 then
        raise exception 'O adicional "%" não permite escolher quantidade.', v_ad_item.nome;
      end if;
      if v_ad_qtd > v_ad_item.quantidade_maxima then
        raise exception 'Quantidade máxima do adicional "%": %.', v_ad_item.nome, v_ad_item.quantidade_maxima;
      end if;

      idx := array_position(v_grupo_ids, v_grupo.id);
      if idx is null then
        v_grupo_ids := v_grupo_ids || v_grupo.id;
        v_grupo_somas := v_grupo_somas || v_ad_qtd;
      else
        v_grupo_somas[idx] := v_grupo_somas[idx] + v_ad_qtd;
      end if;
      v_ad_total := v_ad_total + v_ad_item.preco * v_ad_qtd;
      insert into tmp_ads values (v_grupo.id, v_ad_item.id, v_ad_item.nome, v_ad_item.preco, v_ad_qtd);
    end loop;

    for v_grupo_rec in
      select g.id, g.nome, g.tipo, g.maximo, g.obrigatorio
      from produto_grupos_adicionais pg join grupos_adicionais g on g.id = pg.grupo_id
      where pg.produto_id = pr.id
    loop
      idx := array_position(v_grupo_ids, v_grupo_rec.id);
      v_soma := coalesce(v_grupo_somas[idx], 0);
      if v_grupo_rec.tipo = 'unica' then
        if v_soma > 1 then raise exception 'Escolha só 1 opção em "%".', v_grupo_rec.nome; end if;
        if v_grupo_rec.obrigatorio and v_soma <> 1 then raise exception 'Escolha uma opção em "%".', v_grupo_rec.nome; end if;
      else
        if v_grupo_rec.maximo is not null and v_soma > v_grupo_rec.maximo then
          raise exception 'Limite de "%": até %.', v_grupo_rec.nome, v_grupo_rec.maximo;
        end if;
        if v_grupo_rec.obrigatorio and v_soma < 1 then raise exception 'Escolha ao menos 1 opção em "%".', v_grupo_rec.nome; end if;
      end if;
    end loop;

    v_linha_total := (pr.preco + v_ad_total) * q;
    insert into itens_pedido (pedido_id, produto_id, nome, preco_unit, qtd)
      values (v_ped, pr.id, pr.nome, pr.preco + v_ad_total, q) returning id into v_item_ped;
    insert into itens_pedido_adicionais (item_pedido_id, nome, preco_unit, qtd)
      select v_item_ped, nome, preco, qtd from tmp_ads;
    v_sub := v_sub + v_linha_total;
  end loop;

  update pedidos set subtotal = v_sub, taxa_entrega = v_taxa, total = v_sub + v_taxa where id = v_ped;
  return jsonb_build_object('numero', v_num, 'subtotal', v_sub, 'taxa', v_taxa, 'total', v_sub + v_taxa);
end $$;
grant execute on function criar_pedido(text, jsonb, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
