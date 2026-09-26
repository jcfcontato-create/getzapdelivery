-- Guarda o nome da impressora escolhida pelo dono (só uma anotação: quem
-- realmente imprime é a impressora padrão configurada no computador da loja).
alter table lojas add column if not exists impressora text;
notify pgrst, 'reload schema';
