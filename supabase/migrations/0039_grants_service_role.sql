-- As Edge Functions usam o papel service_role, que neste projeto não tinha permissão de
-- escrita em várias tabelas (ex.: formas_pagamento ficava vazia nas lojas novas).
-- O service_role só existe no servidor (nunca no navegador), então é seguro liberar.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Lojas criadas sem formas de pagamento por causa disso recebem as padrão
insert into formas_pagamento (loja_id, nome, aceita_troco, ordem)
select l.id, f.nome, f.troco, f.ordem
from lojas l
cross join (values ('Pix', false, 1), ('Dinheiro', true, 2), ('Cartão na entrega', false, 3)) as f(nome, troco, ordem)
where not exists (select 1 from formas_pagamento x where x.loja_id = l.id);
