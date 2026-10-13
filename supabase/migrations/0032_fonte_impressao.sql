-- Tamanho da fonte do cupom impresso (em pixels; 13 = normal), escolhido na aba Loja.
alter table lojas add column if not exists fonte_impressao smallint not null default 13
  check (fonte_impressao between 10 and 22);
notify pgrst, 'reload schema';
