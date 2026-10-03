-- Monitor de pedidos prontos (tela da cozinha/balcão em /monitor).
-- Pedidos de mesa e retirada ganham a etapa "pronto" entre "em preparo" e "entregue".
alter table pedidos drop constraint if exists pedidos_status_check;
alter table pedidos add constraint pedidos_status_check
  check (status in ('novo', 'em_preparo', 'pronto', 'saiu_para_entrega', 'entregue', 'cancelado'));

-- Hora em que o pedido ficou pronto (o monitor mostra o mais recente em destaque).
alter table pedidos add column if not exists pronto_em timestamptz;

create or replace function marcar_pronto_em() returns trigger
language plpgsql as $$
begin
  if new.status = 'pronto' and (tg_op = 'INSERT' or old.status is distinct from 'pronto') then
    new.pronto_em := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_pedidos_pronto_em on pedidos;
create trigger trg_pedidos_pronto_em before insert or update of status on pedidos
  for each row execute function marcar_pronto_em();

notify pgrst, 'reload schema';
