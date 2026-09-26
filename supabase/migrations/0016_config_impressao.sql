-- Configurações de impressão por loja (aba Loja, seção "Impressora dos pedidos"):
-- liga/desliga a segunda via para a cozinha (sem preço) e quantas vias com preço saem
-- por pedido (alguns donos de loja querem 2 ou 3 vias).
alter table lojas add column if not exists imprime_via_cozinha boolean not null default true;
alter table lojas add column if not exists vias_impressao smallint not null default 1;
alter table lojas add constraint lojas_vias_impressao_check check (vias_impressao between 1 and 5);

notify pgrst, 'reload schema';
