-- WhatsApp e endereço são os reais da Adega. Produtos, preços e bairros abaixo são EXEMPLOS:
-- troque pelos dados reais antes de divulgar.
insert into lojas (slug, nome, whatsapp, endereco)
values ('adega-sos', 'Adega e Restaurante S.O.S', '5511940104824', 'Rua Major Murzilho, 93, Centro, Bom Jesus dos Perdões - SP');

do $$
declare l uuid; b uuid; r uuid;
begin
  select id into l from lojas where slug = 'adega-sos';
  insert into categorias (loja_id, nome, ordem) values (l, 'Bebidas', 1) returning id into b;
  insert into categorias (loja_id, nome, ordem) values (l, 'Refeições', 2) returning id into r;
  insert into produtos (loja_id, categoria_id, nome, descricao, preco, ordem) values
    (l, b, 'Cerveja long neck (exemplo)', '355 ml, gelada', 9.00, 1),
    (l, b, 'Refrigerante lata (exemplo)', '350 ml', 6.00, 2),
    (l, r, 'Prato executivo (exemplo)', 'Arroz, feijão, mistura e salada', 28.00, 1),
    (l, r, 'Porção de batata (exemplo)', 'Serve duas pessoas', 32.00, 2);
  insert into zonas_entrega (loja_id, bairro, taxa) values (l, 'Centro (exemplo)', 5.00), (l, 'Bairro vizinho (exemplo)', 8.00);
end $$;
