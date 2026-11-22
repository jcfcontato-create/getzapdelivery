-- Por produto, o dono escolhe se o cliente pode escrever "Observações" no item
-- (ex.: lanches sim; bebidas não). Começa ligado.
alter table produtos add column if not exists permite_observacao boolean not null default true;
