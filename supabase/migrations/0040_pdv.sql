-- PDV (ponto de venda) no painel: a equipe da loja lança vendas de balcão, retirada,
-- entrega (pedido por telefone) e mesa. Diferenças em relação ao criar_pedido do cardápio:
--  * só a equipe da loja pode usar (login obrigatório);
--  * vale mesmo com a loja fechada no cardápio online ou fora do horário;
--  * aceita desconto manual em R$;
--  * balcão já nasce "entregue" (conta no caixa na hora); os demais entram "em preparo".

alter table pedidos drop constraint if exists pedidos_tipo_check;
alter table pedidos add constraint pedidos_tipo_check check (tipo in ('entrega', 'retirada', 'mesa', 'balcao'));
alter table pedidos add column if not exists origem text not null default 'cardapio';
alter table pedidos drop constraint if exists pedidos_origem_check;
alter table pedidos add constraint pedidos_origem_check check (origem in ('cardapio', 'pdv'));

create or replace function criar_pedido_pdv(p_loja uuid, p_dados jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja lojas; v_ped uuid; v_num int; v_sub numeric := 0; v_taxa numeric := 0; v_desc numeric := 0;
  v_tipo text := coalesce(p_dados->>'tipo', 'balcao');
  v_nome text := nullif(trim(coalesce(p_dados->>'nome', '')), '');
  v_tel text := trim(coalesce(p_dados->>'telefone', '')); v_tel_dig text;
  v_bairro text := nullif(trim(coalesce(p_dados->>'bairro', '')), '');
  v_cidade text := nullif(trim(coalesce(p_dados->>'cidade', '')), '');
  v_end text := nullif(trim(coalesce(p_dados->>'endereco', '')), '');
  v_mesa int; v_status text;
  it jsonb; ad jsonb; pr produtos; q int; v_item_ped uuid;
  v_ad itens_adicionais; v_ad_qtd int; v_ad_total numeric;
begin
  if not eh_membro(p_loja) then raise exception 'Sem acesso a esta loja.'; end if;
  select * into v_loja from lojas where id = p_loja;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if not v_loja.plataforma_ativa then raise exception 'Esta loja está temporariamente indisponível.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'A venda está vazia.'; end if;

  if v_tipo = 'balcao' then
    v_status := 'entregue'; v_bairro := null; v_cidade := null; v_end := null;
  elsif v_tipo = 'retirada' then
    v_status := 'em_preparo'; v_bairro := null; v_cidade := null; v_end := null;
  elsif v_tipo = 'mesa' then
    v_status := 'em_preparo'; v_bairro := null; v_cidade := null; v_end := null;
    if coalesce(p_dados->>'mesa', '') !~ '^[0-9]{1,6}$' then raise exception 'Informe o número da mesa.'; end if;
    v_mesa := (p_dados->>'mesa')::int;
  elsif v_tipo = 'entrega' then
    v_status := 'em_preparo';
    if v_nome is null then raise exception 'Informe o nome do cliente.'; end if;
    if regexp_replace(v_tel, '\D', '', 'g') = '' then raise exception 'Informe o telefone do cliente.'; end if;
    if v_end is null then raise exception 'Informe o endereço de entrega.'; end if;
    select taxa, cidade into v_taxa, v_cidade from zonas_entrega
      where loja_id = v_loja.id and bairro = v_bairro and (v_cidade is null or cidade = v_cidade)
      order by cidade limit 1;
    if not found then raise exception 'Escolha um bairro atendido.'; end if;
  else
    raise exception 'Tipo de venda inválido.';
  end if;
  if coalesce(trim(p_dados->>'pagamento'), '') = '' then raise exception 'Escolha a forma de pagamento.'; end if;

  insert into contador_pedidos (loja_id, ultimo) values (v_loja.id, 1)
    on conflict (loja_id) do update set ultimo = contador_pedidos.ultimo + 1
    returning ultimo into v_num;
  insert into pedidos (loja_id, numero, cliente_nome, cliente_telefone, tipo, mesa, cidade, bairro, endereco, pagamento, troco_para, observacao, status, origem)
    values (v_loja.id, v_num, coalesce(v_nome, case when v_tipo = 'mesa' then 'Mesa ' || v_mesa else 'Balcão' end), v_tel, v_tipo, v_mesa, v_cidade, v_bairro, v_end,
            trim(p_dados->>'pagamento'), nullif(trim(coalesce(p_dados->>'troco', '')), ''), nullif(trim(coalesce(p_dados->>'obs', '')), ''), v_status, 'pdv')
    returning id into v_ped;

  for it in select * from jsonb_array_elements(p_itens) loop
    q := (it->>'qtd')::int;
    if q is null or q < 1 or q > 999 then raise exception 'Quantidade inválida.'; end if;
    -- No PDV dá para vender também itens ocultos no cardápio (ex.: acabou o estoque online)
    select * into pr from produtos where id = (it->>'produto_id')::uuid and loja_id = v_loja.id;
    if not found then raise exception 'Produto não encontrado.'; end if;
    v_ad_total := 0;
    insert into itens_pedido (pedido_id, produto_id, nome, preco_unit, qtd)
      values (v_ped, pr.id, pr.nome, pr.preco, q) returning id into v_item_ped;
    for ad in select * from jsonb_array_elements(coalesce(it->'adicionais', '[]'::jsonb)) loop
      v_ad_qtd := coalesce((ad->>'qtd')::int, 1);
      if v_ad_qtd < 1 or v_ad_qtd > 99 then raise exception 'Quantidade de adicional inválida.'; end if;
      select a.* into v_ad from itens_adicionais a join grupos_adicionais g on g.id = a.grupo_id
        where a.id = (ad->>'item_id')::uuid and g.loja_id = v_loja.id;
      if not found then raise exception 'Adicional inválido para esta loja.'; end if;
      v_ad_total := v_ad_total + v_ad.preco * v_ad_qtd;
      insert into itens_pedido_adicionais (item_pedido_id, nome, preco_unit, qtd) values (v_item_ped, v_ad.nome, v_ad.preco, v_ad_qtd);
    end loop;
    update itens_pedido set preco_unit = pr.preco + v_ad_total where id = v_item_ped;
    v_sub := v_sub + (pr.preco + v_ad_total) * q;
  end loop;

  v_desc := greatest(0, least(coalesce((p_dados->>'desconto')::numeric, 0), v_sub + v_taxa));
  update pedidos set subtotal = v_sub, taxa_entrega = v_taxa, desconto = v_desc, total = v_sub + v_taxa - v_desc where id = v_ped;

  v_tel_dig := regexp_replace(v_tel, '\D', '', 'g');
  if v_tel_dig <> '' and v_nome is not null then
    insert into clientes_loja (loja_id, telefone, nome, tipo, cidade, bairro, pagamento, atualizado_em)
      values (v_loja.id, v_tel_dig, v_nome, case when v_tipo in ('entrega', 'retirada') then v_tipo end, v_cidade, v_bairro, p_dados->>'pagamento', now())
      on conflict (loja_id, telefone) do update set
        nome = excluded.nome,
        tipo = coalesce(excluded.tipo, clientes_loja.tipo),
        cidade = case when excluded.bairro is not null then excluded.cidade else clientes_loja.cidade end,
        bairro = coalesce(excluded.bairro, clientes_loja.bairro),
        pagamento = excluded.pagamento, atualizado_em = now();
  end if;

  return jsonb_build_object('id', v_ped, 'numero', v_num, 'subtotal', v_sub, 'taxa', v_taxa, 'desconto', v_desc, 'total', v_sub + v_taxa - v_desc, 'status', v_status);
end $$;
revoke all on function criar_pedido_pdv(uuid, jsonb, jsonb) from public, anon;
grant execute on function criar_pedido_pdv(uuid, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
