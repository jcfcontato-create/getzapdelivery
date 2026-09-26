-- Formas de pagamento configuráveis por loja (aba Loja do painel).
-- Antes eram fixas no código (Pix, Dinheiro, Cartão); agora o dono cadastra/edita/exclui.
create table formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  nome text not null,
  aceita_troco boolean not null default false,
  ordem int not null default 0
);
alter table formas_pagamento enable row level security;
create policy "formas_pagamento: leitura pública" on formas_pagamento for select using (true);
create policy "formas_pagamento: equipe gerencia" on formas_pagamento for all
  using (eh_membro(loja_id)) with check (eh_membro(loja_id));
grant select on formas_pagamento to anon, authenticated;
grant insert, update, delete on formas_pagamento to authenticated;

-- Cadastra as 3 formas de pagamento que já existiam fixas no código, para cada loja
-- que ainda não tiver nenhuma forma cadastrada (assim nada quebra no cardápio já publicado).
insert into formas_pagamento (loja_id, nome, aceita_troco, ordem)
select l.id, v.nome, v.aceita_troco, v.ordem
from lojas l
cross join (values ('Pix na entrega', false, 1), ('Dinheiro', true, 2), ('Cartão na entrega', false, 3)) as v(nome, aceita_troco, ordem)
where not exists (select 1 from formas_pagamento f where f.loja_id = l.id);

notify pgrst, 'reload schema';
