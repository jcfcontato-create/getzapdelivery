-- Neste projeto as tabelas novas não recebem permissão automática para os papéis da API.
-- Sem estes grants, o painel recebia "permission denied for table precificacao_config".
-- O acesso continua limitado pelas políticas RLS (só a equipe da própria loja).
grant select, insert, update, delete on precificacao_config, custos_fixos, insumos, fichas_tecnicas, ficha_itens to authenticated;
grant all on precificacao_config, custos_fixos, insumos, fichas_tecnicas, ficha_itens to service_role;
