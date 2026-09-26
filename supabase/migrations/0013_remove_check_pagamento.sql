-- Agora as formas de pagamento são cadastradas livremente pelo dono da loja (aba Loja),
-- então a coluna "pagamento" do pedido deixa de aceitar só 'dinheiro'/'cartao'/'pix'
-- e passa a guardar o nome exato cadastrado (ex.: "Pix chave CPF 41468757814 CAIXA").
alter table pedidos drop constraint if exists pedidos_pagamento_check;

notify pgrst, 'reload schema';
