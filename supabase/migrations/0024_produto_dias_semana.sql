-- Permite marcar que um produto só fica à venda em dias específicos da semana
-- (ex.: feijoada só no sábado). dias_semana = null (padrão) significa "todos os dias",
-- igual sempre foi até aqui. 0 = domingo, 1 = segunda, ... 6 = sábado, mesma numeração
-- já usada em horarios_funcionamento.
alter table produtos add column dias_semana smallint[];
alter table produtos add constraint produtos_dias_semana_valido
  check (dias_semana is null or dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]);

-- Revalida no servidor na hora de fechar o pedido (além do cardápio já não mostrar o
-- produto fora do dia marcado), para o caso de o cliente estar com a página aberta
-- desde um dia anterior. Cópia de criar_pedido (0019_painel_admin_plataforma.sql) com
-- só essa checagem adicionada dentro do loop de itens.
create or replace function criar_pedido(p_slug text, p_cliente jsonb, p_itens jsonb, p_cupom_codigo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja lojas; v_ped uuid; v_num int; v_sub numeric := 0; v_taxa numeric := 0;
  v_tipo text := p_cliente->>'tipo'; v_bairro text := nullif(p_cliente->>'bairro', '');
  v_telefone text := trim(p_cliente->>'telefone'); v_telefone_digits text;
  it jsonb; pr produtos; q int; v_item_ped uuid;
  ad jsonb; v_ad_item itens_adicionais; v_grupo grupos_adicionais;
  v_ad_qtd int; v_ad_total numeric; v_linha_total numeric;
  v_grupo_ids uuid[]; v_grupo_somas int[]; idx int;
  v_grupo_rec record; v_soma int;
  v_cup cupons; v_elegivel numeric := 0; v_no_escopo boolean; v_desconto numeric := 0;
  v_usos_total int; v_usos_cliente int;
  v_agora_local timestamp; v_dia_semana int; v_hora_atual time; v_hor horarios_funcionamento;
begin
  select * into v_loja from lojas where slug = p_slug;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if not v_loja.plataforma_ativa then raise exception 'Esta loja está temporariamente indisponível.'; end if;
  if not v_loja.aberta then raise exception 'A loja está fechada no momento.'; end if;

  v_agora_local := now() at time zone 'America/Sao_Paulo';
  v_dia_semana := extract(dow from v_agora_local)::int;
  v_hora_atual := v_agora_local::time;
  select * into v_hor from horarios_funcionamento where loja_id = v_loja.id and dia_semana = v_dia_semana;
  if found then
    if v_hor.fechado then
      raise exception 'A loja está fechada hoje (fora do horário de funcionamento).';
    end if;
    if v_hor.abre is not null and v_hor.fecha is not null and (v_hora_atual < v_hor.abre or v_hora_atual > v_hor.fecha) then
      raise exception 'A loja está fechada agora. Horário de hoje: % às %.', to_char(v_hor.abre, 'HH24:MI'), to_char(v_hor.fecha, 'HH24:MI');
    end if;
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'O carrinho está vazio.'; end if;
  if coalesce(trim(p_cliente->>'nome'), '') = '' or v_telefone = '' then
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

  if nullif(trim(p_cupom_codigo), '') is not null then
    select * into v_cup from cupons
      where loja_id = v_loja.id and upper(codigo) = upper(trim(p_cupom_codigo)) and ativo;
    if not found then raise exception 'Cupom inválido.'; end if;
    if v_cup.valido_de is not null and current_date < v_cup.valido_de then raise exception 'Cupom ainda não é válido.'; end if;
    if v_cup.valido_ate is not null and current_date > v_cup.valido_ate then raise exception 'Cupom expirado.'; end if;
    if v_cup.limite_uso_total is not null then
      select count(*) into v_usos_total from cupom_usos where cupom_id = v_cup.id;
      if v_usos_total >= v_cup.limite_uso_total then raise exception 'Cupom esgotado.'; end if;
    end if;
    if v_cup.limite_uso_por_cliente is not null then
      select count(*) into v_usos_cliente from cupom_usos where cupom_id = v_cup.id and telefone = v_telefone;
      if v_usos_cliente >= v_cup.limite_uso_por_cliente then raise exception 'Você já usou esse cupom o máximo de vezes permitido.'; end if;
    end if;
  end if;

  create temp table if not exists tmp_ads (grupo_id uuid, item_id uuid, nome text, preco numeric, qtd int) on commit drop;

  insert into contador_pedidos (loja_id, ultimo) values (v_loja.id, 1)
    on conflict (loja_id) do update set ultimo = contador_pedidos.ultimo + 1
    returning ultimo into v_num;
  insert into pedidos (loja_id, numero, cliente_nome, cliente_telefone, tipo, bairro, endereco, pagamento, troco_para, observacao)
    values (v_loja.id, v_num, trim(p_cliente->>'nome'), v_telefone, v_tipo, v_bairro,
            nullif(trim(p_cliente->>'endereco'), ''), p_cliente->>'pagamento', nullif(p_cliente->>'troco', ''), nullif(p_cliente->>'obs', ''))
    returning id into v_ped;

  for it in select * from jsonb_array_elements(p_itens) loop
    q := (it->>'qtd')::int;
    if q < 1 or q > 99 then raise exception 'Quantidade inválida.'; end if;
    select * into pr from produtos where id = (it->>'produto_id')::uuid and loja_id = v_loja.id and ativo;
    if not found then raise exception 'Um item do carrinho não está mais disponível.'; end if;
    if pr.dias_semana is not null and not (v_dia_semana = any(pr.dias_semana)) then
      raise exception 'O item "%" não está disponível hoje.', pr.nome;
    end if;

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

    if v_cup.id is not null and v_cup.aplica_em = 'produtos' then
      v_no_escopo := exists (select 1 from cupom_produtos where cupom_id = v_cup.id and produto_id = pr.id)
        or exists (select 1 from cupom_categorias where cupom_id = v_cup.id and categoria_id = pr.categoria_id);
      if v_no_escopo then v_elegivel := v_elegivel + pr.preco * q; end if;
    end if;
  end loop;

  if v_cup.id is not null then
    if v_cup.tipo = 'frete_gratis' then
      v_desconto := v_taxa;
    elsif v_cup.aplica_em = 'produtos' then
      if v_elegivel = 0 then raise exception 'Esse cupom vale só para produtos específicos que não estão no seu carrinho.'; end if;
      v_desconto := case v_cup.tipo when 'percentual' then round(v_elegivel * v_cup.valor / 100, 2) else least(v_cup.valor, v_elegivel) end;
    else
      v_desconto := case v_cup.tipo when 'percentual' then round(v_sub * v_cup.valor / 100, 2) else least(v_cup.valor, v_sub) end;
    end if;
    insert into cupom_usos (cupom_id, pedido_id, telefone) values (v_cup.id, v_ped, v_telefone);
  end if;

  update pedidos set subtotal = v_sub, taxa_entrega = v_taxa, desconto = v_desconto,
    cupom_codigo = v_cup.codigo, total = greatest(v_sub + v_taxa - v_desconto, 0)
    where id = v_ped;

  v_telefone_digits := regexp_replace(v_telefone, '\D', '', 'g');
  if v_telefone_digits <> '' then
    insert into clientes_loja (loja_id, telefone, nome, tipo, bairro, rua, numero, complemento, pagamento, atualizado_em)
      values (v_loja.id, v_telefone_digits, trim(p_cliente->>'nome'), v_tipo, v_bairro,
              nullif(p_cliente->>'rua', ''), nullif(p_cliente->>'numero', ''), nullif(p_cliente->>'complemento', ''),
              p_cliente->>'pagamento', now())
      on conflict (loja_id, telefone) do update set
        nome = excluded.nome, tipo = excluded.tipo,
        bairro = coalesce(excluded.bairro, clientes_loja.bairro),
        rua = coalesce(excluded.rua, clientes_loja.rua),
        numero = coalesce(excluded.numero, clientes_loja.numero),
        complemento = excluded.complemento,
        pagamento = excluded.pagamento,
        atualizado_em = now();
  end if;

  return jsonb_build_object('numero', v_num, 'subtotal', v_sub, 'taxa', v_taxa, 'desconto', v_desconto, 'total', greatest(v_sub + v_taxa - v_desconto, 0));
end $$;
grant execute on function criar_pedido(text, jsonb, jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';
